import { prisma } from '../prisma.js';
import { sendPushToUser } from '../services/push.js';

// Conjunto canónico de tipos de notificación in-app. Alcance FIJO: solo los
// eventos que también disparan push. El espejo de presentación (label, color)
// vive en frontend/src/components/notificaciones/tipos.js — no inventar tipos
// fuera de esta lista ni duplicar labels en componentes.
export const TIPOS_NOTIFICACION = [
  'CITA_INVITACION',            // un asesor invitó al promotor a un acompañamiento
  'CITA_INVITACION_RESPUESTA',  // el promotor respondió: ACEPTADA / RECHAZADA / SUGERIDA
  'CITA_SUGERENCIA_RESPUESTA',  // el asesor respondió la sugerencia de horario
  'RECORDATORIO',
  'RECORDATORIO_PAGO',
];

// Punto de entrada ÚNICO para avisar a un usuario. Persiste la notificación
// in-app (fuente de verdad: es lo que verá en la campana aunque nunca reciba
// el push) y DESPUÉS intenta el push sobre esa fila ya guardada.
//
// El create SÍ propaga su error —igual que registrarActividad—: si no se pudo
// persistir no hay aviso en ningún lado y quien llama debe enterarse (el job
// de recordatorios depende de esto para no marcar la nota como notificada).
// El push, en cambio, es mejor esfuerzo: su fallo solo queda registrado en
// pushIntentado/pushEnviado y nunca tumba la notificación ya creada.
//
// `pushPayload` permite reusar tal cual el payload que ya se enviaba (tag,
// icon, requerirInteraccion…); si se omite se arma uno a partir de
// titulo/cuerpo/datos.
export async function notificar(destinatarioId, tipo, { titulo, cuerpo, datos = {}, pushPayload } = {}) {
  if (!TIPOS_NOTIFICACION.includes(tipo)) {
    throw new Error(`Tipo de notificación no canónico: ${tipo}`);
  }
  const notificacion = await prisma.notificacion.create({
    data: { destinatarioId, tipo, titulo, cuerpo, datos },
  });

  let pushEnviado = false;
  try {
    const payload = pushPayload || { title: titulo, body: cuerpo, data: datos };
    const r = await sendPushToUser(destinatarioId, payload);
    pushEnviado = (r?.enviadas || 0) > 0;
  } catch (err) {
    console.error(`[notificaciones] push falló para ${notificacion.id}: ${err.message}`);
  }
  await prisma.notificacion
    .update({ where: { id: notificacion.id }, data: { pushIntentado: true, pushEnviado } })
    .catch(() => {});

  return notificacion;
}

// Recordatorio vencido (Nota RECORDATORIO / RECORDATORIO_PAGO) → notificación
// in-app + push. Sustituye a la antigua notificarRecordatorio() de
// services/push.js, conservando el mismo payload que ya se enviaba.
export async function notificarRecordatorioNota(nota) {
  const esPago = nota.tipo === 'RECORDATORIO_PAGO';
  const titulo = esPago
    ? 'Recordatorio de pago · Origen Promotoría'
    : 'Recordatorio · Origen Promotoría';
  const cuerpo = nota.texto?.slice(0, 180) || 'Tienes un recordatorio pendiente';
  const datos = {
    url: `${process.env.PUBLIC_URL || ''}/clientes/${nota.clienteId}`,
    notaId: nota.id,
    clienteId: nota.clienteId,
    ventaId: nota.ventaId || null,
  };
  return notificar(nota.asesorId, esPago ? 'RECORDATORIO_PAGO' : 'RECORDATORIO', {
    titulo,
    cuerpo,
    datos,
    pushPayload: {
      title: titulo,
      body: cuerpo,
      tag: esPago ? `pago-${nota.ventaId || nota.id}` : `nota-${nota.id}`,
      data: { ...datos, tipo: esPago ? 'RECORDATORIO_PAGO' : 'RECORDATORIO' },
      requerirInteraccion: esPago,
      icon: '/origen-blanco.png',
    },
  });
}
