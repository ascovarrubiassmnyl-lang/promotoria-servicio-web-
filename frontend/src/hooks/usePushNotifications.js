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
  const [rota, setRota] = useState(false); // el navegador cree tener suscripción, pero el servidor no la tiene (se limpió por inválida)
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
          // El navegador tiene una suscripción local, pero el servidor pudo
          // haberla borrado (VAPID rotada, endpoint muerto — ver
          // sendPushToUser): confirmar contra el servidor antes de darla
          // por "Activa". Sin esto, un usuario con la suscripción muerta
          // veía "Activa ✓" para siempre y nunca recibía nada.
          try {
            const { data } = await api.post('/push/estado', { endpoint: sub.endpoint });
            if (data.registrada) {
              setSubscription(sub);
              setRota(false);
            } else {
              // El servidor no la tiene: reenviar el mismo endpoint no basta
              // (fue creado con una VAPID key vieja, por eso se limpió) —
              // hace falta des-suscribir y crear una nueva, y eso pide
              // interacción del usuario (subscribeUser). Se marca "rota"
              // para que la UI lo muestre como inactivo, no como activo.
              setSubscription(sub);
              setRota(true);
            }
          } catch {
            // Sin poder confirmar con el servidor, no afirmar "Activa".
            setSubscription(sub);
          }
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
      // Suscripción "rota": el navegador la tiene pero fue creada con una
      // VAPID public key distinta a la actual del servidor (por eso el
      // servidor la había limpiado). Reusarla repite el mismo endpoint y el
      // mismo fallo — hay que des-suscribir y crear una nueva contra la key
      // vigente.
      if (sub && rota) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
      if (!sub) {
        const { data } = await api.get('/push/vapid-public-key');
        const appServerKey = urlBase64ToUint8Array(data.publicKey);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
      }
      await api.post('/push/subscribe', sub.toJSON());
      setSubscription(sub);
      setRota(false);
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
      setRota(false);
      try { await api.post('/push/unsubscribe', { endpoint: subscription.endpoint }); } catch {}
      return ok;
    } catch (err) {
      setError(err?.message || 'Error al desuscribirse');
      return false;
    }
  }

  async function sendTest() {
    try {
      const { data } = await api.post('/push/test');
      // El backend responde {enviadas, eliminadas}: si no envió ninguna, la
      // suscripción no está registrada en el servidor — no mentir con éxito.
      // Si además "eliminadas" > 0, sendPushToUser ya la limpió (inválida) en
      // este mismo intento: reflejarlo como rota para que el botón cambie a
      // "Activar" en vez de seguir ofreciendo "Enviar prueba"/"Desactivar".
      if (data && typeof data.enviadas === 'number' && data.enviadas === 0) {
        if (data.eliminadas > 0) { setRota(true); setSubscription(null); }
        setError('No hay suscripción activa en el servidor. Vuelve a activar las notificaciones.');
        return false;
      }
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo enviar prueba');
      return false;
    }
  }

  return { status, subscription, rota, error, subscribeUser, unsubscribeUser, sendTest };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
