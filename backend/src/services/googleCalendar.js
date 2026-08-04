// Integración con Google Calendar (2026-08).
//
// Cada usuario conecta SU PROPIA cuenta de Google desde Configuración (OAuth
// con consentimiento explícito); guardamos el refresh token para poder crear
// el evento del acompañamiento en su calendario cuando ACEPTA la invitación.
//
// Convención del proyecto: "mejor esfuerzo", igual que el mailer y el push. Si
// Google no está configurado, el usuario no conectó su cuenta o la API falla,
// se registra en consola y la operación principal (aceptar/rechazar la cita)
// NUNCA se bloquea — el CRM es la fuente de verdad, Google es un espejo.
//
// Se usa la API REST directo (fetch nativo de Node 18+) en vez de la librería
// `googleapis`: solo se necesitan 4 llamadas y esa dependencia pesa decenas de
// MB. `google-auth-library` ya está en el proyecto pero solo para verificar
// credenciales de invitación, no para este flujo.
import { prisma } from '../prisma.js';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];

export function googleCalendarConfigurado() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri() {
  const base = (process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}/api/google-calendar/callback`;
}

// URL de consentimiento. `state` lleva el id del usuario firmado por el caller.
export function urlDeConsentimiento(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    // offline + consent = Google entrega refresh_token (sin esto solo lo manda
    // la primera vez y perderíamos el acceso al reconectar).
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

// Canjea el código del callback por tokens y guarda la cuenta del usuario.
export async function conectarCuenta(usuarioId, code) {
  const r = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.refresh_token) {
    throw new Error(data.error_description || data.error || 'No se recibió refresh_token de Google');
  }

  // El id_token trae el correo de la cuenta conectada (solo informativo).
  let email = '';
  try {
    const payload = JSON.parse(Buffer.from(String(data.id_token).split('.')[1], 'base64').toString());
    email = payload.email || '';
  } catch { /* el correo es opcional */ }

  const expiraEn = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  return prisma.googleCalendarCuenta.upsert({
    where: { usuarioId },
    create: { usuarioId, email, refreshToken: data.refresh_token, accessToken: data.access_token || null, expiraEn },
    update: { email, refreshToken: data.refresh_token, accessToken: data.access_token || null, expiraEn },
  });
}

// Access token vigente (renueva con el refresh token si venció).
async function accessTokenDe(cuenta) {
  if (cuenta.accessToken && cuenta.expiraEn && cuenta.expiraEn.getTime() > Date.now() + 60_000) {
    return cuenta.accessToken;
  }
  const r = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: cuenta.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'No se pudo renovar el token de Google');
  }
  await prisma.googleCalendarCuenta.update({
    where: { id: cuenta.id },
    data: {
      accessToken: data.access_token,
      expiraEn: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    },
  });
  return data.access_token;
}

function cuerpoEvento(cita) {
  const quien = cita.asesor ? `${cita.asesor.nombre} ${cita.asesor.apellidoP || ''}`.trim() : 'un asesor';
  const conQuien = cita.cliente
    ? `${cita.cliente.nombre} ${cita.cliente.apellidoP || ''}`.trim()
    : cita.candidato ? `${cita.candidato.nombre} ${cita.candidato.apellidoP || ''}`.trim() : null;
  return {
    summary: `Acompañamiento: ${cita.titulo}`,
    description: [
      `Acompañamiento agendado por ${quien} en Origen Promotoría.`,
      conQuien ? `Cliente / candidato: ${conQuien}` : null,
      cita.descripcion || null,
    ].filter(Boolean).join('\n'),
    location: cita.ubicacion || undefined,
    start: { dateTime: new Date(cita.fechaHoraInicio).toISOString() },
    end: { dateTime: new Date(cita.fechaHoraFin).toISOString() },
    // Marca de origen: permite reconocer los eventos creados por el CRM.
    source: { title: 'Origen Promotoría', url: (process.env.PUBLIC_URL || '') + '/citas' },
  };
}

// Crea el evento en el calendario del usuario. Devuelve el id del evento o
// null si no aplica (sin configurar / sin cuenta conectada / error).
export async function crearEvento(usuarioId, cita) {
  if (!googleCalendarConfigurado()) return null;
  try {
    const cuenta = await prisma.googleCalendarCuenta.findUnique({ where: { usuarioId } });
    if (!cuenta) return null;
    const token = await accessTokenDe(cuenta);
    const r = await fetch(`${CAL_API}/calendars/${encodeURIComponent(cuenta.calendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoEvento(cita)),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Error creando evento en Google Calendar');
    return data.id || null;
  } catch (err) {
    console.error('[google-calendar] No se pudo crear el evento:', err.message);
    return null;
  }
}

export async function borrarEvento(usuarioId, eventId) {
  if (!googleCalendarConfigurado() || !eventId) return false;
  try {
    const cuenta = await prisma.googleCalendarCuenta.findUnique({ where: { usuarioId } });
    if (!cuenta) return false;
    const token = await accessTokenDe(cuenta);
    const r = await fetch(`${CAL_API}/calendars/${encodeURIComponent(cuenta.calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    // 410 = ya estaba borrado en Google; se considera éxito.
    return r.ok || r.status === 410;
  } catch (err) {
    console.error('[google-calendar] No se pudo borrar el evento:', err.message);
    return false;
  }
}

// ¿El usuario tiene libre ese horario en su Google Calendar? Devuelve
// { libre, ocupadoDe, ocupadoA } o null si no se pudo consultar (sin cuenta,
// sin configurar o error) — el caller decide qué hacer con null.
export async function horarioLibre(usuarioId, inicio, fin) {
  if (!googleCalendarConfigurado()) return null;
  try {
    const cuenta = await prisma.googleCalendarCuenta.findUnique({ where: { usuarioId } });
    if (!cuenta) return null;
    const token = await accessTokenDe(cuenta);
    const r = await fetch(`${CAL_API}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: new Date(inicio).toISOString(),
        timeMax: new Date(fin).toISOString(),
        items: [{ id: cuenta.calendarId }],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Error consultando disponibilidad');
    const busy = data.calendars?.[cuenta.calendarId]?.busy || [];
    if (!busy.length) return { libre: true };
    return { libre: false, ocupadoDe: busy[0].start, ocupadoA: busy[0].end };
  } catch (err) {
    console.error('[google-calendar] No se pudo consultar disponibilidad:', err.message);
    return null;
  }
}

export async function desconectar(usuarioId) {
  const cuenta = await prisma.googleCalendarCuenta.findUnique({ where: { usuarioId } });
  if (!cuenta) return false;
  // Revocar en Google (mejor esfuerzo) antes de borrar la fila local.
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(cuenta.refreshToken)}`, { method: 'POST' });
  } catch (err) {
    console.error('[google-calendar] No se pudo revocar el token:', err.message);
  }
  await prisma.googleCalendarCuenta.delete({ where: { usuarioId } });
  return true;
}
