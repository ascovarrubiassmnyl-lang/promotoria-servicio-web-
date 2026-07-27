import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { signToken } from '../utils/tokens.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { accesosDe } from '../middleware/permisos.js';

const router = Router();

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

// Google Identity Services solo se usa para redimir invitaciones (ver
// routes/invitaciones.js) — ahí se verifica que el correo de la cuenta de
// Google coincida con el del perfil ya creado por un promotor y la persona
// crea su propia contraseña. No hay login recurrente con Google: de ahí en
// adelante todos entran por /login con email + contraseña.

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
