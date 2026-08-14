import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('clientes'));

// Recordatorio para el asesor (su propia gestión) vs. para el cliente (algo
// que hay que tratar con él). Ambos le llegan al asesor: el CRM no tiene canal
// hacia el asegurado, así que "para el cliente" = "el asesor debe contactarlo".
const DESTINATARIOS = ['ASESOR', 'CLIENTE'];

// GET /notas?clienteId=...&tipo=...&destinatario=...&pendientes=true
router.get('/', asyncHandler(async (req, res) => {
  const { clienteId, tipo, destinatario, pendientes } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  if (clienteId) where.clienteId = clienteId;
  if (tipo) where.tipo = tipo;
  if (DESTINATARIOS.includes(destinatario)) where.destinatario = destinatario;
  if (pendientes === 'true') where.completada = false;
  const notas = await prisma.nota.findMany({
    where,
    include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(notas);
}));

// POST /notas
router.post('/', asyncHandler(async (req, res) => {
  const { clienteId, tipo, texto, fechaAviso, destinatario } = req.body || {};
  if (!clienteId || !texto) return res.status(400).json({ error: 'clienteId y texto son requeridos' });
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a este cliente' });
  }
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (cliente.asesorId);
  const nota = await prisma.nota.create({
    data: {
      clienteId,
      asesorId,
      tipo: tipo || 'NOTA',
      destinatario: DESTINATARIOS.includes(destinatario) ? destinatario : 'ASESOR',
      texto,
      fechaAviso: fechaAviso ? new Date(fechaAviso) : null,
    },
    include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  res.status(201).json(nota);
}));

// PATCH /notas/:id — actualizar texto, marcar completada, cambiar fechaAviso
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.nota.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Nota no encontrada' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta nota' });
  }
  const { texto, completada, fechaAviso, tipo, destinatario } = req.body || {};
  const data = {};
  if (texto !== undefined) data.texto = texto;
  if (completada !== undefined) data.completada = completada;
  if (fechaAviso !== undefined) {
    data.fechaAviso = fechaAviso ? new Date(fechaAviso) : null;
    // Reabrir la ventana de avisos: mover la fecha debe volver a notificar.
    data.notificacionEnviada = false;
    data.avisoPrevioEnviado = false;
  }
  if (tipo) data.tipo = tipo;
  if (DESTINATARIOS.includes(destinatario)) data.destinatario = destinatario;
  const nota = await prisma.nota.update({ where: { id }, data });
  res.json(nota);
}));

// DELETE /notas/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.nota.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Nota no encontrada' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta nota' });
  }
  await prisma.nota.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
