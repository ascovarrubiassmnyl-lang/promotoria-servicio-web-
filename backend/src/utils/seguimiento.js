import { prisma } from '../prisma.js';
import { registrarActividad } from './actividad.js';
import { ETAPAS_CLINICA, inicioSemana } from './clinica.js';

// Un solo punto de captura para el trabajo de prospección (2026-10-13).
//
// Antes, una llamada o una cita había que registrarla en tres lugares que no
// se hablaban (ficha, 25 puntos, clínica) y Metas/embudo marcaban 0 llamadas
// porque nada en la UI creaba la actividad LLAMADA. Estas funciones son la
// única implementación de "qué se mueve cuando pasa X": las rutas solo las
// llaman.

// Resultado de una llamada → lo que significa para el resto del CRM.
//  - contacto: se habló con la persona (sube a CONTACTADO, cierra la fila
//    PENDIENTE de la clínica como CONTACTADO).
//  - descarta: no le interesa (etapa DESCARTADO, clínica DESCARTADO).
export const RESULTADOS_LLAMADA = {
  NO_CONTESTO: { contacto: false },
  CONTACTADO: { contacto: true },
  VOLVER_A_LLAMAR: { contacto: true },
  CITA: { contacto: true },
  NO_INTERESADO: { contacto: true, descarta: true },
};

// Etapas en las que conseguir una cita SÍ es un avance (mismo criterio que la
// captura de Cal.com): antes de CITA o fuera del embudo. Nunca retrocede a
// quien ya va en PROPUESTA, CIERRE…
export const ETAPAS_ANTES_DE_CITA = ['PROSPECTO', 'CONTACTADO', 'STANDBY', 'RETARGETING', 'DESCARTADO'];

const ZONA = 'America/Mexico_City';

// "Hoy" en México como Date @db.Date (mismo cálculo que el candado de 25 puntos).
export function hoyMx() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

// Inicio y fin del día de hoy en México como instantes reales (para filtrar
// citas y recordatorios, que se guardan en UTC). El offset se lee de Intl,
// no se fija a mano.
export function rangoHoyMx(ahora = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' })
    .formatToParts(ahora).find((p) => p.type === 'timeZoneName').value.replace('GMT', '') || '+00:00';
  const inicio = new Date(`${iso}T00:00:00${offset}`);
  return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
}

// Suma en el formato de 25 puntos del día. Solo escribe HOY, así que nunca
// choca con el candado anti-falsificación (que bloquea días cerrados).
export async function sumarEnPuntosDeHoy(asesorId, campo, n = 1) {
  const fecha = hoyMx();
  await prisma.registroPuntos.upsert({
    where: { asesorId_fecha: { asesorId, fecha } },
    create: { asesorId, fecha, [campo]: n },
    update: { [campo]: { increment: n } },
  });
}

// El cliente consiguió cita: sube a CITA (sin retroceder) y queda la fecha.
export async function marcarCitaEnCliente(clienteId, inicio = new Date(), db = prisma) {
  await db.cliente.updateMany({
    where: { id: clienteId, estado: { in: ETAPAS_ANTES_DE_CITA } },
    data: { estado: 'CITA' },
  });
  await db.cliente.update({
    where: { id: clienteId },
    data: { fechaUltimaCita: inicio, necesitaSeguimiento: false },
  });
}

// Registra una llamada y propaga su resultado. `asesorId` = dueño de la
// cartera (las métricas se acotan por él).
export async function registrarLlamada({ cliente, asesorId, resultado, nota, recordarEn }) {
  const efecto = RESULTADOS_LLAMADA[resultado];
  const nombre = `${cliente.nombre} ${cliente.apellidoP || ''}`.trim();
  const ahora = new Date();

  const actividad = await registrarActividad(asesorId, 'LLAMADA', {
    clienteId: cliente.id,
    cliente: nombre,
    resultado,
    nota: nota || null,
  });

  const cambios = { fechaUltimaLlamada: ahora };
  if (efecto.descarta) {
    cambios.estado = 'DESCARTADO';
    cambios.necesitaSeguimiento = false;
  }
  await prisma.cliente.update({ where: { id: cliente.id }, data: cambios });

  // Se habló con él: sube a CONTACTADO solo desde etapas de clínica (la misma
  // guarda que usa la clínica — no se le pisa el avance a quien ya va más
  // adelante).
  if (efecto.contacto && !efecto.descarta) {
    await prisma.cliente.updateMany({
      where: { id: cliente.id, estado: { in: ETAPAS_CLINICA } },
      data: { estado: 'CONTACTADO' },
    });
  }

  // La fila de la clínica de esta semana refleja la llamada.
  if (efecto.contacto) {
    await prisma.prospectoClinica.updateMany({
      where: { clienteId: cliente.id, semanaInicio: inicioSemana(), resultado: { in: ['PENDIENTE', 'CONTACTADO'] } },
      data: { resultado: efecto.descarta ? 'DESCARTADO' : 'CONTACTADO' },
    });
  }

  await sumarEnPuntosDeHoy(asesorId, 'llamadasRealizadas');

  let recordatorio = null;
  if (recordarEn) {
    recordatorio = await prisma.nota.create({
      data: {
        clienteId: cliente.id,
        asesorId,
        tipo: 'RECORDATORIO',
        destinatario: 'ASESOR',
        texto: `Volver a llamar a ${nombre}${nota ? ` — ${nota}` : ''}`,
        fechaAviso: recordarEn,
      },
    });
  }

  return { actividad, recordatorio };
}
