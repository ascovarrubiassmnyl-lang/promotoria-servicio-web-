import nodemailer from 'nodemailer';

// Envío de correo por SMTP (invitaciones de alta). Igual que web-push: si no
// hay credenciales en el .env, se deshabilita solo con un warning — nunca
// rompe la creación del usuario ni la generación del link de invitación
// (que siempre se puede copiar y compartir a mano).
let _transporter;
let configured = false;

export function initMailer() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] Faltan SMTP_HOST/SMTP_USER/SMTP_PASS en .env — envío de correo deshabilitado');
    return false;
  }
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  configured = true;
  console.log('[mailer] Configurado OK');
  return true;
}

export async function enviarInvitacion({ email, nombre, link, expiraEn }) {
  if (!configured) return false;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const vence = new Date(expiraEn).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  await _transporter.sendMail({
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
