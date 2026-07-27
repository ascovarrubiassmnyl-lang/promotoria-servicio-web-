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
  const { ramo, soloActivos } = req.query;
  const where = {};
  if (ramo) where.ramo = ramo;
  if (soloActivos === 'true' || soloActivos === undefined) where.activo = true;
  const productos = await prisma.productoCatalogo.findMany({
    where,
    orderBy: [{ ramo: 'asc' }, { nombre: 'asc' }],
  });
  res.json(productos);
}));

router.post('/', esAdmin, asyncHandler(async (req, res) => {
  const { ramo, nombre, codigo, descripcion, comisionPct, comisionBonoPct, activo } = req.body || {};
  if (!ramo || !nombre) return res.status(400).json({ error: 'ramo y nombre son requeridos' });
  const creado = await prisma.productoCatalogo.create({
    data: {
      ramo, nombre,
      codigo: codigo || null,
      descripcion: descripcion || null,
      comisionPct: comisionPct ?? null,
      comisionBonoPct: comisionBonoPct ?? null,
      activo: activo ?? true,
    },
  });
  res.status(201).json(creado);
}));

router.patch('/:id', esAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { ramo, nombre, codigo, descripcion, comisionPct, comisionBonoPct, activo } = req.body || {};
  const data = {};
  if (ramo) data.ramo = ramo;
  if (nombre) data.nombre = nombre;
  if (codigo !== undefined) data.codigo = codigo || null;
  if (descripcion !== undefined) data.descripcion = descripcion || null;
  if (comisionPct !== undefined) data.comisionPct = comisionPct ?? null;
  if (comisionBonoPct !== undefined) data.comisionBonoPct = comisionBonoPct ?? null;
  if (activo !== undefined) data.activo = activo;
  const actualizado = await prisma.productoCatalogo.update({ where: { id }, data });
  res.json(actualizado);
}));

router.delete('/:id', esAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.productoCatalogo.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
