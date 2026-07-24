import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { getVapidPublicKey, saveSubscription, removeSubscription } from '../services/push.js';

const router = Router();
router.use(authenticate);

// Devuelve la VAPID public key al cliente (para suscripción con pushManager.subscribe)
router.get('/vapid-public-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'Web Push no configurado en el servidor' });
  res.json({ publicKey: key });
});

// Crea/actualiza suscripción para el usuario logueado
router.post('/subscribe', asyncHandler(async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'subscription inválida' });
  await saveSubscription(req.user.id, subscription);
  res.json({ ok: true });
}));

// Elimina suscripción por endpoint (al desuscribir o logout)
router.post('/unsubscribe', asyncHandler(async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
  await removeSubscription(req.user.id, endpoint);
  res.json({ ok: true });
}));

// Test: envía una notificación al usuario logueado (para verificar permisos/setup)
router.post('/test', asyncHandler(async (req, res) => {
  const { sendPushToUser } = await import('../services/push.js');
  const r = await sendPushToUser(req.user.id, {
    title: 'Prueba · Origen Promotoría',
    body: 'Si ves esto, las notificaciones push funcionan ✓',
    tag: 'test-push',
  });
  res.json(r);
}));

export default router;
