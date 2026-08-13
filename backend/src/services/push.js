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

// Códigos con los que el push service dice "esta suscripción ya no sirve":
// 404/410 = endpoint inexistente o expirado; 401/403 = credenciales VAPID
// rechazadas para ese endpoint (típico tras rotar las claves) — el navegador
// tiene que volver a suscribirse, así que conservar la fila solo hace que
// cada envío posterior falle en silencio.
const CODIGOS_SUSCRIPCION_INVALIDA = [401, 403, 404, 410];

// 400 normalmente sí es "payload/header mal armado nuestro" — pero Apple Web
// Push (endpoint web.push.apple.com, Safari/iOS/macOS) usa 400 en vez de
// 401/403 para decir "la VAPID public key con la que firmaste no es la que
// esta suscripción tiene registrada" (reason: VapidPkHashMismatch). Pasa
// siempre que las claves VAPID se generaron/rotaron después de que ese
// dispositivo se suscribió: la suscripción vieja queda muerta para siempre,
// fallando en cada envío — hay que limpiarla igual que 401/403, o el usuario
// nunca vuelve a recibir nada aunque el resto del sistema funcione bien.
const RAZONES_400_INVALIDAS = ['VapidPkHashMismatch'];

function esSuscripcionInvalida(err) {
  if (CODIGOS_SUSCRIPCION_INVALIDA.includes(err.statusCode)) return true;
  if (err.statusCode === 400) {
    try {
      const body = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
      if (body && RAZONES_400_INVALIDAS.includes(body.reason)) return true;
    } catch { /* body no era JSON parseable: no lo tratamos como inválida */ }
  }
  return false;
}

// Envía una push a todas las suscripciones de un usuario. Elimina las que el
// push service reporte como inválidas (ver esSuscripcionInvalida).
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
      if (esSuscripcionInvalida(err)) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        eliminadas += 1;
      } else {
        console.warn(`[web-push] Error enviando a ${s.endpoint}: ${err.statusCode} ${err.body || err.message}`);
      }
    }
  }));
  return { enviadas, eliminadas };
}

// El aviso de un recordatorio vencido vive ahora en
// utils/notificaciones.js → notificarRecordatorioNota(): persiste la
// notificación in-app y luego intenta el push. Este servicio se queda solo
// con el transporte (suscripciones + envío).
