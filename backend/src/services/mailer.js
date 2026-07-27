import nodemailer from 'nodemailer';
import { promises as dns } from 'node:dns';

// Envío de correo por SMTP (invitaciones de alta). Igual que web-push: si no
// hay credenciales en el .env, se deshabilita solo con un warning — nunca
// rompe la creación del usuario ni la generación del link de invitación
// (que siempre se puede copiar y compartir a mano).
let smtp = null;
let configured = false;

export function initMailer() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] Faltan SMTP_HOST/SMTP_USER/SMTP_PASS en .env — envío de correo deshabilitado');
    return false;
  }
  smtp = {
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  };
  configured = true;
  console.log('[mailer] Configurado OK');
  // Self-check no bloqueante: hace el handshake SMTP completo (conexión,
  // STARTTLS, auth) al arrancar, para que los logs digan si el canal de
  // correo realmente funciona sin esperar a la siguiente invitación.
  crearTransporte()
    .then((t) => t.verify())
    .then(() => console.log('[mailer] Conexión SMTP verificada'))
    .catch((e) => console.warn('[mailer] verificación SMTP falló:', e.message));
  return true;
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
  if (!configured) return false;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const vence = new Date(expiraEn).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  const transporter = await crearTransporte();
  await transporter.sendMail({
    from,
    to: email,
    subject: 'Tu acceso al panel de Origen',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #131a52;">Hola, ${nombre}</h2>
        <p>Se creó tu cuenta en el panel de Origen. Para activarla, entra al siguiente enlace y confirma con tu cuenta de Google (debe ser <b>${email}</b>):</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #131a52; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Activar mi cuenta</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Este enlace vence el ${vence}. Si no esperabas este correo, ignóralo.</p>
      </div>
    `,
  });
  return true;
}
