import nodemailer from 'nodemailer';
import { promises as dns } from 'node:dns';

// Envío de correo de invitaciones de alta. Dos canales, en este orden:
//
// 1. Brevo (API HTTPS, api.brevo.com) si hay BREVO_API_KEY — es el canal de
//    producción: Railway bloquea los puertos SMTP salientes (25/465/587) fuera
//    del plan Pro, así que el correo tiene que salir por 443. El remitente
//    (MAIL_FROM o SMTP_FROM) debe estar verificado en la cuenta de Brevo.
// 2. SMTP clásico (SMTP_HOST/SMTP_USER/SMTP_PASS) como fallback para entornos
//    sin ese bloqueo.
//
// Igual que web-push: sin credenciales se deshabilita solo con un warning —
// nunca rompe la creación del usuario ni la generación del link de invitación
// (que siempre se puede copiar y compartir a mano).
let modo = null; // 'brevo' | 'smtp' | null
let smtp = null;

export function initMailer() {
  const { BREVO_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;

  if (BREVO_API_KEY) {
    modo = 'brevo';
    console.log('[mailer] Configurado OK (Brevo API)');
    // Self-check no bloqueante: valida la API key al arrancar para que los
    // logs digan si el canal de correo realmente funciona sin esperar a la
    // siguiente invitación.
    fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': BREVO_API_KEY },
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => {
        if (r.ok) console.log('[mailer] Brevo verificado');
        else console.warn(`[mailer] verificación Brevo falló: HTTP ${r.status} (¿API key inválida?)`);
      })
      .catch((e) => console.warn('[mailer] verificación Brevo falló:', e.message));
    return true;
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] Falta BREVO_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS en .env — envío de correo deshabilitado');
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

// Remitente: MAIL_FROM/SMTP_FROM admite "Nombre <correo>" o el correo pelón.
function remitente() {
  const raw = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const m = raw.match(/^\s*(.*?)\s*<(.+)>\s*$/);
  if (m) return { name: m[1] || 'Origen', email: m[2] };
  return { name: 'Origen', email: raw };
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

async function enviarBrevo({ to, nombre, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: remitente(),
      to: [{ email: to, name: nombre }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detalle = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Brevo HTTP ${res.status}: ${detalle}`);
  }
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
  if (modo === 'brevo') {
    await enviarBrevo({ to: email, nombre, subject, html });
    return true;
  }
  const transporter = await crearTransporte();
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject, html });
  return true;
}
