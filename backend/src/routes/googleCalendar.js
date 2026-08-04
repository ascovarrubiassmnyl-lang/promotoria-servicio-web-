// Conexión de la cuenta de Google Calendar del usuario (2026-08).
// Es self-service (como las notificaciones push): cada quien conecta SU propia
// cuenta, así que no lleva permiso de sección — solo `authenticate`.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import {
  googleCalendarConfigurado, urlDeConsentimiento, conectarCuenta, desconectar,
} from '../services/googleCalendar.js';

const router = Router();

// Estado de la conexión del usuario logueado.
router.get('/estado', authenticate, asyncHandler(async (req, res) => {
  if (!googleCalendarConfigurado()) {
    return res.json({ configurado: false, conectado: false });
  }
  const cuenta = await prisma.googleCalendarCuenta.findUnique({ where: { usuarioId: req.user.id } });
  res.json({
    configurado: true,
    conectado: !!cuenta,
    email: cuenta?.email || null,
    conectadoEn: cuenta?.creadoEn || null,
  });
}));

// Inicia el flujo: devuelve la URL de consentimiento de Google. El `state` es
// un JWT corto con el id del usuario — el callback llega sin sesión (Google
// redirige el navegador), así que la identidad tiene que viajar firmada ahí.
router.post('/conectar', authenticate, asyncHandler(async (req, res) => {
  if (!googleCalendarConfigurado()) {
    return res.status(503).json({ error: 'Google Calendar no está configurado en el servidor' });
  }
  const state = jwt.sign({ sub: req.user.id, uso: 'google-calendar' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  res.json({ url: urlDeConsentimiento(state) });
}));

// Callback de Google (redirección del navegador, SIN authenticate: la
// identidad viene en el `state` firmado). Responde con una página que se
// cierra sola o redirige a Configuración.
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const volver = (mensaje, ok = false) => {
    const destino = `/configuracion?google=${ok ? 'ok' : 'error'}&mensaje=${encodeURIComponent(mensaje)}`;
    res.redirect(destino);
  };
  if (error) return volver('Se canceló la autorización en Google');
  if (!code || !state) return volver('Faltan datos en la respuesta de Google');

  let usuarioId;
  try {
    const payload = jwt.verify(String(state), process.env.JWT_SECRET);
    if (payload.uso !== 'google-calendar') throw new Error('state inválido');
    usuarioId = payload.sub;
  } catch {
    return volver('El enlace de autorización venció, vuelve a intentarlo');
  }

  try {
    const cuenta = await conectarCuenta(usuarioId, String(code));
    return volver(`Conectado como ${cuenta.email || 'tu cuenta de Google'}`, true);
  } catch (err) {
    console.error('[google-calendar] Error en callback:', err.message);
    return volver('No se pudo conectar la cuenta de Google');
  }
}));

router.delete('/', authenticate, asyncHandler(async (req, res) => {
  await desconectar(req.user.id);
  res.json({ ok: true });
}));

export default router;
