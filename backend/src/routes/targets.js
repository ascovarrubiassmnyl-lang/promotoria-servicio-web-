import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { mes, anio, asesorId } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (mes) where.mes = parseInt(mes);
  if (anio) where.anio = parseInt(anio);
  const targets = await prisma.target.findMany({ where, include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } } });
  res.json(targets);
}));

router.post('/', esAdmin, asyncHandler(async (req, res) => {
  const { asesorId, mes, anio, metaVentasNum, metaPrimaMonto } = req.body || {};
  if (!asesorId || !mes || !anio) return res.status(400).json({ error: 'asesorId, mes y anio son requeridos' });
  const m = parseInt(mes), a = parseInt(anio);
  if (m < 1 || m > 12) return res.status(400).json({ error: 'mes debe ser 1-12' });
  const target = await prisma.target.upsert({
    where: { asesorId_mes_anio: { asesorId, mes: m, anio: a } },
    create: { asesorId, mes: m, anio: a, metaVentasNum: metaVentasNum ?? null, metaPrimaMonto: metaPrimaMonto ?? null },
    update: { metaVentasNum: metaVentasNum ?? null, metaPrimaMonto: metaPrimaMonto ?? null },
  });
  res.status(201).json(target);
}));

export default router;
