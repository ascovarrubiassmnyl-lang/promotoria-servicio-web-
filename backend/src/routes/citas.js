import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { desde, hasta, estado, asesorId, clienteId, promotorId } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (promotorId) where.promotorId = promotorId;
  if (clienteId) where.clienteId = clienteId;
  if (estado) where.estado = estado;
  if (desde || hasta) {
    where.fechaHoraInicio = {};
    if (desde) where.fechaHoraInicio.gte = new Date(desde);
    if (hasta) where.fechaHoraInicio.lte = new Date(hasta);
  }
  const citas = await prisma.cita.findMany({
    where,
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
    orderBy: { fechaHoraInicio: 'asc' },
  });
  res.json(citas);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cita = await prisma.cita.findUnique({
    where: { id },
    include: {
      cliente: true,
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  if (req.user.rol === 'ASESOR' && cita.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a esta cita' });
  res.json(cita);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { clienteId, titulo, descripcion, tipo, estado, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, promotorId } = req.body || {};
  if (!clienteId || !titulo || !fechaHoraInicio) return res.status(400).json({ error: 'clienteId, titulo y fechaHoraInicio son requeridos' });
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || cliente.asesorId);
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'El cliente pertenece a otro asesor' });

  // Validar promotor si se asigna (debe ser admin/superadmin)
  let promotorFinal = null;
  if (modalidad === 'ACOMPANAMIENTO' && promotorId) {
    const promotor = await prisma.usuario.findUnique({ where: { id: promotorId } });
    if (promotor && (promotor.rol === 'ADMIN' || promotor.rol === 'SUPERADMIN')) promotorFinal = promotorId;
  }

  const inicio = new Date(fechaHoraInicio);
  const fin = fechaHoraFin ? new Date(fechaHoraFin) : new Date(inicio.getTime() + 60 * 60 * 1000);
  if (fin <= inicio) return res.status(400).json({ error: 'La fecha de fin debe ser posterior al inicio' });

  const solapada = await prisma.cita.findFirst({
    where: { asesorId, estado: { in: ['PROGRAMADA', 'CONFIRMADA'] }, fechaHoraInicio: { lt: fin }, fechaHoraFin: { gt: inicio } },
  });
  if (solapada) return res.status(409).json({ error: 'Ya existe una cita programada en ese horario para el asesor' });

  const cita = await prisma.cita.create({
    data: {
      asesorId, clienteId, titulo, descripcion: descripcion || null,
      tipo: tipo || 'TELEFONICA',
      modalidad: modalidad || 'CITA_UNICA',
      promotorId: promotorFinal,
      estado: estado || 'PROGRAMADA',
      fechaHoraInicio: inicio, fechaHoraFin: fin,
      ubicacion: ubicacion || null, recordatorioMinutos: recordatorioMinutos ?? 60,
    },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });
  await prisma.actividad.create({ data: { asesorId, tipo: 'CITA_CREADA', descripcion: `Cita creada con ${cliente.nombre} ${cliente.apellidoP}: ${titulo}${modalidad === 'ACOMPANAMIENTO' ? ' (acompañamiento)' : ''}` } });
  res.status(201).json(cita);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cita.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a esta cita' });
  const { titulo, descripcion, tipo, estado, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, promotorId } = req.body || {};
  const data = {};
  if (titulo) data.titulo = titulo;
  if (descripcion !== undefined) data.descripcion = descripcion || null;
  if (tipo) data.tipo = tipo;
  if (modalidad) data.modalidad = modalidad;
  if (promotorId !== undefined) data.promotorId = promotorId || null;
  if (estado) data.estado = estado;
  if (fechaHoraInicio) data.fechaHoraInicio = new Date(fechaHoraInicio);
  if (fechaHoraFin) data.fechaHoraFin = new Date(fechaHoraFin);
  if (ubicacion !== undefined) data.ubicacion = ubicacion || null;
  if (recordatorioMinutos !== undefined) data.recordatorioMinutos = recordatorioMinutos;
  const cita = await prisma.cita.update({ where: { id }, data });
  res.json(cita);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cita.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a esta cita' });
  await prisma.cita.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
