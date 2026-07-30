import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('citas'));

router.get('/', asyncHandler(async (req, res) => {
  const { desde, hasta, estado, asesorId, clienteId, promotorId, clasificacion } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (promotorId) where.promotorId = promotorId;
  if (clienteId) where.clienteId = clienteId;
  if (estado) where.estado = estado;
  if (clasificacion) where.clasificacion = clasificacion;
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

// Empalme = otra cita viva (PROGRAMADA/CONFIRMADA) del mismo asesor que se cruza en horario.
// Se reporta como 409 con el detalle; el cliente puede reenviar con ignorarEmpalme=true.
async function buscarEmpalme(asesorId, inicio, fin, excluirId = null) {
  return prisma.cita.findFirst({
    where: {
      asesorId,
      ...(excluirId ? { id: { not: excluirId } } : {}),
      estado: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      fechaHoraInicio: { lt: fin },
      fechaHoraFin: { gt: inicio },
    },
    select: { id: true, titulo: true, fechaHoraInicio: true, fechaHoraFin: true },
  });
}

const CLASIFICACIONES = ['PRODUCTIVA', 'GESTION', 'PERSONAL'];
// Agenda propia de reclutamiento del promotor: solo ADMIN/SUPERADMIN, sin
// asesor ni cliente (equivalen a un evento personal, pero no bloquean la
// agenda ni se pintan de rojo — su color lo da la clasificación elegida).
const MODALIDADES_PROMOTOR = ['PRP', 'ENTREVISTA_INICIAL', 'ENTREVISTA_SELECCION', 'ENTREVISTA_CARRERA'];

router.post('/', asyncHandler(async (req, res) => {
  const { clienteId, titulo, descripcion, tipo, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, clasificacion, promotorId, ignorarEmpalme } = req.body || {};
  if (!titulo || !fechaHoraInicio) return res.status(400).json({ error: 'titulo y fechaHoraInicio son requeridos' });
  if (clasificacion && !CLASIFICACIONES.includes(clasificacion)) return res.status(400).json({ error: 'clasificacion inválida' });
  if (modalidad && MODALIDADES_PROMOTOR.includes(modalidad) && req.user.rol === 'ASESOR') {
    return res.status(403).json({ error: 'Este tipo de cita es solo para el promotor' });
  }
  // Solo un evento PERSONAL (bloqueo de agenda) o de agenda propia del
  // promotor (reclutamiento) puede no llevar cliente; toda cita de trabajo
  // con un asesor lo exige, igual que antes.
  if (!clienteId && clasificacion !== 'PERSONAL' && !MODALIDADES_PROMOTOR.includes(modalidad)) {
    return res.status(400).json({ error: 'clienteId es requerido (salvo eventos personales o de agenda propia)' });
  }
  const cliente = clienteId ? await prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
  if (clienteId && !cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || cliente?.asesorId || req.user.id);
  if (req.user.rol === 'ASESOR' && cliente && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'El cliente pertenece a otro asesor' });

  // Validar promotor si se asigna (debe ser admin/superadmin)
  let promotorFinal = null;
  if (modalidad === 'ACOMPANAMIENTO' && promotorId) {
    const promotor = await prisma.usuario.findUnique({ where: { id: promotorId } });
    if (promotor && (promotor.rol === 'ADMIN' || promotor.rol === 'SUPERADMIN')) promotorFinal = promotorId;
  }

  const inicio = new Date(fechaHoraInicio);
  const fin = fechaHoraFin ? new Date(fechaHoraFin) : new Date(inicio.getTime() + 30 * 60 * 1000);
  if (fin <= inicio) return res.status(400).json({ error: 'La fecha de fin debe ser posterior al inicio' });

  if (ignorarEmpalme !== true) {
    const solapada = await buscarEmpalme(asesorId, inicio, fin);
    if (solapada) return res.status(409).json({ error: 'Se empalma con otra cita del asesor', empalme: solapada });
  }

  // El estado NO se recibe del cliente: toda cita nueva nace PROGRAMADA y
  // cambia después con las acciones del ciclo de vida (completar, cancelar, no asistió).
  const cita = await prisma.cita.create({
    data: {
      asesorId, clienteId: clienteId || null, titulo, descripcion: descripcion || null,
      tipo: tipo || 'TELEFONICA',
      modalidad: modalidad || 'CITA_UNICA',
      clasificacion: clasificacion || (clienteId ? 'PRODUCTIVA' : 'PERSONAL'),
      promotorId: promotorFinal,
      estado: 'PROGRAMADA',
      fechaHoraInicio: inicio, fechaHoraFin: fin,
      ubicacion: ubicacion || null, recordatorioMinutos: recordatorioMinutos ?? 60,
    },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });
  // Los eventos personales no dejan huella en la bitácora de trabajo.
  if (cliente) {
    await registrarActividad(asesorId, 'CITA_CREADA', {
      citaId: cita.id,
      clienteId: cliente.id,
      cliente: `${cliente.nombre} ${cliente.apellidoP}`,
      titulo,
      modalidad: modalidad || 'CITA_UNICA',
    });
  }
  res.status(201).json(cita);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cita.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a esta cita' });
  const { titulo, descripcion, tipo, estado, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, clasificacion, promotorId, ignorarEmpalme } = req.body || {};
  const data = {};
  if (titulo) data.titulo = titulo;
  if (descripcion !== undefined) data.descripcion = descripcion || null;
  if (tipo) data.tipo = tipo;
  if (modalidad) data.modalidad = modalidad;
  if (clasificacion) {
    if (!CLASIFICACIONES.includes(clasificacion)) return res.status(400).json({ error: 'clasificacion inválida' });
    // Un evento sin cliente solo puede ser PERSONAL o de agenda propia del promotor.
    const modalidadEfectiva = modalidad || existente.modalidad;
    if (!existente.clienteId && clasificacion !== 'PERSONAL' && !MODALIDADES_PROMOTOR.includes(modalidadEfectiva)) {
      return res.status(400).json({ error: 'Un evento sin cliente solo puede ser personal o de agenda propia' });
    }
    data.clasificacion = clasificacion;
  }
  if (promotorId !== undefined) data.promotorId = promotorId || null;
  if (estado) data.estado = estado;
  if (fechaHoraInicio) data.fechaHoraInicio = new Date(fechaHoraInicio);
  if (fechaHoraFin) data.fechaHoraFin = new Date(fechaHoraFin);
  if (ubicacion !== undefined) data.ubicacion = ubicacion || null;
  if (recordatorioMinutos !== undefined) data.recordatorioMinutos = recordatorioMinutos;

  // Al reagendar aplican las mismas reglas del alta: fin > inicio y aviso de empalme.
  if (data.fechaHoraInicio || data.fechaHoraFin) {
    const inicio = data.fechaHoraInicio || existente.fechaHoraInicio;
    const fin = data.fechaHoraFin || existente.fechaHoraFin;
    if (fin <= inicio) return res.status(400).json({ error: 'La fecha de fin debe ser posterior al inicio' });
    if (ignorarEmpalme !== true) {
      const solapada = await buscarEmpalme(existente.asesorId, inicio, fin, id);
      if (solapada) return res.status(409).json({ error: 'Se empalma con otra cita del asesor', empalme: solapada });
    }
  }

  const cita = await prisma.cita.update({
    where: { id },
    data,
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });
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
