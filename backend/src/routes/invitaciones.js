import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../prisma.js';
import { signToken } from '../utils/tokens.js';
import { asyncHandler } from '../middleware/error.js';
import { accesosDe, logPermiso } from '../middleware/permisos.js';

// Router público (sin `authenticate`): el asesor todavía no tiene sesión
// cuando abre su link de invitación. La única puerta de entrada es el
// token de un solo uso que generó un promotor en Asesores → Equipo.
const router = Router();

let _googleClient = null;
const googleClient = () => (_googleClient ??= new OAuth2Client(process.env.GOOGLE_CLIENT_ID));

async function invitacionVigente(token) {
  const invitacion = await prisma.invitacionUsuario.findUnique({
    where: { token },
    include: { usuario: { select: { id: true, nombre: true, apellidoP: true, email: true } } },
  });
  if (!invitacion) return { error: 'Este enlace de invitación no existe.' };
  if (invitacion.usadaEn) return { error: 'Este enlace de invitación ya fue usado.' };
  if (invitacion.expiraEn < new Date()) return { error: 'Este enlace de invitación venció. Pide a tu promotor uno nuevo.' };
  return { invitacion };
}

// Valida el token antes de mostrar el botón de Google (solo lo mínimo para
// que la persona confirme que es su invitación, nada sensible).
router.get('/:token', asyncHandler(async (req, res) => {
  const { invitacion, error } = await invitacionVigente(req.params.token);
  if (error) return res.status(410).json({ error });
  const { nombre, apellidoP, email } = invitacion.usuario;
  res.json({ nombre, apellidoP, email });
}));

// Redime la invitación: la persona crea su contraseña (login normal de ahí
// en adelante, en /login) y confirma con Google solo para verificar que el
// correo de esa cuenta coincide exactamente con el del perfil que el
// promotor ya creó — nunca se crea una cuenta nueva ni se decide el rol a
// partir del correo de Google, y Google no vuelve a usarse tras este paso.
router.post('/:token/google', asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'El acceso con Google no está configurado' });
  }
  const { invitacion, error } = await invitacionVigente(req.params.token);
  if (error) return res.status(410).json({ error });

  const { credential, password } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Falta la credencial de Google' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  let payload;
  try {
    const ticket = await googleClient().verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Credencial de Google inválida' });
  }
  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'La cuenta de Google no tiene un email verificado' });
  }
  if (payload.email.toLowerCase() !== invitacion.usuario.email) {
    return res.status(403).json({ error: `Esta invitación es para ${invitacion.usuario.email}. Entra con esa cuenta de Google.` });
  }

  const hash = await bcrypt.hash(password, 10);
  const [usuario] = await prisma.$transaction([
    prisma.usuario.update({
      where: { id: invitacion.usuario.id },
      data: { activo: true, password: hash, ...(payload.picture ? { fotoUrl: payload.picture } : {}) },
    }),
    prisma.invitacionUsuario.update({ where: { token: req.params.token }, data: { usadaEn: new Date() } }),
  ]);

  await logPermiso(null, 'INVITACION_REDIMIDA', {
    usuarioId: usuario.id,
    usuarioNombre: `${usuario.nombre} ${usuario.apellidoP || ''}`.trim(),
  });

  const token = signToken(usuario);
  const { password: _p, ...sinPassword } = usuario;
  res.json({ token, usuario: { ...sinPassword, accesos: await accesosDe(usuario) } });
}));

export default router;
