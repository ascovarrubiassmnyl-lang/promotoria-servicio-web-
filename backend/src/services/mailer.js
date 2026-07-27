import nodemailer from 'nodemailer';
import { promises as dns } from 'node:dns';

// Envío de correo de invitaciones de alta. Dos canales, en este orden:
//
// 1. Gmail API (HTTPS, gmail.googleapis.com) si hay GMAIL_CLIENT_ID +
//    GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN — es el canal de producción:
//    Railway bloquea los puertos SMTP salientes (25/465/587) fuera del plan
//    Pro, así que el correo tiene que salir por 443. El refresh token se
//    genera una sola vez con `backend/scripts/gmail-refresh-token.mjs`
//    (scope gmail.send); Gmail envía siempre como la cuenta autenticada.
// 2. SMTP clásico (SMTP_HOST/SMTP_USER/SMTP_PASS) como fallback para entornos
//    sin ese bloqueo.
//
// Igual que web-push: sin credenciales se deshabilita solo con un warning —
// nunca rompe la creación del usuario ni la generación del link de invitación
// (que siempre se puede copiar y compartir a mano).
let modo = null; // 'gmail' | 'smtp' | null
let smtp = null;

export function initMailer() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;

  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN) {
    modo = 'gmail';
    console.log('[mailer] Configurado OK (Gmail API)');
    // Self-check no bloqueante: refresca el access token al arrancar para que
    // los logs digan si las credenciales OAuth realmente funcionan sin
    // esperar a la siguiente invitación.
    tokenGmail()
      .then(() => console.log('[mailer] Gmail API verificada'))
      .catch((e) => console.warn('[mailer] verificación Gmail falló:', e.message));
    return true;
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] Faltan GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REFRESH_TOKEN (o SMTP_*) en .env — envío de correo deshabilitado');
    return false;
  }
  modo = 'smtp';
  smtp = {
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  };
  console.log('[mailer] Configurado OK (SMTP)');
  // Mismo self-check al arranque, vía handshake SMTP completo.
  crearTransporte()
    .then((t) => t.verify())
    .then(() => console.log('[mailer] Conexión SMTP verificada'))
    .catch((e) => console.warn('[mailer] verificación SMTP falló:', e.message));
  return true;
}

// Access token de Gmail con caché: los que emite Google duran ~1h, se renueva
// con 60s de colchón para no enviar con uno a punto de vencer.
let _token = null; // { valor, vence }
async function tokenGmail() {
  if (_token && Date.now() < _token.vence) return _token.valor;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detalle = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`OAuth Google HTTP ${res.status}: ${detalle}`);
  }
  const { access_token, expires_in } = await res.json();
  _token = { valor: access_token, vence: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

async function enviarGmail({ to, subject, html }) {
  const token = await tokenGmail();
  // Mensaje RFC 822 completo, base64url. Gmail reescribe el From a la cuenta
  // autenticada (o a un alias verificado de esa cuenta), así que MAIL_FROM
  // solo aporta el nombre visible.
  const from = process.env.MAIL_FROM || 'Origen';
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detalle = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail HTTP ${res.status}: ${detalle}`);
  }
}

// Railway no tiene salida IPv6 y el resolver puede devolver la dirección AAAA
// de Gmail → connect ENETUNREACH 2607:f8b0::… Se resuelve la IPv4 a mano y se
// conecta a ella; `servername` conserva el hostname para que el certificado
// TLS valide. Si no hay registro A, se cae al hostname tal cual.
async function crearTransporte() {
  let host = smtp.host;
  const tls = {};
  try {
    const [ip] = await dns.resolve4(smtp.host);
    if (ip) {
      host = ip;
      tls.servername = smtp.host;
    }
  } catch {}
  return nodemailer.createTransport({
    ...smtp,
    host,
    tls,
    // Sin esto, un SMTP colgado (red bloqueada, TLS mal negociado) puede
    // tardar minutos en fallar por su cuenta — mucho más que el timeout del
    // frontend (15s) — y deja la creación de usuario esperando indefinidamente.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
}

export async function enviarInvitacion({ email, nombre, link, expiraEn }) {
  if (!modo) return false;
  const vence = new Date(expiraEn).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  const subject = 'Tu acceso al panel de Origen';
  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #131a52;">Hola, ${nombre}</h2>
        <p>Se creó tu cuenta en el panel de Origen. Para activarla, entra al siguiente enlace y confirma con tu cuenta de Google (debe ser <b>${email}</b>):</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #131a52; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Activar mi cuenta</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Este enlace vence el ${vence}. Si no esperabas este correo, ignóralo.</p>
      </div>
    `;
  if (modo === 'gmail') {
    await enviarGmail({ to: email, subject, html });
    return true;
  }
  const transporter = await crearTransporte();
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject, html });
  return true;
}
