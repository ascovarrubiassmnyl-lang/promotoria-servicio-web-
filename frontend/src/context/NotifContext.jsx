import { createContext, useContext, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { usePushNotifications } from '../hooks/usePushNotifications.js';

const NotifContext = createContext(null);

// Re-suscribe automáticamente al loguear (si el usuario ya había concedido permiso).
// Expone helpers para suscribir/desuscribir/enviar prueba y el estado actual.
export function NotifProvider({ children }) {
  const { user } = useAuth();
  const push = usePushNotifications({ enabled: !!user });

  // Al montar con usuario logueado y permiso ya concedido, intenta re-suscribir.
  const autoSubscribe = useCallback(async () => {
    if (!user) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    // solo si no hay suscripción todavía
    if (push.subscription) return;
    await push.subscribeUser();
  }, [user, push]);

  useEffect(() => { autoSubscribe(); }, [autoSubscribe]);

  return <NotifContext.Provider value={push}>{children}</NotifContext.Provider>;
}

export const useNotif = () => useContext(NotifContext);
