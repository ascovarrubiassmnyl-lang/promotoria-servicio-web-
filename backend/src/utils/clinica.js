import { prisma } from '../prisma.js';

// Helpers compartidos de Clínica telefónica. El evaluador se llena SOLO (ya no
// hay importación manual), desde tres puntos que arman la fila igual:
//  - routes/clientes.js → alta de un prospecto nuevo (entra de inmediato).
//  - jobs/automatizacionesJob.js → barrido horario de los que se atoraron.
//  - routes/citas.js → cierre de la fila cuando se agenda la cita por fuera.

// Lunes de la semana de `fecha` (la clínica opera lunes–domingo, igual que
// 25 puntos). Se normaliza a medianoche UTC porque `semanaInicio` es @db.Date.
export function inicioSemana(fecha = new Date()) {
  const d = new Date(fecha);
  const dia = d.getDay(); // 0=domingo
  const desdeLunes = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - desdeLunes);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function edadDeFechaNacimiento(f) {
  if (!f) return null;
  const n = new Date(f);
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e -= 1;
  return e >= 0 && e < 130 ? e : null;
}

// Fila del evaluador a partir de un Cliente ya creado.
export function filaProspectoDesdeCliente(cliente, { asesorId, semanaInicio }) {
  return {
    asesorId,
    semanaInicio,
    clienteId: cliente.id,
    nombre: `${cliente.nombre} ${cliente.apellidoP} ${cliente.apellidoM || ''}`.trim(),
    contacto: cliente.telefono || cliente.email || null,
    edad: edadDeFechaNacimiento(cliente.fechaNacimiento),
    resultado: 'PENDIENTE',
  };
}

// Mete al cliente en el evaluador de la semana en curso si no está ya ahí.
// Anti-duplicación por (clienteId, semanaInicio), igual que la importación
// manual. Devuelve la fila creada o null si ya existía.
export async function agregarClienteAClinica(cliente, { asesorId, semanaInicio } = {}) {
  const semana = semanaInicio || inicioSemana();
  const yaEsta = await prisma.prospectoClinica.findFirst({
    where: { clienteId: cliente.id, semanaInicio: semana },
    select: { id: true },
  });
  if (yaEsta) return null;
  return prisma.prospectoClinica.create({
    data: filaProspectoDesdeCliente(cliente, { asesorId: asesorId || cliente.asesorId, semanaInicio: semana }),
  });
}

// --- Barrido automático de la clínica -------------------------------------
//
// La clínica NO se llena a mano: la importación manual ("Traer de mi cartera")
// y las dos preguntas del alta se eliminaron. Un prospecto entra solo cuando
// cae en alguno de estos dos casos.
//
//   1. Recién registrado y nunca contactado.
//   2. Lleva DIAS_SIN_AVANCE días atorado en PROSPECTO — el caso que la
//      clínica existe para forzar: perseguir al que no avanza a cita ni se
//      descarta.
//
// El "contador" es DERIVADO, no una columna nueva: sale de `creadoEn`,
// `fechaUltimaLlamada`, `fechaUltimaCita` y `estado`, que ya se mantienen.
// Guardar un contador sería otro campo que se desincroniza en cuanto alguien
// llama al cliente desde fuera del CRM.
export const DIAS_SIN_AVANCE = 4;

// Un prospecto "no ha avanzado" si sigue en la etapa PROSPECTO: cualquier otra
// etapa (CITA, PROPUESTA, CIERRE_FIRMA…) ya significa que se movió. Etapas que
// no son PROSPECTO nunca entran a la clínica.
const ETAPA_SIN_AVANCE = 'PROSPECTO';

// Clientes del asesor que deben estar en el evaluador de la semana.
// `semanaInicio` acota la anti-duplicación: si ya está en la fila de ESTA
// semana no se vuelve a agregar, pero sí reaparece la semana siguiente si
// sigue sin avanzar (es justo lo que se quiere: arrastre automático).
export async function clientesParaClinica(asesorId, { semanaInicio, ahora = new Date() } = {}) {
  const semana = semanaInicio || inicioSemana(ahora);
  const corte = new Date(ahora.getTime() - DIAS_SIN_AVANCE * 24 * 60 * 60 * 1000);

  const yaEnSemana = await prisma.prospectoClinica.findMany({
    where: { asesorId, semanaInicio: semana, clienteId: { not: null } },
    select: { clienteId: true },
  });
  const excluir = yaEnSemana.map((p) => p.clienteId);

  return prisma.cliente.findMany({
    where: {
      asesorId,
      archivadoEn: null,
      estado: ETAPA_SIN_AVANCE,
      id: excluir.length ? { notIn: excluir } : undefined,
      // Nunca se le ha conseguido cita (si ya tuvo una, avanzó).
      fechaUltimaCita: null,
      // Ya cerrada la venta no hay que llamarlo para conseguir cita.
      ventas: { none: { estado: { in: ['PENDIENTE_PAGAR', 'FIRMADA', 'APROBADA', 'PAGADA'] } } },
      // Con cita agendada ya hay siguiente paso; no es material de clínica.
      citas: { none: { estado: { in: ['PROGRAMADA', 'CONFIRMADA'] } } },
      // Los dos disparadores: nunca contactado, o contactado hace más de
      // DIAS_SIN_AVANCE días sin que eso lo moviera de etapa.
      OR: [
        { fechaUltimaLlamada: null, creadoEn: { lte: corte } },
        { fechaUltimaLlamada: { lte: corte } },
      ],
    },
    select: {
      id: true, nombre: true, apellidoP: true, apellidoM: true,
      telefono: true, email: true, fechaNacimiento: true, asesorId: true,
    },
    orderBy: { creadoEn: 'asc' },
    take: 100,
  });
}

// El cliente avanzó FUERA de la clínica (le agendaron cita desde el
// calendario o la ficha): sus filas abiertas del evaluador se cierran como
// CITA_OBTENIDA, que es lo que de hecho pasó. Sin esto el asesor seguiría
// viendo en la clínica a alguien con quien ya quedó, y el conteo de citas de
// la semana se quedaría corto.
//
// Solo toca filas PENDIENTE/CONTACTADO: una ya marcada CONVERTIDO o
// DESCARTADO es una decisión tomada que no se pisa.
export async function marcarCitaObtenidaEnClinica(clienteId) {
  if (!clienteId) return 0;
  const { count } = await prisma.prospectoClinica.updateMany({
    where: { clienteId, resultado: { in: ['PENDIENTE', 'CONTACTADO'] } },
    data: { resultado: 'CITA_OBTENIDA' },
  });
  return count;
}

// Sincroniza el evaluador de la semana de un asesor: agrega los que faltan.
// No borra filas existentes — una fila ya trabajada (con notas, resultado) es
// registro de lo que el asesor hizo, no un cache que se pueda regenerar.
export async function sincronizarClinicaDeAsesor(asesorId, opciones = {}) {
  const semana = opciones.semanaInicio || inicioSemana(opciones.ahora);
  const pendientes = await clientesParaClinica(asesorId, { ...opciones, semanaInicio: semana });
  if (!pendientes.length) return 0;
  const { count } = await prisma.prospectoClinica.createMany({
    data: pendientes.map((c) => filaProspectoDesdeCliente(c, { asesorId, semanaInicio: semana })),
  });
  return count;
}
