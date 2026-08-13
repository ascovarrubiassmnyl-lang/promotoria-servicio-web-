import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { TIPOS_NOTIFICACION } from '../utils/notificaciones.js';

const router = Router();
router.use(authenticate);
// Self-service, igual que /api/push: no lleva permiteSeccion porque no hay
// dato de negocio de terceros en juego. Cada quien ve EXCLUSIVAMENTE las
// suyas (destinatarioId = req.user.id siempre, sin excepción de admin: un
// promotor no lee las notificaciones de sus asesores).

const MAX_LIMIT = 100;
const LIMIT_DEFAULT = 25;

// Lista paginada de la bandeja (sección /notificaciones). Devuelve además los
// conteos que alimentan los KPIs y los chips de filtro por tipo, calculados
// sobre TODA la bandeja del usuario (no sobre la página actual): así el chip
// "Invitaciones · 12" no cambia de número al pasar de página.
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || LIMIT_DEFAULT, MAX_LIMIT);
  const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
  const { estado, tipo } = req.query;

  const where = { destinatarioId: req.user.id };
  if (estado === 'no-leidas') where.leida = false;
  else if (estado === 'leidas') where.leida = true;
  // Un tipo fuera del catálogo canónico se ignora en vez de devolver vacío.
  if (tipo && TIPOS_NOTIFICACION.includes(tipo)) where.tipo = tipo;

  const [notificaciones, total, noLeidas, porTipo] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      skip: (pagina - 1) * limit,
      take: limit,
    }),
    prisma.notificacion.count({ where }),
    prisma.notificacion.count({ where: { destinatarioId: req.user.id, leida: false } }),
    prisma.notificacion.groupBy({
      by: ['tipo'],
      where: { destinatarioId: req.user.id },
      _count: { _all: true },
    }),
  ]);

  res.json({
    notificaciones,
    total,
    noLeidas,
    pagina,
    limit,
    paginas: Math.max(Math.ceil(total / limit), 1),
    conteos: Object.fromEntries(porTipo.map((t) => [t.tipo, t._count._all])),
  });
}));

// Endpoint deliberadamente mínimo: lo consulta el badge del nav en intervalo
// corto, así que solo cuenta (sin traer filas).
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

// Marcar leída/no leída. Sin body → leída (comportamiento histórico del panel);
// con { leida: false } se puede devolver a la bandeja de pendientes.
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.notificacion.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Notificación no encontrada' });
  if (existente.destinatarioId !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta notificación' });
  }
  const leida = req.body?.leida === false ? false : true;
  if (existente.leida === leida) return res.json(existente);
  const actualizada = await prisma.notificacion.update({
    where: { id },
    data: { leida, leidaEn: leida ? new Date() : null },
  });
  res.json(actualizada);
}));

// Borrado permanente de una notificación propia. Es un aviso ya entregado, no
// un dato de negocio (la cita/nota que lo originó sigue intacta), así que aquí
// sí es borrado físico y no lógico como en Cliente/Candidato.
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.notificacion.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Notificación no encontrada' });
  if (existente.destinatarioId !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta notificación' });
  }
  await prisma.notificacion.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
