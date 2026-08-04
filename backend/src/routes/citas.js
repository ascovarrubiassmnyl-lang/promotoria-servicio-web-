import { Router } from 'express';
import { randomUUID } from 'node:crypto';
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
  const { desde, hasta, estado, asesorId, clienteId, candidatoId, promotorId, clasificacion } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (promotorId) where.promotorId = promotorId;
  if (clienteId) where.clienteId = clienteId;
  if (candidatoId) where.candidatoId = candidatoId;
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
      candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
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
      candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true, etapa: true } },
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

// Recurrencia de citas (2026-08): al agendar se puede pedir que la cita se
// repita; se materializan TODAS las instancias como filas Cita normales que
// comparten `serieId` (sin lógica especial de cascada — cada una se edita,
// reagenda o cancela de forma independiente, ver comentario en el schema).
// Tope técnico: nunca más de 260 instancias (~5 años semanal) por seguridad.
const TIPOS_RECURRENCIA = ['NO_REPITE', 'DIARIO', 'SEMANAL', 'ANUAL', 'DIAS_HABILES', 'PERSONALIZADO'];
const MAX_INSTANCIAS_SERIE = 260;

// Calcula las fechas de inicio (Date) de cada instancia de la serie, a partir
// del inicio de la primera cita. `hasta` es inclusive (Date). `diasSemana`
// (0=domingo..6=sábado) solo aplica a PERSONALIZADO.
function fechasRecurrencia(tipo, inicio, hasta, diasSemana) {
  const fechas = [new Date(inicio)];
  if (tipo === 'NO_REPITE') return fechas;
  const limite = new Date(hasta);
  limite.setHours(23, 59, 59, 999);

  if (tipo === 'DIARIO') {
    let cursor = new Date(inicio);
    while (true) {
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 1);
      if (cursor > limite || fechas.length >= MAX_INSTANCIAS_SERIE) break;
      fechas.push(new Date(cursor));
    }
  } else if (tipo === 'DIAS_HABILES') {
    let cursor = new Date(inicio);
    while (true) {
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 1);
      if (cursor > limite || fechas.length >= MAX_INSTANCIAS_SERIE) break;
      if (cursor.getDay() >= 1 && cursor.getDay() <= 5) fechas.push(new Date(cursor));
    }
  } else if (tipo === 'SEMANAL') {
    let cursor = new Date(inicio);
    while (true) {
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 7);
      if (cursor > limite || fechas.length >= MAX_INSTANCIAS_SERIE) break;
      fechas.push(new Date(cursor));
    }
  } else if (tipo === 'ANUAL') {
    let cursor = new Date(inicio);
    while (true) {
      cursor = new Date(cursor); cursor.setFullYear(cursor.getFullYear() + 1);
      if (cursor > limite || fechas.length >= MAX_INSTANCIAS_SERIE) break;
      fechas.push(new Date(cursor));
    }
  } else if (tipo === 'PERSONALIZADO') {
    const dias = Array.isArray(diasSemana) && diasSemana.length
      ? diasSemana.map(Number).filter((d) => d >= 0 && d <= 6)
      : [inicio.getDay()];
    let cursor = new Date(inicio);
    while (true) {
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 1);
      if (cursor > limite || fechas.length >= MAX_INSTANCIAS_SERIE) break;
      if (dias.includes(cursor.getDay())) fechas.push(new Date(cursor));
    }
  }
  return fechas;
}

const CLASIFICACIONES = ['PRODUCTIVA', 'GESTION', 'PERSONAL'];
// Agenda propia de reclutamiento del promotor: solo ADMIN/SUPERADMIN, sin
// asesor ni cliente (equivalen a un evento personal, pero no bloquean la
// agenda ni se pintan de rojo — su color lo da la clasificación elegida).
const MODALIDADES_PROMOTOR = ['PRP', 'ENTREVISTA_INICIAL', 'ENTREVISTA_SELECCION', 'ENTREVISTA_CARRERA'];

router.post('/', asyncHandler(async (req, res) => {
  const { clienteId, candidatoId, titulo, descripcion, tipo, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, clasificacion, promotorId, ignorarEmpalme, recurrencia } = req.body || {};
  if (!titulo || !fechaHoraInicio) return res.status(400).json({ error: 'titulo y fechaHoraInicio son requeridos' });
  const tipoRecurrencia = recurrencia?.tipo || 'NO_REPITE';
  if (!TIPOS_RECURRENCIA.includes(tipoRecurrencia)) return res.status(400).json({ error: 'recurrencia.tipo inválido' });
  if (tipoRecurrencia !== 'NO_REPITE' && !recurrencia?.hasta) {
    return res.status(400).json({ error: 'recurrencia.hasta (YYYY-MM-DD) es requerida para citas repetidas' });
  }
  if (clasificacion && !CLASIFICACIONES.includes(clasificacion)) return res.status(400).json({ error: 'clasificacion inválida' });
  if (modalidad && MODALIDADES_PROMOTOR.includes(modalidad) && req.user.rol === 'ASESOR') {
    return res.status(403).json({ error: 'Este tipo de cita es solo para el promotor' });
  }
  // Candidato y cliente son excluyentes: el candidato solo aplica a citas de
  // reclutamiento (PRP/ENTREVISTA_*) y es opcional (una PRP grupal no tiene
  // candidato único); una cita de reclutamiento nunca lleva cliente.
  if (candidatoId && !MODALIDADES_PROMOTOR.includes(modalidad)) {
    return res.status(400).json({ error: 'El candidato solo aplica a citas de reclutamiento (PRP/entrevistas)' });
  }
  if (candidatoId && clienteId) return res.status(400).json({ error: 'Una cita no puede llevar cliente y candidato a la vez' });
  if (clienteId && MODALIDADES_PROMOTOR.includes(modalidad)) {
    return res.status(400).json({ error: 'Una cita de reclutamiento no lleva cliente (elige un candidato)' });
  }
  // Solo un evento PERSONAL (bloqueo de agenda) o de agenda propia del
  // promotor (reclutamiento) puede no llevar cliente; toda cita de trabajo
  // con un asesor lo exige, igual que antes.
  if (!clienteId && clasificacion !== 'PERSONAL' && !MODALIDADES_PROMOTOR.includes(modalidad)) {
    return res.status(400).json({ error: 'clienteId es requerido (salvo eventos personales o de agenda propia)' });
  }
  const cliente = clienteId ? await prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
  if (clienteId && !cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const candidato = candidatoId ? await prisma.candidato.findUnique({ where: { id: candidatoId } }) : null;
  if (candidatoId && !candidato) return res.status(400).json({ error: 'Candidato no encontrado' });
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
  const duracionMs = fin.getTime() - inicio.getTime();

  let hastaRecurrencia = null;
  if (tipoRecurrencia !== 'NO_REPITE') {
    hastaRecurrencia = new Date(`${String(recurrencia.hasta).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(hastaRecurrencia.getTime())) return res.status(400).json({ error: 'recurrencia.hasta inválida' });
    if (hastaRecurrencia < inicio) return res.status(400).json({ error: 'recurrencia.hasta debe ser posterior al inicio' });
  }
  const inicios = fechasRecurrencia(tipoRecurrencia, inicio, hastaRecurrencia, recurrencia?.diasSemana);
  const serieId = inicios.length > 1 ? randomUUID() : null;

  // Cada instancia se valida y crea de forma independiente (misma regla de
  // empalme del alta suelta); si una fecha se empalma se omite y se reporta,
  // en vez de tumbar toda la serie.
  const creadas = [];
  const omitidas = [];
  for (const inicioInstancia of inicios) {
    const finInstancia = new Date(inicioInstancia.getTime() + duracionMs);
    if (ignorarEmpalme !== true) {
      const solapada = await buscarEmpalme(asesorId, inicioInstancia, finInstancia);
      if (solapada) { omitidas.push({ fechaHoraInicio: inicioInstancia, empalme: solapada }); continue; }
    }
    // El estado NO se recibe del cliente: toda cita nueva nace PROGRAMADA y
    // cambia después con las acciones del ciclo de vida (completar, cancelar, no asistió).
    const cita = await prisma.cita.create({
      data: {
        asesorId, clienteId: clienteId || null, candidatoId: candidatoId || null,
        titulo, descripcion: descripcion || null,
        tipo: tipo || 'TELEFONICA',
        modalidad: modalidad || 'CITA_UNICA',
        clasificacion: clasificacion || (clienteId ? 'PRODUCTIVA' : 'PERSONAL'),
        promotorId: promotorFinal,
        estado: 'PROGRAMADA',
        fechaHoraInicio: inicioInstancia, fechaHoraFin: finInstancia,
        ubicacion: ubicacion || null, recordatorioMinutos: recordatorioMinutos ?? 60,
        serieId,
      },
      include: {
        cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
        candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
        asesor: { select: { id: true, nombre: true, apellidoP: true } },
        promotor: { select: { id: true, nombre: true, apellidoP: true } },
      },
    });
    creadas.push(cita);
  }

  if (!creadas.length) {
    return res.status(409).json({ error: 'Todas las fechas de la serie se empalman con otra cita', omitidas });
  }

  // Los eventos personales no dejan huella en la bitácora de trabajo. Una
  // serie repetida registra una sola entrada (la primera cita) para no
  // saturar la bitácora con N eventos idénticos.
  const primera = creadas[0];
  if (cliente) {
    await registrarActividad(asesorId, 'CITA_CREADA', {
      citaId: primera.id,
      clienteId: cliente.id,
      cliente: `${cliente.nombre} ${cliente.apellidoP}`,
      titulo,
      modalidad: modalidad || 'CITA_UNICA',
      ...(creadas.length > 1 ? { repeticiones: creadas.length } : {}),
    });
  } else if (candidato) {
    await registrarActividad(asesorId, 'CITA_CREADA', {
      citaId: primera.id,
      candidatoId: candidato.id,
      candidato: `${candidato.nombre} ${candidato.apellidoP}`,
      titulo,
      modalidad: modalidad || 'CITA_UNICA',
      ...(creadas.length > 1 ? { repeticiones: creadas.length } : {}),
    });
  }
  res.status(201).json({ cita: primera, citas: creadas, omitidas: omitidas.length ? omitidas : undefined });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cita.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a esta cita' });
  const { titulo, descripcion, tipo, estado, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, clasificacion, promotorId, candidatoId, ignorarEmpalme } = req.body || {};
  const data = {};
  if (titulo) data.titulo = titulo;
  if (descripcion !== undefined) data.descripcion = descripcion || null;
  if (tipo) data.tipo = tipo;
  if (modalidad) data.modalidad = modalidad;
  // Mismas reglas del alta: candidato solo en citas de reclutamiento y nunca
  // junto a un cliente.
  if (candidatoId !== undefined) {
    const modalidadEfectiva = modalidad || existente.modalidad;
    if (candidatoId && !MODALIDADES_PROMOTOR.includes(modalidadEfectiva)) {
      return res.status(400).json({ error: 'El candidato solo aplica a citas de reclutamiento (PRP/entrevistas)' });
    }
    if (candidatoId && existente.clienteId) {
      return res.status(400).json({ error: 'Una cita no puede llevar cliente y candidato a la vez' });
    }
    if (candidatoId) {
      const candidato = await prisma.candidato.findUnique({ where: { id: candidatoId } });
      if (!candidato) return res.status(400).json({ error: 'Candidato no encontrado' });
    }
    data.candidatoId = candidatoId || null;
  }
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
      candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
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
