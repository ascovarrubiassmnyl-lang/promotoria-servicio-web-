import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);
// Self-service, igual que /api/push: no lleva permiteSeccion porque no hay
// dato de negocio de terceros en juego. Cada quien ve EXCLUSIVAMENTE las
// suyas (destinatarioId = req.user.id siempre, sin excepción de admin: un
// promotor no lee las notificaciones de sus asesores).

const MAX_LISTA = 50;

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, MAX_LISTA);
  const [notificaciones, noLeidas] = await Promise.all([
    prisma.notificacion.findMany({
      where: { destinatarioId: req.user.id },
      orderBy: { creadoEn: 'desc' },
      take: limit,
    }),
    prisma.notificacion.count({ where: { destinatarioId: req.user.id, leida: false } }),
  ]);
  res.json({ notificaciones, noLeidas });
}));

// Endpoint deliberadamente mínimo: lo consulta la campana en intervalo corto,
// así que solo cuenta (sin traer filas).
router.get('/no-leidas', asyncHandler(async (req, res) => {
  const noLeidas = await prisma.notificacion.count({
    where: { destinatarioId: req.user.id, leida: false },
  });
  res.json({ noLeidas });
}));

// Va antes de PATCH /:id para que Express no lo tome como un id.
router.patch('/leer-todas', asyncHandler(async (req, res) => {
  const r = await prisma.notificacion.updateMany({
    where: { destinatarioId: req.user.id, leida: false },
    data: { leida: true, leidaEn: new Date() },
  });
  res.json({ actualizadas: r.count });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.notificacion.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Notificación no encontrada' });
  if (existente.destinatarioId !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta notificación' });
  }
  if (existente.leida) return res.json(existente);
  const actualizada = await prisma.notificacion.update({
    where: { id },
    data: { leida: true, leidaEn: new Date() },
  });
  res.json(actualizada);
}));

export default router;
