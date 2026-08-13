import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';
import { notificar } from '../utils/notificaciones.js';
import { crearEvento, borrarEvento, horarioLibre } from '../services/googleCalendar.js';

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

// Disponibilidad (ocupado/libre) de un promotor, para que un asesor sepa
// cuándo invitarlo a un acompañamiento sin tener que preguntarle. Deliberadamente
// separado de GET /: devuelve SOLO rangos horarios, sin include ni un campo más
// —- el asesor nunca debe saber con quién ni por qué está ocupado el promotor
// (otro asesor, un cliente, un candidato, un asunto personal). Va antes de
// GET /:id para que Express no resuelva "disponibilidad" como un id.
const DIAS_MAX_DISPONIBILIDAD = 62; // cubre la vista Mes con margen, sin permitir barridos arbitrarios

router.get('/disponibilidad', asyncHandler(async (req, res) => {
  const { usuarioId, desde, hasta } = req.query;
  if (!usuarioId || !desde || !hasta) {
    return res.status(400).json({ error: 'usuarioId, desde y hasta son requeridos' });
  }
  const inicio = new Date(desde);
  const fin = new Date(hasta);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) {
    return res.status(400).json({ error: 'Rango de fechas inválido' });
  }
  if ((fin - inicio) / 86400000 > DIAS_MAX_DISPONIBILIDAD) {
    return res.status(400).json({ error: `El rango no puede exceder ${DIAS_MAX_DISPONIBILIDAD} días` });
  }

  const promotor = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, rol: true },
  });
  if (!promotor) return res.status(404).json({ error: 'Usuario no encontrado' });
  // Solo se expone la disponibilidad de un promotor: este endpoint no es un
  // free/busy genérico, así un asesor no puede usarlo para espiar la agenda de
  // un compañero pasando su id.
  if (promotor.rol !== 'ADMIN' && promotor.rol !== 'SUPERADMIN') {
    return res.status(400).json({ error: 'Solo se puede consultar disponibilidad de un promotor' });
  }

  // Lo que realmente ocupa la agenda de un promotor: sus propias citas (como
  // dueño: reclutamiento, eventos personales) más los acompañamientos que ya
  // ACEPTÓ. Mismo criterio que valida el empalme en PATCH /:id/invitacion —
  // una invitación PENDIENTE todavía no lo ocupa, así que ese hueco sigue
  // ofreciéndose como libre hasta que responde.
  const citas = await prisma.cita.findMany({
    where: {
      estado: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      fechaHoraInicio: { lt: fin },
      fechaHoraFin: { gt: inicio },
      OR: [
        { asesorId: usuarioId },
        { promotorId: usuarioId, invitacionEstado: 'ACEPTADA' },
      ],
    },
    select: { fechaHoraInicio: true, fechaHoraFin: true },
    orderBy: { fechaHoraInicio: 'asc' },
  });

  res.json({
    usuarioId,
    desde: inicio,
    hasta: fin,
    bloques: citas.map((c) => ({ inicio: c.fechaHoraInicio, fin: c.fechaHoraFin })),
  });
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
  // Invitar al promotor = la cita nace PENDIENTE de su respuesta y todavía no
  // ocupa su agenda. Si el propio promotor se agenda a sí mismo no hay nada
  // que aceptar: queda ACEPTADA de entrada.
  const invitacionEstado = promotorFinal
    ? (promotorFinal === req.user.id ? 'ACEPTADA' : 'PENDIENTE')
    : null;

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
        invitacionEstado,
        invitacionRespondidaEn: invitacionEstado === 'ACEPTADA' ? new Date() : null,
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
  // Aviso al promotor invitado: queda en su campana (fuente de verdad) y se
  // intenta la push. Si algo de esto falla la invitación igual está registrada
  // y la verá en su calendario — nunca bloquea la respuesta.
  if (invitacionEstado === 'PENDIENTE' && promotorFinal) {
    const quien = `${req.user.nombre} ${req.user.apellidoP || ''}`.trim();
    const tituloAviso = 'Nueva invitación de acompañamiento';
    const cuerpo = creadas.length > 1
      ? `${quien} te invitó a ${creadas.length} citas: "${titulo}". Ábrelas para aceptar o rechazar.`
      : `${quien} te invitó a "${titulo}" el ${primera.fechaHoraInicio.toLocaleString('es-MX')}. Ábrela para aceptar o rechazar.`;
    try {
      await notificar(promotorFinal, 'CITA_INVITACION', {
        titulo: tituloAviso,
        cuerpo,
        datos: { url: '/citas', citaId: primera.id },
        pushPayload: {
          title: tituloAviso,
          body: cuerpo,
          tag: `invitacion-cita-${primera.id}`,
          data: { url: '/citas' },
        },
      });
    } catch (err) {
      console.error('No se pudo notificar la invitación al promotor:', err.message);
    }
  }

  res.status(201).json({ cita: primera, citas: creadas, omitidas: omitidas.length ? omitidas : undefined });
}));

// Respuesta del promotor a una invitación de acompañamiento. Solo el promotor
// invitado puede responder (ni el asesor que agendó, ni otro admin).
// SUGERIDA: en vez de aceptar/rechazar tal cual, el promotor propone otro
// horario (sugerenciaInicio/Fin/Nota) — la cita conserva su horario original
// hasta que el asesor la acepte en PATCH /:id/invitacion/sugerencia.
router.patch('/:id/invitacion', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { respuesta, ignorarEmpalme, sugerenciaInicio, sugerenciaFin, sugerenciaNota } = req.body || {};
  if (!['ACEPTADA', 'RECHAZADA', 'SUGERIDA'].includes(respuesta)) {
    return res.status(400).json({ error: 'respuesta debe ser ACEPTADA, RECHAZADA o SUGERIDA' });
  }
  if (respuesta === 'SUGERIDA') {
    if (!sugerenciaInicio || !sugerenciaFin) return res.status(400).json({ error: 'sugerenciaInicio y sugerenciaFin son requeridos' });
    if (new Date(sugerenciaFin) <= new Date(sugerenciaInicio)) return res.status(400).json({ error: 'sugerenciaFin debe ser posterior a sugerenciaInicio' });
  }
  const cita = await prisma.cita.findUnique({
    where: { id },
    include: {
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      cliente: { select: { id: true, nombre: true, apellidoP: true } },
      candidato: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  if (!cita.promotorId) return res.status(400).json({ error: 'Esta cita no tiene promotor invitado' });
  if (cita.promotorId !== req.user.id) return res.status(403).json({ error: 'Solo el promotor invitado puede responder' });

  // Al aceptar, la cita pasa a ocupar la agenda del promotor: se avisa si ya
  // tiene algo a esa hora (se puede aceptar de todos modos, igual que el alta).
  if (respuesta === 'ACEPTADA' && ignorarEmpalme !== true) {
    const solapada = await prisma.cita.findFirst({
      where: {
        id: { not: id },
        estado: { in: ['PROGRAMADA', 'CONFIRMADA'] },
        fechaHoraInicio: { lt: cita.fechaHoraFin },
        fechaHoraFin: { gt: cita.fechaHoraInicio },
        OR: [
          { asesorId: req.user.id },
          { promotorId: req.user.id, invitacionEstado: 'ACEPTADA' },
        ],
      },
      select: { id: true, titulo: true, fechaHoraInicio: true, fechaHoraFin: true },
    });
    if (solapada) return res.status(409).json({ error: 'Ya tienes una cita a esa hora', empalme: solapada });

    // Además del CRM, se consulta su Google Calendar (si conectó su cuenta):
    // "agendarse si tiene el espacio libre". Si no se puede consultar
    // (null) no se bloquea: el CRM manda.
    const disponible = await horarioLibre(req.user.id, cita.fechaHoraInicio, cita.fechaHoraFin);
    if (disponible && disponible.libre === false) {
      return res.status(409).json({
        error: 'Tu Google Calendar ya tiene algo a esa hora',
        empalme: {
          id: null,
          titulo: 'Evento en tu Google Calendar',
          fechaHoraInicio: disponible.ocupadoDe,
          fechaHoraFin: disponible.ocupadoA,
        },
      });
    }
  }

  const actualizada = await prisma.cita.update({
    where: { id },
    data: {
      invitacionEstado: respuesta,
      invitacionRespondidaEn: respuesta === 'SUGERIDA' ? null : new Date(),
      // Rechazar libera al promotor pero conserva la cita del asesor.
      ...(respuesta === 'RECHAZADA' ? { promotorId: null } : {}),
      ...(respuesta === 'SUGERIDA'
        ? { sugerenciaInicio: new Date(sugerenciaInicio), sugerenciaFin: new Date(sugerenciaFin), sugerenciaNota: sugerenciaNota || null }
        : { sugerenciaInicio: null, sugerenciaFin: null, sugerenciaNota: null }),
    },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });

  // Espejo en el Google Calendar del promotor (mejor esfuerzo, nunca bloquea):
  // al aceptar se crea el evento; al rechazar se borra si existía.
  if (respuesta === 'ACEPTADA' && !cita.googleEventId) {
    const eventId = await crearEvento(req.user.id, cita);
    if (eventId) {
      await prisma.cita.update({
        where: { id },
        data: { googleEventId: eventId, googleEventUsuarioId: req.user.id },
      });
      actualizada.googleEventId = eventId;
    }
  } else if (respuesta === 'RECHAZADA' && cita.googleEventId) {
    await borrarEvento(cita.googleEventUsuarioId || req.user.id, cita.googleEventId);
    await prisma.cita.update({
      where: { id },
      data: { googleEventId: null, googleEventUsuarioId: null },
    });
  }

  // Avisar al asesor que agendó: campana + push.
  try {
    const quien = `${req.user.nombre} ${req.user.apellidoP || ''}`.trim();
    const titulos = {
      ACEPTADA: 'Acompañamiento confirmado',
      RECHAZADA: 'Acompañamiento rechazado',
      SUGERIDA: `${quien} propuso otro horario`,
    };
    const cuerpos = {
      ACEPTADA: `${quien} aceptó acompañarte en "${cita.titulo}".`,
      RECHAZADA: `${quien} no podrá acompañarte en "${cita.titulo}". Agenda con otro promotor u horario.`,
      SUGERIDA: `${quien} propuso otro horario para "${cita.titulo}": ${new Date(sugerenciaInicio).toLocaleString('es-MX')}. Revisa y responde.`,
    };
    await notificar(cita.asesorId, 'CITA_INVITACION_RESPUESTA', {
      titulo: titulos[respuesta],
      cuerpo: cuerpos[respuesta],
      datos: { url: '/citas', citaId: cita.id, respuesta },
      pushPayload: {
        title: titulos[respuesta],
        body: cuerpos[respuesta],
        tag: `respuesta-cita-${cita.id}`,
        data: { url: '/citas' },
      },
    });
  } catch (err) {
    console.error('No se pudo notificar la respuesta al asesor:', err.message);
  }

  res.json(actualizada);
}));

// Respuesta del asesor a la sugerencia de horario del promotor: acepta (la
// cita se mueve a ese horario, queda ACEPTADA y sí ocupa la agenda del
// promotor) o la descarta (vuelve a PENDIENTE, a la espera de otra respuesta
// del promotor, conservando el horario original). Solo el asesor dueño de la
// cita puede responder — ni el promotor, ni otro admin.
router.patch('/:id/invitacion/sugerencia', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { aceptar, ignorarEmpalme } = req.body || {};
  if (typeof aceptar !== 'boolean') return res.status(400).json({ error: 'aceptar (boolean) es requerido' });
  const cita = await prisma.cita.findUnique({
    where: { id },
    include: { promotor: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  if (cita.asesorId !== req.user.id) return res.status(403).json({ error: 'Solo el asesor dueño de la cita puede responder' });
  if (cita.invitacionEstado !== 'SUGERIDA' || !cita.sugerenciaInicio || !cita.sugerenciaFin) {
    return res.status(400).json({ error: 'Esta cita no tiene una sugerencia de horario pendiente' });
  }

  if (aceptar && ignorarEmpalme !== true) {
    const solapada = await buscarEmpalme(cita.asesorId, cita.sugerenciaInicio, cita.sugerenciaFin, cita.id);
    if (solapada) return res.status(409).json({ error: 'Ya tienes una cita a esa hora', empalme: solapada });
  }

  const actualizada = await prisma.cita.update({
    where: { id },
    data: aceptar
      ? {
          fechaHoraInicio: cita.sugerenciaInicio,
          fechaHoraFin: cita.sugerenciaFin,
          invitacionEstado: 'ACEPTADA',
          invitacionRespondidaEn: new Date(),
          sugerenciaInicio: null, sugerenciaFin: null, sugerenciaNota: null,
        }
      : {
          // No acepta la propuesta: vuelve a PENDIENTE con el horario original,
          // a la espera de que el promotor responda de nuevo.
          invitacionEstado: 'PENDIENTE',
          sugerenciaInicio: null, sugerenciaFin: null, sugerenciaNota: null,
        },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      promotor: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });

  if (aceptar && !cita.googleEventId && cita.promotorId) {
    const eventId = await crearEvento(cita.promotorId, actualizada);
    if (eventId) {
      await prisma.cita.update({ where: { id }, data: { googleEventId: eventId, googleEventUsuarioId: cita.promotorId } });
      actualizada.googleEventId = eventId;
    }
  }

  // Avisar al promotor: campana + push.
  if (cita.promotorId) {
    try {
      const quien = `${req.user.nombre} ${req.user.apellidoP || ''}`.trim();
      const tituloAviso = aceptar ? 'Nuevo horario confirmado' : 'Sugerencia no aceptada';
      const cuerpo = aceptar
        ? `${quien} aceptó tu propuesta de horario para "${cita.titulo}".`
        : `${quien} no aceptó tu propuesta de horario para "${cita.titulo}". Vuelve a proponer o responde la invitación.`;
      await notificar(cita.promotorId, 'CITA_SUGERENCIA_RESPUESTA', {
        titulo: tituloAviso,
        cuerpo,
        datos: { url: '/citas', citaId: cita.id, aceptada: aceptar },
        pushPayload: {
          title: tituloAviso,
          body: cuerpo,
          tag: `sugerencia-cita-${cita.id}`,
          data: { url: '/citas' },
        },
      });
    } catch (err) {
      console.error('No se pudo notificar la respuesta a la sugerencia:', err.message);
    }
  }

  res.json(actualizada);
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

  // Cancelar una cita con espejo en Google también libera esa hora allá.
  if (data.estado === 'CANCELADA' && existente.googleEventId) {
    await borrarEvento(existente.googleEventUsuarioId || existente.promotorId, existente.googleEventId);
    data.googleEventId = null;
    data.googleEventUsuarioId = null;
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
  // Si había espejo en el Google Calendar del promotor, se retira también
  // (mejor esfuerzo): borrar la cita aquí no debe dejarle un evento fantasma.
  if (existente.googleEventId) {
    await borrarEvento(existente.googleEventUsuarioId || existente.promotorId, existente.googleEventId);
  }
  await prisma.cita.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
