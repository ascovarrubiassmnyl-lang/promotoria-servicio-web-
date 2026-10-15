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
//
// Dos casos más (2026-10-15) en los que la persona NUNCA recibiría la push y
// antes no se le decía nada: en iPhone, Safari sin la app instalada reporta
// push "no soportado" (Apple solo lo permite desde la pantalla de inicio), y
// un permiso bloqueado solo se reactiva desde los ajustes del navegador.
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function Aviso({ children, onDescartar }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/30 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-amber-900 dark:text-amber-200">{children}</p>
      <button onClick={onDescartar} className="btn-secondary shrink-0 whitespace-nowrap">Entendido</button>
    </div>
  );
}

export default function BannerActivarPush() {
  const push = useNotif();
  const [busy, setBusy] = useState(false);
  const [descartado, setDescartado] = useState(() => sessionStorage.getItem(DESCARTADO_KEY) === '1');

  if (!push) return null;
  const { status, subscribeUser } = push;

  if (descartado) return null;

  const descartar = () => {
    sessionStorage.setItem(DESCARTADO_KEY, '1');
    setDescartado(true);
  };

  if (status === 'unsupported' && esIOS() && !instalada()) {
    return (
      <Aviso onDescartar={descartar}>
        Para recibir en tu iPhone los avisos de citas e invitaciones, toca <strong>Compartir → Agregar a pantalla de inicio</strong> y abre el CRM desde ese ícono. En Safari suelto, Apple no deja que lleguen.
      </Aviso>
    );
  }
  if (status === 'denied') {
    return (
      <Aviso onDescartar={descartar}>
        Bloqueaste las notificaciones de este dispositivo, así que no te llegan las invitaciones al celular. Para activarlas, permite las notificaciones del CRM en los ajustes del navegador o del teléfono.
      </Aviso>
    );
  }
  if (status !== 'default') return null;

  const activar = async () => {
    setBusy(true);
    await subscribeUser();
    setBusy(false);
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
