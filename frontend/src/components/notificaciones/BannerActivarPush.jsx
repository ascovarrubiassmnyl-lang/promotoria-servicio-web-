import { useEffect, useState } from 'react';
import { useNotif } from '../../context/NotifContext.jsx';

const DESCARTADO_KEY = 'crm:push:banner-descartado';

// Invitación proactiva a activar las notificaciones push, visible en el
// contenido del panel (no escondida en Configuración → Notificaciones).
// Antes de esto, activar push dependía de que la persona encontrara el botón
// por su cuenta dentro de Configuración: en la práctica, de 8 usuarios
// activos solo 2 lo habían hecho. Se muestra solo cuando el navegador
// soporta push y el permiso todavía no se decidió ('default'); una vez
// concedido o bloqueado, o si el usuario lo descarta, desaparece.
export default function BannerActivarPush() {
  const push = useNotif();
  const [busy, setBusy] = useState(false);
  const [descartado, setDescartado] = useState(() => sessionStorage.getItem(DESCARTADO_KEY) === '1');

  if (!push) return null;
  const { status, subscribeUser } = push;

  if (descartado || status !== 'default') return null;

  const activar = async () => {
    setBusy(true);
    await subscribeUser();
    setBusy(false);
  };

  const descartar = () => {
    sessionStorage.setItem(DESCARTADO_KEY, '1');
    setDescartado(true);
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-800 dark:bg-brand-900/30 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-brand-800 dark:text-brand-200">
        Activa las notificaciones de este dispositivo para enterarte al instante de citas, recordatorios e invitaciones — como una notificación de WhatsApp o correo.
      </p>
      <div className="flex shrink-0 gap-2">
        <button onClick={activar} disabled={busy} className="btn-primary whitespace-nowrap">
          {busy ? 'Activando…' : 'Activar notificaciones'}
        </button>
        <button onClick={descartar} className="btn-secondary whitespace-nowrap">Ahora no</button>
      </div>
    </div>
  );
}
