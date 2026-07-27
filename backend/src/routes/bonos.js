import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('ventas'));

router.get('/', asyncHandler(async (req, res) => {
  const { asesorId, mes, anio, estado } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (mes) where.mes = parseInt(mes);
  if (anio) where.anio = parseInt(anio);
  if (estado) where.estado = estado;
  const bonos = await prisma.bono.findMany({
    where,
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });
  res.json(bonos);
}));

router.post('/', esAdmin, asyncHandler(async (req, res) => {
  const { asesorId, mes, anio, concepto, monto, estado, fechaCobro, notas } = req.body || {};
  if (!asesorId || !mes || !anio || !concepto || monto == null) return res.status(400).json({ error: 'asesorId, mes, anio, concepto y monto son requeridos' });
  const creado = await prisma.bono.create({
    data: {
      asesorId, mes, anio, concepto,
      monto: +monto,
      estado: estado || 'PENDIENTE',
      fechaCobro: fechaCobro ? new Date(fechaCobro) : null,
      notas: notas || null,
    },
  });
  res.status(201).json(creado);
}));

router.patch('/:id', esAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { mes, anio, concepto, monto, estado, fechaCobro, notas } = req.body || {};
  const data = {};
  if (mes !== undefined) data.mes = mes;
  if (anio !== undefined) data.anio = anio;
  if (concepto !== undefined) data.concepto = concepto;
  if (monto !== undefined) data.monto = +monto;
  if (estado !== undefined) data.estado = estado;
  if (fechaCobro !== undefined) data.fechaCobro = fechaCobro ? new Date(fechaCobro) : null;
  if (notas !== undefined) data.notas = notas || null;
  const actualizado = await prisma.bono.update({ where: { id }, data });
  res.json(actualizado);
}));

router.delete('/:id', esAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.bono.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
