import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

// GET /notas?clienteId=...&tipo=...&pendientes=true
router.get('/', asyncHandler(async (req, res) => {
  const { clienteId, tipo, pendientes } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  if (clienteId) where.clienteId = clienteId;
  if (tipo) where.tipo = tipo;
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
  const { clienteId, tipo, texto, fechaAviso } = req.body || {};
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
  const { texto, completada, fechaAviso, tipo } = req.body || {};
  const data = {};
  if (texto !== undefined) data.texto = texto;
  if (completada !== undefined) data.completada = completada;
  if (fechaAviso !== undefined) data.fechaAviso = fechaAviso ? new Date(fechaAviso) : null;
  if (tipo) data.tipo = tipo;
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
