import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand,
  DeleteObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';

// Almacenamiento de los archivos subidos (documentos de clientes y pólizas).
//
// Por qué existe (2026-10-15, bug real): los archivos vivían en
// backend/uploads/ del contenedor de Railway, que es EFÍMERO — cada deploy
// arranca un disco nuevo y vacío. La secretaria subió 75 carátulas el 12-oct y
// el deploy del 13-oct las borró todas; la base seguía con sus registros y el
// visor respondía 410. Ahora, si hay bucket configurado (variables que Railway
// inyecta al conectar un Bucket: BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY,
// ENDPOINT, REGION), el archivo se guarda ahí y sobrevive a cualquier deploy.
// Sin bucket (desarrollo) se queda en disco, como siempre.
//
// La clave del objeto es exactamente `DocumentoCliente.archivo` (el nombre
// físico aleatorio que ya se generaba), así que la base no cambia.
//
// multer sigue escribiendo primero a UPLOADS_DIR (sirve como carpeta temporal
// y como almacén en modo disco); `persistir()` sube al bucket y borra la copia
// local.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const BUCKET = process.env.BUCKET;
const s3 = BUCKET && process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY
  ? new S3Client({
    endpoint: process.env.ENDPOINT,
    region: process.env.REGION || 'auto',
    credentials: { accessKeyId: process.env.ACCESS_KEY_ID, secretAccessKey: process.env.SECRET_ACCESS_KEY },
    forcePathStyle: process.env.BUCKET_PATH_STYLE === 'true',
  })
  : null;

export const MODO_ALMACENAMIENTO = s3 ? 'bucket' : 'disco';

// Aviso fuerte al arrancar: en producción, disco = se pierde en el próximo deploy.
if (!s3 && process.env.NODE_ENV === 'production' && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  console.error('[almacenamiento] ⚠️  Sin bucket ni volumen: los archivos subidos se BORRARÁN en el próximo deploy. Conecta un Bucket de Railway al servicio.');
}

const clave = (archivo) => path.basename(String(archivo));
const rutaLocal = (archivo) => path.join(UPLOADS_DIR, clave(archivo));

function esNoEncontrado(e) {
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

// Mueve un archivo ya escrito por multer a su destino definitivo.
export async function persistir(archivo, mime) {
  if (!s3) return;
  const ruta = rutaLocal(archivo);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: clave(archivo), Body: fs.readFileSync(ruta),
    ContentType: mime || undefined,
  }));
  fs.unlink(ruta, () => {});
}

// Guarda un buffer bajo una clave (recuperación de archivos perdidos).
export async function guardarBuffer(archivo, buffer, mime) {
  if (!s3) { fs.writeFileSync(rutaLocal(archivo), buffer); return; }
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: clave(archivo), Body: buffer, ContentType: mime || undefined }));
}

export async function existe(archivo) {
  if (!s3) return fs.existsSync(rutaLocal(archivo));
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: clave(archivo) }));
    return true;
  } catch (e) {
    if (esNoEncontrado(e)) return false;
    throw e;
  }
}

// Stream legible del archivo, o null si ya no existe.
export async function abrir(archivo) {
  if (!s3) {
    const ruta = rutaLocal(archivo);
    return fs.existsSync(ruta) ? fs.createReadStream(ruta) : null;
  }
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: clave(archivo) }));
    return r.Body;
  } catch (e) {
    if (esNoEncontrado(e)) return null;
    throw e;
  }
}

export async function leerBuffer(archivo) {
  const stream = await abrir(archivo);
  if (!stream) return null;
  const partes = [];
  for await (const p of stream) partes.push(p);
  return Buffer.concat(partes);
}

export async function borrar(archivo) {
  if (!s3) { fs.unlink(rutaLocal(archivo), () => {}); return; }
  try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: clave(archivo) })); } catch (e) {
    console.warn(`[almacenamiento] no se pudo borrar ${clave(archivo)}: ${e.message}`);
  }
}

// Todas las claves existentes con su tamaño (para detectar perdidos y medir uso).
export async function listar() {
  const mapa = new Map();
  if (!s3) {
    for (const f of fs.readdirSync(UPLOADS_DIR)) {
      const st = fs.statSync(path.join(UPLOADS_DIR, f));
      if (st.isFile()) mapa.set(f, st.size);
    }
    return mapa;
  }
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }));
    for (const o of r.Contents || []) mapa.set(o.Key, o.Size || 0);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return mapa;
}
