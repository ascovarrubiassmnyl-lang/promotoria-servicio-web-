import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../prisma.js';
import { signToken } from '../utils/tokens.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { accesosDe } from '../middleware/permisos.js';

const router = Router();

let _googleClient = null;
const googleClient = () => (_googleClient ??= new OAuth2Client(process.env.GOOGLE_CLIENT_ID));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

  const usuario = await prisma.usuario.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, usuario.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = signToken(usuario);
  const { password: _p, ...sinPassword } = usuario;
  // accesos = mapa {seccion: boolean} calculado en servidor (override → rol →
  // denegar). El frontend lo consume tal cual en puede(); no re-deriva reglas.
  res.json({ token, usuario: { ...sinPassword, accesos: await accesosDe(usuario) } });
}));

// Acceso / registro con Google (Google Identity Services): el frontend manda
// el ID token del botón y aquí se verifica contra GOOGLE_CLIENT_ID.
//  - Email ya registrado y activo → sesión normal (mismo shape que /login).
//  - Email nuevo → se crea como ASESOR **inactivo** (decisión de producto:
//    el CRM contiene datos de clientes; un promotor debe activar la cuenta
//    en Asesores → Equipo antes de que pueda entrar). Nunca nace activo.
router.post('/google', asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'El acceso con Google no está configurado' });
  }
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Falta la credencial de Google' });

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

  const email = payload.email.toLowerCase();
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario) {
    // La cuenta local no usa contraseña (entra con Google): se guarda un hash
    // aleatorio irrecuperable para cumplir el campo requerido.
    await prisma.usuario.create({
      data: {
        email,
        nombre: payload.given_name || payload.name || 'Usuario',
        apellidoP: payload.family_name || '',
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        rol: 'ASESOR',
        activo: false,
        fotoUrl: payload.picture || null,
      },
    });
    return res.status(403).json({
      pendiente: true,
      error: 'Tu cuenta se creó correctamente. Un promotor debe activarla antes de que puedas entrar.',
    });
  }

  if (!usuario.activo) {
    return res.status(403).json({ pendiente: true, error: 'Tu cuenta está pendiente de activación por un promotor.' });
  }

  const token = signToken(usuario);
  const { password: _p, ...sinPassword } = usuario;
  res.json({ token, usuario: { ...sinPassword, accesos: await accesosDe(usuario) } });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) =>
  res.json({ usuario: { ...req.user, accesos: await accesosDe(req.user) } })));

router.post('/cambiar-password', authenticate, asyncHandler(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva || nueva.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

  const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
  const ok = await bcrypt.compare(actual, usuario.password);
  if (!ok) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

  const hash = await bcrypt.hash(nueva, 10);
  await prisma.usuario.update({ where: { id: usuario.id }, data: { password: hash } });
  res.json({ ok: true });
}));

export default router;
