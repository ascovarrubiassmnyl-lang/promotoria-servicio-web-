import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';
import { notificar } from '../utils/notificaciones.js';
import { crearEvento, borrarEvento, horarioLibre } from '../services/googleCalendar.js';
import { marcarCitaObtenidaEnClinica } from '../utils/clinica.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('citas'));

router.get('/', asyncHandler(async (req, res) => {
  const { desde, hasta, estado, asesorId, clienteId, candidatoId, promotorId, clasificacion } = req.query;
  const where = {};
  // Alcance por dueño: un ASESOR siempre ve solo lo suyo; un admin/asistente
  // ve lo que pida con ?asesorId=. En ambos casos, si el alcance efectivo es
  // "yo mismo" (forzado para ASESOR, o admin consultando su propia agenda
  // con "Mi agenda"), también se incluyen las citas donde soy INVITADO (ver
  // CitaInvitado, 2026-09-25) — no solo las que me pertenecen como dueño. Con
  // el asesorId de alguien más el filtro se queda exacto: no se le muestran
  // a un admin las citas ajenas donde esa persona solo fue invitada.
  const asesorEfectivo = req.user.rol === 'ASESOR' ? req.user.id : (asesorId || null);
  if (asesorEfectivo === req.user.id) {
    where.OR = [{ asesorId: asesorEfectivo }, { invitados: { some: { usuarioId: asesorEfectivo } } }];
  } else if (asesorEfectivo) {
    where.asesorId = asesorEfectivo;
  }
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
      ...INCLUDE_INVITADOS,
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
  // dueño: reclutamiento, eventos personales), los acompañamientos que ya
  // ACEPTÓ (mecanismo de promotorId) y, desde 2026-09-25, cualquier otra cita
  // donde lo hayan invitado como participante y ya ACEPTÓ (ver CitaInvitado).
  // Una invitación PENDIENTE/SUGERIDA todavía no lo ocupa, así que ese hueco
  // sigue ofreciéndose como libre hasta que responde.
  const citas = await prisma.cita.findMany({
    where: {
      estado: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      fechaHoraInicio: { lt: fin },
      fechaHoraFin: { gt: inicio },
      OR: [
        { asesorId: usuarioId },
        { promotorId: usuarioId, invitacionEstado: 'ACEPTADA' },
        { invitados: { some: { usuarioId, estado: 'ACEPTADA' } } },
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
      ...INCLUDE_INVITADOS,
    },
  });
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  // Un ASESOR ve la cita si es el dueño o si está en la lista de invitados
  // (mismo criterio de alcance que GET / — ver comentario ahí).
  if (req.user.rol === 'ASESOR' && cita.asesorId !== req.user.id && !cita.invitados.some((i) => i.usuarioId === req.user.id)) {
    return res.status(403).json({ error: 'Sin acceso a esta cita' });
  }
  res.json(cita);
}));

// Empalme = otra cita viva (PROGRAMADA/CONFIRMADA) del mismo asesor que se cruza en horario.
// Se reporta como 409 con el detalle; el cliente puede reenviar con ignorarEmpalme=true.
// Desde 2026-09-25 también cuenta lo que ocupa la agenda de `asesorId` como
// INVITADO ya aceptado (ver CitaInvitado) — no solo lo que le pertenece como
// dueño. Una invitación PENDIENTE/SUGERIDA todavía no ocupa el hueco, mismo
// criterio que ya aplicaba a promotorId + invitacionEstado.
async function buscarEmpalme(asesorId, inicio, fin, excluirId = null) {
  return prisma.cita.findFirst({
    where: {
      ...(excluirId ? { id: { not: excluirId } } : {}),
      estado: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      fechaHoraInicio: { lt: fin },
      fechaHoraFin: { gt: inicio },
      OR: [
        { asesorId },
        { invitados: { some: { usuarioId: asesorId, estado: 'ACEPTADA' } } },
      ],
    },
    select: { id: true, titulo: true, fechaHoraInicio: true, fechaHoraFin: true },
  });
}

// Choque con la agenda YA OCUPADA de un promotor: mismo criterio que
// GET /disponibilidad y que la validación de PATCH /:id/invitacion al
// aceptar — cita propia del promotor, o acompañamiento que ya ACEPTÓ (una
// invitación PENDIENTE todavía no ocupa el hueco). A diferencia del empalme
// entre asesores, esto NUNCA se ignora con ignorarEmpalme: no tiene sentido
// invitar al promotor "de todas formas" a una hora que ya no tiene libre —
// el propio modal ya lo bloquea en el frontend, esto es la misma regla
// aplicada en servidor, que es la que manda.
async function buscarChoquePromotor(promotorId, inicio, fin, excluirId = null) {
  return prisma.cita.findFirst({
    where: {
      ...(excluirId ? { id: { not: excluirId } } : {}),
      estado: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      fechaHoraInicio: { lt: fin },
      fechaHoraFin: { gt: inicio },
      OR: [
        { asesorId: promotorId },
        { promotorId, invitacionEstado: 'ACEPTADA' },
        { invitados: { some: { usuarioId: promotorId, estado: 'ACEPTADA' } } },
      ],
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

// Invitados adicionales de una cita (2026-09-25): cualquier usuario invitado
// más allá del dueño y del promotor de acompañamiento (Cita.promotorId, que
// es otro mecanismo, ver el modelo). Se spread-ea en cada `include` que ya
// devuelve la cita completa al frontend, para no repetir la forma a mano.
const INCLUDE_INVITADOS = {
  invitados: {
    select: {
      id: true,
      usuarioId: true,
      estado: true,
      sugerenciaInicio: true,
      sugerenciaFin: true,
      sugerenciaNota: true,
      usuario: { select: { id: true, nombre: true, apellidoP: true } },
    },
    orderBy: { creadoEn: 'asc' },
  },
};

router.post('/', asyncHandler(async (req, res) => {
  const { clienteId, candidatoId, titulo, descripcion, tipo, fechaHoraInicio, fechaHoraFin, ubicacion, recordatorioMinutos, modalidad, clasificacion, promotorId, ignorarEmpalme, recurrencia, invitadosIds } = req.body || {};
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
  // Candidato y cliente son excluyentes, siempre (una cita es con uno o con
  // otro, nunca los dos). El candidato ya no está limitado a las citas de
  // reclutamiento (PRP/ENTREVISTA_*, ver MODALIDADES_PROMOTOR más arriba):
  // desde 2026-09-25 (pedido del usuario: Diana/Michelle/Lupita agendando con
  // candidatos igual que con clientes) cualquier modalidad puede llevar un
  // candidato en vez de un cliente; una cita de reclutamiento sigue sin poder
  // llevar cliente.
  if (candidatoId && clienteId) return res.status(400).json({ error: 'Una cita no puede llevar cliente y candidato a la vez' });
  if (clienteId && MODALIDADES_PROMOTOR.includes(modalidad)) {
    return res.status(400).json({ error: 'Una cita de reclutamiento no lleva cliente (elige un candidato)' });
  }
  // Solo un evento PERSONAL (bloqueo de agenda) o de agenda propia del
  // promotor (reclutamiento) puede no llevar cliente ni candidato; toda cita
  // de trabajo con un asesor exige uno de los dos, igual que antes.
  if (!clienteId && !candidatoId && clasificacion !== 'PERSONAL' && !MODALIDADES_PROMOTOR.includes(modalidad)) {
    return res.status(400).json({ error: 'Selecciona un cliente o un candidato (salvo eventos personales o de agenda propia)' });
  }
  const cliente = clienteId ? await prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
  if (clienteId && !cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const candidato = candidatoId ? await prisma.candidato.findUnique({ where: { id: candidatoId } }) : null;
  if (candidatoId && !candidato) return res.status(400).json({ error: 'Candidato no encontrado' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || cliente?.asesorId || req.user.id);
  // Un no-asesor puede agendar sobre la agenda de otro (la asistente agenda las
  // entrevistas de la promotora): se valida que ese dueño exista y esté activo.
  if (asesorId !== req.user.id) {
    const dueno = await prisma.usuario.findUnique({ where: { id: asesorId }, select: { activo: true } });
    if (!dueno?.activo) return res.status(400).json({ error: 'El usuario al que se asigna la cita no existe o está inactivo' });
  }
  if (req.user.rol === 'ASESOR' && cliente && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'El cliente pertenece a otro asesor' });

  // Invitados adicionales (2026-09-25, pedido del usuario: "en todas las
  // cuentas del crm a la hora de crear citas haya una opción para invitar a
  // más personas del crm como asesores... o promotorías"): cualquier usuario
  // del sistema —asesor o promotora, nunca SUPERADMIN, que es la cuenta de
  // quien desarrolla el servicio— además del dueño (asesorId) y del promotor
  // de acompañamiento (promotorId, otro mecanismo aparte). Se valida antes de
  // crear nada para no dejar una cita a medio invitar si algún id es inválido.
  const invitadosIdsLimpios = Array.isArray(invitadosIds)
    ? [...new Set(invitadosIds.filter((iid) => iid && iid !== asesorId))]
    : [];
  let invitadosValidos = [];
  if (invitadosIdsLimpios.length) {
    invitadosValidos = await prisma.usuario.findMany({
      where: { id: { in: invitadosIdsLimpios }, activo: true, rol: { in: ['ADMIN', 'ASISTENTE', 'ASESOR'] } },
      select: { id: true, nombre: true, apellidoP: true },
    });
    if (invitadosValidos.length !== invitadosIdsLimpios.length) {
      return res.status(400).json({ error: 'Alguno de los invitados no existe o no está activo' });
    }
  }

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
    // Invitar al promotor a un horario que ya tiene ocupado no tiene sentido:
    // a diferencia del empalme entre asesores, esto bloquea siempre (no hay
    // ignorarEmpalme para este caso). Solo aplica si de verdad queda PENDIENTE
    // de su respuesta — si el propio promotor se agenda a sí mismo, ya se
    // valida como su propio empalme más arriba.
    if (promotorFinal && promotorFinal !== req.user.id) {
      const choquePromotor = await buscarChoquePromotor(promotorFinal, inicioInstancia, finInstancia);
      if (choquePromotor) {
        return res.status(409).json({
          error: 'El promotor ya tiene una cita a esa hora — elige otro horario libre.',
          empalmePromotor: choquePromotor,
        });
      }
    }
    // El estado NO se recibe del cliente: toda cita nueva nace PROGRAMADA y
    // cambia después con las acciones del ciclo de vida (completar, cancelar, no asistió).
    const cita = await prisma.cita.create({
      data: {
        asesorId, clienteId: clienteId || null, candidatoId: candidatoId || null,
        titulo, descripcion: descripcion || null,
        tipo: tipo || 'TELEFONICA',
        modalidad: modalidad || 'CITA_UNICA',
        clasificacion: clasificacion || ((clienteId || candidatoId) ? 'PRODUCTIVA' : 'PERSONAL'),
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

  // Una fila CitaInvitado por (cita creada × invitado): en una serie repetida
  // cada instancia lleva su propia invitación independiente (se acepta/
  // rechaza/reagenda por separado, mismo criterio que el resto de la serie),
  // pero el aviso de abajo se manda una sola vez por invitado para no saturar
  // su campana con N notificaciones idénticas.
  if (invitadosValidos.length) {
    await prisma.citaInvitado.createMany({
      data: creadas.flatMap((c) => invitadosValidos.map((u) => ({ citaId: c.id, usuarioId: u.id, invitadoPorId: req.user.id }))),
    });
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
    // Agendar la cita ES el objetivo de la clínica telefónica: si el cliente
    // tenía una fila abierta en el evaluador, se cierra como CITA_OBTENIDA
    // aunque la cita se haya agendado desde el calendario o la ficha. Mejor
    // esfuerzo: la cita ya quedó creada, esto solo mantiene el evaluador al día.
    marcarCitaObtenidaEnClinica(cliente.id).catch((e) =>
      console.warn(`[citas] no se pudo cerrar la clínica de ${cliente.id}: ${e.message}`)
    );
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

  // Aviso a cada invitado adicional (2026-09-25): mismo criterio de "mejor
  // esfuerzo" que el promotor — si el push falla la invitación ya quedó
  // registrada, se avisa por separado a cada persona de la lista.
  for (const u of invitadosValidos) {
    const quien = `${req.user.nombre} ${req.user.apellidoP || ''}`.trim();
    const tituloAviso = 'Nueva invitación a una cita';
    const cuerpo = creadas.length > 1
      ? `${quien} te invitó a ${creadas.length} citas: "${titulo}". Ábrelas para aceptar o rechazar.`
      : `${quien} te invitó a "${titulo}" el ${primera.fechaHoraInicio.toLocaleString('es-MX')}. Ábrela para aceptar o rechazar.`;
    try {
      await notificar(u.id, 'CITA_INVITACION', {
        titulo: tituloAviso,
        cuerpo,
        datos: { url: '/citas', citaId: primera.id },
        pushPayload: {
          title: tituloAviso,
          body: cuerpo,
          tag: `invitacion-cita-${primera.id}-${u.id}`,
          data: { url: '/citas' },
        },
      });
    } catch (err) {
      console.error(`No se pudo notificar la invitación a ${u.id}:`, err.message);
    }
  }

  const primeraConInvitados = invitadosValidos.length
    ? await prisma.cita.findUnique({ where: { id: primera.id }, include: { invitados: INCLUDE_INVITADOS.invitados } })
    : null;

  res.status(201).json({
    cita: primeraConInvitados ? { ...primera, invitados: primeraConInvitados.invitados } : primera,
    citas: creadas,
    omitidas: omitidas.length ? omitidas : undefined,
  });
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

// --- Invitados adicionales (2026-09-25) ---
// Mismo ciclo ACEPTAR/RECHAZAR/SUGERIR que ya existía para promotorId, pero
// por invitado en vez de uno solo por cita — ver modelo CitaInvitado.
// Deliberadamente SIN espejo en Google Calendar (ese mecanismo es propio del
// promotorId original, un evento por cita; generalizarlo a N invitados
// pediría N eventos por cita, fuera de alcance de este cambio) y sin bloqueo
// duro por choque de horario al invitar (a diferencia de promotorId +
// ACOMPANAMIENTO): aquí se advierte con el empalme normal, ignorable, porque
// el invitado ni siquiera ha respondido todavía.

async function obtenerInvitado(citaId, invitadoId) {
  return prisma.citaInvitado.findUnique({
    where: { id: invitadoId },
    include: { cita: true },
  });
}

router.patch('/:id/invitados/:invitadoId', asyncHandler(async (req, res) => {
  const { id, invitadoId } = req.params;
  const { respuesta, ignorarEmpalme, sugerenciaInicio, sugerenciaFin, sugerenciaNota } = req.body || {};
  if (!['ACEPTADA', 'RECHAZADA', 'SUGERIDA'].includes(respuesta)) {
    return res.status(400).json({ error: 'respuesta debe ser ACEPTADA, RECHAZADA o SUGERIDA' });
  }
  if (respuesta === 'SUGERIDA') {
    if (!sugerenciaInicio || !sugerenciaFin) return res.status(400).json({ error: 'sugerenciaInicio y sugerenciaFin son requeridos' });
    if (new Date(sugerenciaFin) <= new Date(sugerenciaInicio)) return res.status(400).json({ error: 'sugerenciaFin debe ser posterior a sugerenciaInicio' });
  }
  const invitado = await obtenerInvitado(id, invitadoId);
  if (!invitado || invitado.citaId !== id) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (invitado.usuarioId !== req.user.id) return res.status(403).json({ error: 'Solo la persona invitada puede responder' });
  const cita = invitado.cita;

  // Al aceptar, la cita pasa a ocupar la agenda del invitado: se advierte si
  // ya tiene algo a esa hora (se puede aceptar de todos modos, igual que el
  // alta) — mismo criterio que buscarEmpalme, ignorable con ignorarEmpalme.
  if (respuesta === 'ACEPTADA' && ignorarEmpalme !== true) {
    const solapada = await buscarEmpalme(req.user.id, cita.fechaHoraInicio, cita.fechaHoraFin, cita.id);
    if (solapada) return res.status(409).json({ error: 'Ya tienes una cita a esa hora', empalme: solapada });
  }

  const actualizado = await prisma.citaInvitado.update({
    where: { id: invitadoId },
    data: {
      estado: respuesta,
      respondidaEn: respuesta === 'SUGERIDA' ? null : new Date(),
      ...(respuesta === 'SUGERIDA'
        ? { sugerenciaInicio: new Date(sugerenciaInicio), sugerenciaFin: new Date(sugerenciaFin), sugerenciaNota: sugerenciaNota || null }
        : { sugerenciaInicio: null, sugerenciaFin: null, sugerenciaNota: null }),
    },
  });

  // Avisar al dueño de la cita: campana + push, mismo patrón que la
  // respuesta del promotor.
  try {
    const quien = `${req.user.nombre} ${req.user.apellidoP || ''}`.trim();
    const titulos = {
      ACEPTADA: 'Invitación aceptada',
      RECHAZADA: 'Invitación rechazada',
      SUGERIDA: `${quien} propuso otro horario`,
    };
    const cuerpos = {
      ACEPTADA: `${quien} aceptó tu invitación a "${cita.titulo}".`,
      RECHAZADA: `${quien} no podrá asistir a "${cita.titulo}".`,
      SUGERIDA: `${quien} propuso otro horario para "${cita.titulo}": ${new Date(sugerenciaInicio).toLocaleString('es-MX')}. Revisa y responde.`,
    };
    await notificar(cita.asesorId, 'CITA_INVITACION_RESPUESTA', {
      titulo: titulos[respuesta],
      cuerpo: cuerpos[respuesta],
      datos: { url: '/citas', citaId: cita.id, respuesta },
      pushPayload: {
        title: titulos[respuesta],
        body: cuerpos[respuesta],
        tag: `respuesta-invitado-${invitadoId}`,
        data: { url: '/citas' },
      },
    });
  } catch (err) {
    console.error('No se pudo notificar la respuesta al dueño de la cita:', err.message);
  }

  res.json(actualizado);
}));

// Respuesta del dueño de la cita a la sugerencia de horario de ESE invitado.
// Aceptar mueve la cita COMPLETA a ese horario (es un solo horario compartido
// por todos los que asisten) y deja a este invitado ACEPTADA — no toca el
// estado de otros invitados que ya hubieran respondido a un horario distinto,
// caso raro que se resuelve a mano si llega a pasar.
router.patch('/:id/invitados/:invitadoId/sugerencia', asyncHandler(async (req, res) => {
  const { id, invitadoId } = req.params;
  const { aceptar, ignorarEmpalme } = req.body || {};
  if (typeof aceptar !== 'boolean') return res.status(400).json({ error: 'aceptar (boolean) es requerido' });
  const invitado = await obtenerInvitado(id, invitadoId);
  if (!invitado || invitado.citaId !== id) return res.status(404).json({ error: 'Invitación no encontrada' });
  const cita = invitado.cita;
  if (cita.asesorId !== req.user.id) return res.status(403).json({ error: 'Solo el dueño de la cita puede responder' });
  if (invitado.estado !== 'SUGERIDA' || !invitado.sugerenciaInicio || !invitado.sugerenciaFin) {
    return res.status(400).json({ error: 'Este invitado no tiene una sugerencia de horario pendiente' });
  }

  if (aceptar && ignorarEmpalme !== true) {
    const solapada = await buscarEmpalme(cita.asesorId, invitado.sugerenciaInicio, invitado.sugerenciaFin, cita.id);
    if (solapada) return res.status(409).json({ error: 'Ya tienes una cita a esa hora', empalme: solapada });
  }

  const [actualizada] = await prisma.$transaction([
    aceptar
      ? prisma.cita.update({ where: { id }, data: { fechaHoraInicio: invitado.sugerenciaInicio, fechaHoraFin: invitado.sugerenciaFin } })
      : prisma.cita.findUnique({ where: { id } }),
    prisma.citaInvitado.update({
      where: { id: invitadoId },
      data: aceptar
        ? { estado: 'ACEPTADA', respondidaEn: new Date(), sugerenciaInicio: null, sugerenciaFin: null, sugerenciaNota: null }
        : { estado: 'PENDIENTE', sugerenciaInicio: null, sugerenciaFin: null, sugerenciaNota: null },
    }),
  ]);

  try {
    const quien = `${req.user.nombre} ${req.user.apellidoP || ''}`.trim();
    const tituloAviso = aceptar ? 'Nuevo horario confirmado' : 'Sugerencia no aceptada';
    const cuerpo = aceptar
      ? `${quien} aceptó tu propuesta de horario para "${cita.titulo}".`
      : `${quien} no aceptó tu propuesta de horario para "${cita.titulo}". Vuelve a proponer o responde la invitación.`;
    await notificar(invitado.usuarioId, 'CITA_SUGERENCIA_RESPUESTA', {
      titulo: tituloAviso,
      cuerpo,
      datos: { url: '/citas', citaId: cita.id, aceptada: aceptar },
      pushPayload: {
        title: tituloAviso,
        body: cuerpo,
        tag: `sugerencia-invitado-${invitadoId}`,
        data: { url: '/citas' },
      },
    });
  } catch (err) {
    console.error('No se pudo notificar la respuesta a la sugerencia:', err.message);
  }

  res.json(actualizada);
}));

// Cancelar/quitar un invitado (dueño de la cita): limpieza de una invitación
// de más, antes o después de que responda — nunca lo hace el propio
// invitado (para eso ya está RECHAZADA).
router.delete('/:id/invitados/:invitadoId', asyncHandler(async (req, res) => {
  const { id, invitadoId } = req.params;
  const invitado = await obtenerInvitado(id, invitadoId);
  if (!invitado || invitado.citaId !== id) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (invitado.cita.asesorId !== req.user.id) return res.status(403).json({ error: 'Solo el dueño de la cita puede quitar invitados' });
  await prisma.citaInvitado.delete({ where: { id: invitadoId } });
  res.status(204).end();
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
  // Mismas reglas del alta, que el PATCH no aplicaba: las modalidades de agenda
  // propia del promotor (PRP/entrevistas) no son para un asesor y no conviven
  // con un cliente. Sin esto, un asesor convertía su propia cita en "Entrevista
  // inicial" por PATCH aunque el POST se lo negara con 403.
  if (modalidad && MODALIDADES_PROMOTOR.includes(modalidad)) {
    if (req.user.rol === 'ASESOR') return res.status(403).json({ error: 'Este tipo de cita es solo para el promotor' });
    if (existente.clienteId) return res.status(400).json({ error: 'Una cita de reclutamiento no lleva cliente (elige un candidato)' });
  }
  if (modalidad) data.modalidad = modalidad;
  // Mismas reglas del alta: candidato y cliente son excluyentes, pero el
  // candidato ya no está limitado a citas de reclutamiento (ver POST /).
  if (candidatoId !== undefined) {
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
    // Un evento sin cliente ni candidato solo puede ser PERSONAL o de agenda propia del promotor.
    const modalidadEfectiva = modalidad || existente.modalidad;
    const candidatoEfectivo = candidatoId !== undefined ? candidatoId : existente.candidatoId;
    if (!existente.clienteId && !candidatoEfectivo && clasificacion !== 'PERSONAL' && !MODALIDADES_PROMOTOR.includes(modalidadEfectiva)) {
      return res.status(400).json({ error: 'Un evento sin cliente ni candidato solo puede ser personal o de agenda propia' });
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

  // Misma regla del alta: si la cita queda con una invitación todavía
  // PENDIENTE (el promotor no la ha aceptado, así que aún no ocupa su
  // agenda), reagendarla o reasignarle promotor no puede aterrizar en un
  // horario que ese promotor ya tiene ocupado. Esto nunca se ignora con
  // ignorarEmpalme — igual que en el alta.
  {
    const promotorEfectivo = data.promotorId !== undefined ? data.promotorId : existente.promotorId;
    const invitacionEfectiva = promotorId !== undefined && promotorId !== existente.promotorId
      ? (promotorEfectivo === req.user.id ? 'ACEPTADA' : 'PENDIENTE')
      : existente.invitacionEstado;
    if (promotorEfectivo && promotorEfectivo !== req.user.id && invitacionEfectiva === 'PENDIENTE') {
      const inicio = data.fechaHoraInicio || existente.fechaHoraInicio;
      const fin = data.fechaHoraFin || existente.fechaHoraFin;
      const choquePromotor = await buscarChoquePromotor(promotorEfectivo, inicio, fin, id);
      if (choquePromotor) {
        return res.status(409).json({
          error: 'El promotor ya tiene una cita a esa hora — elige otro horario libre.',
          empalmePromotor: choquePromotor,
        });
      }
    }
    if (promotorId !== undefined && promotorId !== existente.promotorId) {
      data.invitacionEstado = invitacionEfectiva;
      data.invitacionRespondidaEn = invitacionEfectiva === 'ACEPTADA' ? new Date() : null;
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
      ...INCLUDE_INVITADOS,
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
