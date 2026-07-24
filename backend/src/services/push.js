import webPush from 'web-push';
import { prisma } from '../prisma.js';

let configured = false;

export function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    console.warn('[web-push] Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en .env — push deshabilitado');
    return false;
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  console.log('[web-push] Configurado OK');
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// Guarda una suscripción nueva (o la reutiliza si ya existe el endpoint).
export async function saveSubscription(usuarioId, subscription) {
  const { endpoint, keys, expirationTime } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Suscripción inválida (faltan keys/endpoint)');
  }
  const existente = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (existente) {
    if (existente.usuarioId !== usuarioId) {
      await prisma.pushSubscription.update({ where: { id: existente.id }, data: { usuarioId } });
    }
    return existente;
  }
  return prisma.pushSubscription.create({
    data: {
      usuarioId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      expirationTime: expirationTime ? Number(expirationTime) : null,
    },
  });
}

export async function removeSubscription(usuarioId, endpoint) {
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (!sub || sub.usuarioId !== usuarioId) return null;
  return prisma.pushSubscription.delete({ where: { id: sub.id } });
}

// Envía una push a todas las suscripciones de un usuario. Elimina las que fallen con 410/404.
export async function sendPushToUser(usuarioId, payload) {
  if (!configured) return { enviadas: 0, eliminadas: 0, error: 'web-push no configurado' };
  const subs = await prisma.pushSubscription.findMany({ where: { usuarioId } });
  if (subs.length === 0) return { enviadas: 0, eliminadas: 0 };

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let enviadas = 0;
  let eliminadas = 0;
  await Promise.all(subs.map(async (s) => {
    const subObj = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webPush.sendNotification(subObj, payloadStr);
      enviadas += 1;
    } catch (err) {
      // 410 Gone / 404 Not Found → suscripción inválida, eliminar
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        eliminadas += 1;
      } else {
        console.warn(`[web-push] Error enviando a ${s.endpoint}: ${err.statusCode} ${err.body || err.message}`);
      }
    }
  }));
  return { enviadas, eliminadas };
}

// Dispara notificación de un recordatorio vencido a su asesor y marca notificacionEnviada=true.
export async function notificarRecordatorio(nota) {
  const esPago = nota.tipo === 'RECORDATORIO_PAGO';
  const payload = {
    title: esPago
      ? 'Recordatorio de pago · Origen Promotoría'
      : 'Recordatorio · Origen Promotoría',
    body: nota.texto?.slice(0, 180) || 'Tienes un recordatorio pendiente',
    tag: esPago ? `pago-${nota.ventaId || nota.id}` : `nota-${nota.id}`,
    data: {
      url: nota.ventaId
        ? `${process.env.PUBLIC_URL || ''}/clientes/${nota.clienteId}`
        : `${process.env.PUBLIC_URL || ''}/clientes/${nota.clienteId}`,
      notaId: nota.id,
      clienteId: nota.clienteId,
      ventaId: nota.ventaId || null,
      tipo: esPago ? 'RECORDATORIO_PAGO' : 'RECORDATORIO',
    },
    requerirInteraccion: esPago,
    icon: '/origen-blanco.png',
  };
  await sendPushToUser(nota.asesorId, payload);
}
