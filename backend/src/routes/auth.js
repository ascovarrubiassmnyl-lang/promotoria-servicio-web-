import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { signToken, marcaCierreSesiones } from '../utils/tokens.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { accesosDe } from '../middleware/permisos.js';
import { bloqueoLogin, registrarFalloLogin, limpiarFallosLogin } from '../utils/limiteLogin.js';
import { errorPassword } from '../utils/password.js';

const router = Router();

// Mismo mensaje para "no existe" y "contraseña incorrecta": no se le dice a
// quien prueba correos cuáles sí tienen cuenta.
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';

// Hash de relleno: si el correo no existe se compara contra este, para que la
// respuesta tarde lo mismo que con un correo real (sin esto, el tiempo de
// respuesta delata qué correos están registrados).
const HASH_RELLENO = bcrypt.hashSync('relleno-sin-cuenta', 10);

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }
  const correo = email.trim().toLowerCase().slice(0, 254);

  const espera = bloqueoLogin(correo, req.ip);
  if (espera > 0) {
    const minutos = Math.ceil(espera / 60);
    res.set('Retry-After', String(espera));
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} y vuelve a intentar.`,
    });
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: correo } });
  const ok = await bcrypt.compare(password.slice(0, 200), usuario?.password || HASH_RELLENO);
  if (!usuario || !ok) {
    registrarFalloLogin(correo, req.ip);
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }
  limpiarFallosLogin(correo, req.ip);
  // Solo después de una contraseña correcta se dice que la cuenta está
  // desactivada: quien no la conoce no aprende nada de esta respuesta.
  if (!usuario.activo) {
    return res.status(403).json({ error: 'Tu cuenta está desactivada. Pide a tu promotora que la reactive.' });
  }

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
  if (typeof actual !== 'string' || !actual) return res.status(400).json({ error: 'Falta la contraseña actual' });
  const invalida = errorPassword(nueva);
  if (invalida) return res.status(400).json({ error: invalida });

  // Mismo freno que el login: con un token robado no se debe poder adivinar
  // la contraseña actual a fuerza de intentos.
  const espera = bloqueoLogin(req.user.email, req.ip);
  if (espera > 0) {
    res.set('Retry-After', String(espera));
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos y vuelve a intentar.' });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
  const ok = await bcrypt.compare(actual.slice(0, 200), usuario.password);
  if (!ok) {
    registrarFalloLogin(req.user.email, req.ip);
    return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  }

  // Cambiar la contraseña cierra las sesiones de los demás dispositivos (si
  // alguien la conocía, ya no le sirve el token que tenía). Este dispositivo
  // recibe un token nuevo para no sacar a quien la acaba de cambiar.
  const hash = await bcrypt.hash(nueva, 10);
  const actualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { password: hash, sesionesDesde: marcaCierreSesiones() },
  });
  limpiarFallosLogin(req.user.email, req.ip);
  res.json({ ok: true, token: signToken(actualizado) });
}));

// "Cerrar sesión en los demás dispositivos": para un celular perdido o una
// computadora prestada. Mismo mecanismo que el cambio de contraseña.
router.post('/cerrar-otras-sesiones', authenticate, asyncHandler(async (req, res) => {
  const usuario = await prisma.usuario.update({
    where: { id: req.user.id },
    data: { sesionesDesde: marcaCierreSesiones() },
  });
  res.json({ ok: true, token: signToken(usuario) });
}));

export default router;
