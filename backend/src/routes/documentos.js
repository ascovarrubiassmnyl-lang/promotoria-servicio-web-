import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { authenticate, tieneRolAdmin } from '../middleware/auth.js';
import { UPLOADS_DIR, MODO_ALMACENAMIENTO, persistir, guardarBuffer, abrir, borrar, listar } from '../services/almacenamiento.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('clientes'));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 35 * 1024 * 1024 } }); // 35 MB máx
// La recuperación compara nombres y escribe sobre claves ya existentes: en
// memoria basta (el frontend manda de 10 en 10).
const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 35 * 1024 * 1024, files: 20 } });

const MSG_PERDIDO = 'Este archivo ya no está en el servidor (se perdió en una actualización del sistema). Vuelve a subirlo desde "Recuperar archivos perdidos".';
const nombreUtf8 = (f) => Buffer.from(f.originalname, 'latin1').toString('utf8');

// ASESOR solo accede a documentos de sus propios clientes
async function verificarAccesoCliente(req, clienteId) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return { error: 'Cliente no encontrado', status: 404 };
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) {
    return { error: 'Sin acceso a este cliente', status: 403 };
  }
  return { cliente };
}

// ── Recuperación de archivos perdidos (2026-10-15) ─────────────────────────
// Los archivos subidos antes de tener bucket se borraron en un deploy, pero sus
// registros siguen en la base (nombre original incluido). Para no volver a
// capturar nada, se re-suben los PDF de la computadora y se re-vinculan SOLOS
// por nombre de archivo exacto, sobre la misma clave: la ficha, la póliza y
// los enlaces quedan como estaban.
//
// Alcance: un ASESOR solo ve/recupera documentos de sus clientes; con alcance
// de administración, todos (la secretaria subió los de toda la promotoría).
function whereAlcance(req) {
  return tieneRolAdmin(req.user) ? {} : { cliente: { asesorId: req.user.id } };
}

async function documentosPerdidos(req) {
  const [docs, existentes] = await Promise.all([
    prisma.documentoCliente.findMany({
      where: whereAlcance(req),
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true, nombre: true, archivo: true, mime: true, tamano: true, creadoEn: true, ventaId: true,
        cliente: { select: { id: true, nombre: true, apellidoP: true } },
        asesor: { select: { nombre: true, apellidoP: true } },
      },
    }),
    listar(),
  ]);
  const perdidos = docs.filter((d) => !existentes.has(path.basename(d.archivo)));
  const bytes = docs.reduce((t, d) => t + (existentes.get(path.basename(d.archivo)) || 0), 0);
  return { docs, perdidos, bytes };
}

router.get('/perdidos', asyncHandler(async (req, res) => {
  const { docs, perdidos, bytes } = await documentosPerdidos(req);
  res.json({
    almacenamiento: MODO_ALMACENAMIENTO,
    total: docs.length,
    bytesGuardados: bytes,
    perdidos: perdidos.map(({ archivo, ...d }) => d),
  });
}));

router.post('/recuperar', uploadMemoria.array('archivos', 20), asyncHandler(async (req, res) => {
  const archivos = req.files || [];
  if (!archivos.length) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const { perdidos } = await documentosPerdidos(req);
  const porNombre = new Map();
  for (const d of perdidos) {
    const k = d.nombre.normalize('NFC');
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(d);
  }
  const recuperados = [];
  const sinCoincidencia = [];
  for (const f of archivos) {
    const nombre = nombreUtf8(f).normalize('NFC');
    const destinos = porNombre.get(nombre);
    if (!destinos?.length) { sinCoincidencia.push(nombre); continue; }
    // Un mismo PDF puede estar adjunto a dos clientes: se restaura en ambos.
    for (const d of destinos) {
      await guardarBuffer(d.archivo, f.buffer, d.mime || f.mimetype);
      if (!d.tamano) await prisma.documentoCliente.update({ where: { id: d.id }, data: { tamano: f.size } });
      recuperados.push({ id: d.id, nombre: d.nombre, cliente: d.cliente });
    }
    porNombre.delete(nombre);
  }
  res.json({ recuperados, sinCoincidencia });
}));

// Re-subir UN archivo perdido aunque el nombre no coincida (lo eligió la
// persona a mano desde el visor). Escribe sobre la misma clave.
router.post('/:id/reemplazar', uploadMemoria.single('archivo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const doc = await prisma.documentoCliente.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const acceso = await verificarAccesoCliente(req, doc.clienteId);
  if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
  await guardarBuffer(doc.archivo, req.file.buffer, req.file.mimetype || doc.mime);
  const actualizado = await prisma.documentoCliente.update({
    where: { id: doc.id },
    data: { tamano: req.file.size, mime: req.file.mimetype || doc.mime },
  });
  res.json(actualizado);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { clienteId } = req.query;
  if (!clienteId) return res.status(400).json({ error: 'clienteId es requerido' });
  const acceso = await verificarAccesoCliente(req, clienteId);
  if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
  const docs = await prisma.documentoCliente.findMany({
    where: { clienteId },
    orderBy: { creadoEn: 'desc' },
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  res.json(docs);
}));

router.post('/', upload.single('archivo'), asyncHandler(async (req, res) => {
  const { clienteId } = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  if (!clienteId) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'clienteId es requerido' });
  }
  const acceso = await verificarAccesoCliente(req, clienteId);
  if (acceso.error) {
    fs.unlink(req.file.path, () => {});
    return res.status(acceso.status).json({ error: acceso.error });
  }
  // multer entrega originalname en latin1; lo reinterpretamos como UTF-8 (acentos, ñ)
  const nombreOriginal = nombreUtf8(req.file);
  await persistir(req.file.filename, req.file.mimetype);
  const doc = await prisma.documentoCliente.create({
    data: {
      clienteId,
      asesorId: req.user.id,
      nombre: nombreOriginal,
      archivo: req.file.filename,
      mime: req.file.mimetype || null,
      tamano: req.file.size || 0,
    },
  });
  res.status(201).json(doc);
}));

router.get('/:id/descargar', asyncHandler(async (req, res) => {
  const doc = await prisma.documentoCliente.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const acceso = await verificarAccesoCliente(req, doc.clienteId);
  if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
  const stream = await abrir(doc.archivo);
  if (!stream) return res.status(410).json({ error: MSG_PERDIDO, perdido: true });
  if (doc.mime) res.type(doc.mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombre)}`);
  stream.pipe(res);
}));

// Previsualización: mismo archivo que /descargar pero servido inline, para que
// el visor de la ficha lo muestre en vez de dispararle una descarga al usuario.
router.get('/:id/ver', asyncHandler(async (req, res) => {
  const doc = await prisma.documentoCliente.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const acceso = await verificarAccesoCliente(req, doc.clienteId);
  if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
  const stream = await abrir(doc.archivo);
  if (!stream) return res.status(410).json({ error: MSG_PERDIDO, perdido: true });
  if (doc.mime) res.type(doc.mime);
  // El nombre va en filename por si el usuario elige guardar desde el visor.
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.nombre)}`);
  stream.pipe(res);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const doc = await prisma.documentoCliente.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const acceso = await verificarAccesoCliente(req, doc.clienteId);
  if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
  await prisma.documentoCliente.delete({ where: { id: doc.id } });
  await borrar(doc.archivo);
  res.json({ ok: true });
}));

export default router;
