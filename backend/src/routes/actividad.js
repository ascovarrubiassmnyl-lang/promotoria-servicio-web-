import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { asesorId, desde, hasta, limit, tipo } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (tipo) where.tipo = tipo;
  if (desde || hasta) {
    where.creadoEn = {};
    if (desde) where.creadoEn.gte = new Date(desde);
    if (hasta) where.creadoEn.lte = new Date(hasta);
  }
  const actividades = await prisma.actividad.findMany({
    where,
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
    orderBy: { creadoEn: 'desc' },
    take: Math.min(parseInt(limit) || 50, 200),
  });
  res.json(actividades);
}));

// Registrar una llamada: crea actividad tipo LLAMADA y actualiza fechaUltimaLlamada del cliente
router.post('/llamada', asyncHandler(async (req, res) => {
  const { clienteId, descripcion } = req.body || {};
  if (!clienteId) return res.status(400).json({ error: 'clienteId es requerido' });
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  const asesorId = cliente.asesorId || req.user.id;
  const actividad = await prisma.actividad.create({
    data: {
      asesorId,
      tipo: 'LLAMADA',
      descripcion: descripcion || `Llamada a ${cliente.nombre} ${cliente.apellidoP}`,
      metadata: { clienteId },
    },
  });
  await prisma.cliente.update({
    where: { id: clienteId },
    data: { fechaUltimaLlamada: new Date() },
  });
  res.status(201).json(actividad);
}));

export default router;
