import { createContext, useContext, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext.jsx';
import { usePushNotifications } from '../hooks/usePushNotifications.js';

const NotifContext = createContext(null);

// Re-suscribe automáticamente al loguear (si el usuario ya había concedido permiso).
// Expone helpers para suscribir/desuscribir/enviar prueba y el estado actual.
export function NotifProvider({ children }) {
  const { user } = useAuth();
  const push = usePushNotifications({ enabled: !!user });
  const { subscription, rota, subscribeUser } = push;
  // Corre el auto-suscribe UNA sola vez por sesión: si no, el efecto se
  // dispararía en cada render y volvería a suscribir justo después de que el
  // usuario pulsa "Desactivar" (lo re-activaba al instante).
  const autoHecho = useRef(false);

  useEffect(() => {
    if (!user) { autoHecho.current = false; return; }
    if (autoHecho.current) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    autoHecho.current = true;
    // Con suscripción ya presente y sana el hook la persiste solo; si no hay
    // suscripción, o el servidor la marcó rota (VAPID rotada — ver
    // usePushNotifications), la crea de nuevo automáticamente: el usuario ya
    // había concedido el permiso una vez, no debería tener que volver a
    // Configuración a notar que dejó de funcionar.
    if (!subscription || rota) subscribeUser();
  }, [user, subscription, rota, subscribeUser]);

  return <NotifContext.Provider value={push}>{children}</NotifContext.Provider>;
}

export const useNotif = () => useContext(NotifContext);
