import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { estado, q, asesorId } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (estado) where.estado = estado;
  if (q) where.OR = [
    { nombre: { contains: q, mode: 'insensitive' } },
    { apellidoP: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { telefono: { contains: q, mode: 'insensitive' } },
    { rfc: { contains: q, mode: 'insensitive' } },
  ];
  const clientes = await prisma.cliente.findMany({
    where,
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } }, _count: { select: { citas: true, ventas: true } } },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(clientes);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      asesor: { select: { id: true, nombre: true, apellidoP: true, email: true, telefono: true } },
      citas: { orderBy: { fechaHoraInicio: 'desc' }, take: 20, include: { asesor: { select: { id: true, nombre: true, apellidoP: true } }, promotor: { select: { id: true, nombre: true, apellidoP: true } } } },
      ventas: { orderBy: { creadoEn: 'desc' }, include: { productoCatalogo: { select: { id: true, ramo: true, nombre: true } } } },
      notasItems: { orderBy: { creadoEn: 'desc' } },
      referidoPor: { select: { id: true, nombre: true, apellidoP: true } },
      referidos: { select: { id: true, nombre: true, apellidoP: true, estado: true } },
      documentos: { orderBy: { creadoEn: 'desc' }, include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } } },
    },
  });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  res.json(cliente);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { nombre, apellidoP, apellidoM, email, telefono, fechaNacimiento, rfc, direccion, estado, notas, fuente, productoInteres, detalleInteres, referidoPorId } = req.body || {};
  if (!nombre || !apellidoP) return res.status(400).json({ error: 'nombre y apellidoP son requeridos' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || req.user.id);
  if (req.user.rol !== 'ASESOR' && req.body.asesorId) {
    const existe = await prisma.usuario.findUnique({ where: { id: req.body.asesorId } });
    if (!existe) return res.status(400).json({ error: 'Asesor no válido' });
  }
  const cliente = await prisma.cliente.create({
    data: {
      asesorId, nombre, apellidoP, apellidoM: apellidoM || null, email: email || null,
      telefono: telefono || null,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
      rfc: rfc || null, direccion: direccion || null,
      estado: estado || 'PROSPECTO', notas: notas || null, fuente: fuente || null,
      productoInteres: productoInteres || null, detalleInteres: detalleInteres || null,
      referidoPorId: referidoPorId || null,
    },
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  await prisma.actividad.create({ data: { asesorId, tipo: 'CLIENTE_CREADO', descripcion: `Cliente creado: ${nombre} ${apellidoP}` } });
  res.status(201).json(cliente);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cliente.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  const {
    nombre, apellidoP, apellidoM, email, telefono, fechaNacimiento, rfc, direccion,
    estado, notas, fuente, asesorId,
    productoInteres, detalleInteres,
    productoComprado, productoNombre, formaPago, primaMonto, fechaInicioCobertura, fechaRenovacion,
    referidoPorId,
  } = req.body || {};
  const data = {};
  if (nombre) data.nombre = nombre;
  if (apellidoP) data.apellidoP = apellidoP;
  if (apellidoM !== undefined) data.apellidoM = apellidoM;
  if (email !== undefined) data.email = email || null;
  if (telefono !== undefined) data.telefono = telefono || null;
  if (fechaNacimiento !== undefined) data.fechaNacimiento = fechaNacimiento ? new Date(fechaNacimiento) : null;
  if (rfc !== undefined) data.rfc = rfc || null;
  if (direccion !== undefined) data.direccion = direccion || null;
  if (estado) data.estado = estado;
  if (notas !== undefined) data.notas = notas || null;
  if (fuente !== undefined) data.fuente = fuente || null;
  if (asesorId && req.user.rol !== 'ASESOR') data.asesorId = asesorId;
  // Producto de interés
  if (productoInteres !== undefined) data.productoInteres = productoInteres || null;
  if (detalleInteres !== undefined) data.detalleInteres = detalleInteres || null;
  // Si ya compró
  if (productoComprado !== undefined) data.productoComprado = productoComprado || null;
  if (productoNombre !== undefined) data.productoNombre = productoNombre || null;
  if (formaPago !== undefined) data.formaPago = formaPago || null;
  if (primaMonto !== undefined) data.primaMonto = primaMonto ?? null;
  if (fechaInicioCobertura !== undefined) data.fechaInicioCobertura = fechaInicioCobertura ? new Date(fechaInicioCobertura) : null;
  if (fechaRenovacion !== undefined) data.fechaRenovacion = fechaRenovacion ? new Date(fechaRenovacion) : null;
  // Referidos
  if (referidoPorId !== undefined) data.referidoPorId = referidoPorId || null;
  const cliente = await prisma.cliente.update({ where: { id }, data });
  res.json(cliente);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cliente.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  await prisma.cliente.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
