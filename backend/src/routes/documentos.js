import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB máx

// ASESOR solo accede a documentos de sus propios clientes
async function verificarAccesoCliente(req, clienteId) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return { error: 'Cliente no encontrado', status: 404 };
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) {
    return { error: 'Sin acceso a este cliente', status: 403 };
  }
  return { cliente };
}

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
  const nombreOriginal = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
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
  const ruta = path.join(UPLOADS_DIR, path.basename(doc.archivo));
  if (!fs.existsSync(ruta)) return res.status(410).json({ error: 'El archivo físico ya no existe en el servidor' });
  res.download(ruta, doc.nombre);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const doc = await prisma.documentoCliente.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const acceso = await verificarAccesoCliente(req, doc.clienteId);
  if (acceso.error) return res.status(acceso.status).json({ error: acceso.error });
  await prisma.documentoCliente.delete({ where: { id: doc.id } });
  fs.unlink(path.join(UPLOADS_DIR, path.basename(doc.archivo)), () => {});
  res.json({ ok: true });
}));

export default router;
