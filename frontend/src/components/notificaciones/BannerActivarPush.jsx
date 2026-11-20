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

// Avisos informativos (iPhone sin instalar, permiso bloqueado): una sola línea
// compacta y, al cerrarlos, NO vuelven (2026-11-20, auditoría móvil: ocupaban
// un cuarto de pantalla en cada vista y regresaban en cada sesión). No hay
// nada que la persona pueda hacer desde aquí, así que repetirlo es ruido; el
// estado sigue visible en Configuración → Notificaciones.
function Aviso({ children, onDescartar }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 py-2 pl-3 pr-1 text-xs leading-snug text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
      <p className="min-w-0 flex-1 py-1">{children}</p>
      <button onClick={onDescartar} className="-my-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50" aria-label="Cerrar aviso">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

// Descartes permanentes por estado (localStorage, mejor esfuerzo).
const leerPermanente = (clave) => { try { return localStorage.getItem(clave) === '1'; } catch { return false; } };
const guardarPermanente = (clave) => { try { localStorage.setItem(clave, '1'); } catch { /* sin storage */ } };
const KEY_IOS = 'crm:push:aviso-ios-cerrado';
const KEY_BLOQUEADO = 'crm:push:aviso-bloqueado-cerrado';

export default function BannerActivarPush() {
  const push = useNotif();
  const [busy, setBusy] = useState(false);
  const [descartado, setDescartado] = useState(() => sessionStorage.getItem(DESCARTADO_KEY) === '1');
  const [cerrados, setCerrados] = useState(() => ({ ios: leerPermanente(KEY_IOS), bloqueado: leerPermanente(KEY_BLOQUEADO) }));

  if (!push) return null;
  const { status, subscribeUser } = push;

  if (descartado) return null;

  const descartar = () => {
    sessionStorage.setItem(DESCARTADO_KEY, '1');
    setDescartado(true);
  };

  const cerrarPara = (tipo, clave) => { guardarPermanente(clave); setCerrados((c) => ({ ...c, [tipo]: true })); };

  if (status === 'unsupported' && esIOS() && !instalada()) {
    if (cerrados.ios) return null;
    return (
      <Aviso onDescartar={() => cerrarPara('ios', KEY_IOS)}>
        Para recibir avisos en tu iPhone: <strong>Compartir → Agregar a pantalla de inicio</strong> y abre el CRM desde ese ícono.
      </Aviso>
    );
  }
  if (status === 'denied') {
    if (cerrados.bloqueado) return null;
    return (
      <Aviso onDescartar={() => cerrarPara('bloqueado', KEY_BLOQUEADO)}>
        Las notificaciones están bloqueadas en este dispositivo. Actívalas en los ajustes del teléfono si quieres recibir avisos.
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
