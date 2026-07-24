import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

//.estado del permiso/soporte de notificaciones del navegador.
const STATUS = {
  UNSUPPORTED: 'unsupported',
  DEFAULT: 'default',
  GRANTED: 'granted',
  DENIED: 'denied',
};

// Registra el service worker /sw-push.js y (si el usuario lo permite) se suscribe
// a Web Push con la VAPID public key del backend. Persistimos la suscripción
// en el backend vía POST /api/push/subscribe. Idempotente.
export function usePushNotifications({ enabled = true } = {}) {
  const [status, setStatus] = useState(STATUS.DEFAULT);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus(STATUS.UNSUPPORTED);
      return;
    }
    const permission = Notification.permission;
    setStatus(permission === 'granted' ? STATUS.GRANTED : (permission === 'denied' ? STATUS.DENIED : STATUS.DEFAULT));

    let reg = null;
    (async () => {
      try {
        reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
        reg.addEventListener('updatefound', () => {});
        await reg.update();
        let sub = await reg.pushManager.getSubscription();
        if (sub) {
          setSubscription(sub);
          return;
        }
        // No forzar suscripción automática; pedir después con subscribeUser()
      } catch (err) {
        console.warn('[push] SW register error:', err);
      }
    })();

    return () => {
      // no desregistraramos el SW para no des-suscribir
    };
  }, [enabled]);

  // Pide permiso + crea suscripción y la envía al backend.
  // Devuelve false/true según éxito.
  async function subscribeUser() {
    if (status === STATUS.UNSUPPORTED) return false;
    if (Notification.permission === 'denied') { setError('Permiso de notificaciones bloqueado'); setStatus(STATUS.DENIED); return false; }
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission === 'granted' ? STATUS.GRANTED : STATUS.DENIED);
      if (permission !== 'granted') { setError('Permiso no concedido'); return false; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { data } = await api.get('/push/vapid-public-key');
        const appServerKey = urlBase64ToUint8Array(data.publicKey);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
      }
      await api.post('/push/subscribe', sub.toJSON());
      setSubscription(sub);
      return true;
    } catch (err) {
      setError(err?.message || 'Error al suscribirse');
      return false;
    }
  }

  // Des-suscribe del navegador y notifica al backend.
  async function unsubscribeUser() {
    if (!subscription) return true;
    try {
      const ok = await subscription.unsubscribe();
      setSubscription(null);
      try { await api.post('/push/unsubscribe', { endpoint: subscription.endpoint }); } catch {}
      return ok;
    } catch (err) {
      setError(err?.message || 'Error al desuscribirse');
      return false;
    }
  }

  async function sendTest() {
    try {
      await api.post('/push/test');
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo enviar prueba');
      return false;
    }
  }

  return { status, subscription, error, subscribeUser, unsubscribeUser, sendTest };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
