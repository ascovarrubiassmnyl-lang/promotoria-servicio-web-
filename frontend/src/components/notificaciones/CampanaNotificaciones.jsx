import { NavLink } from 'react-router-dom';
import { useNoLeidas } from '../../hooks/useNotificaciones.js';

const IconCampana = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// Acceso a la sección de notificaciones (/notificaciones) con el contador de
// no leídas. Es un enlace de navegación, NO un panel desplegable: la bandeja
// es una sección completa como cualquier otra del CRM.
//
// `etiqueta`: texto junto al ícono (sidebar de escritorio). Sin etiqueta queda
// solo el ícono, para la barra superior de móvil.
export default function CampanaNotificaciones({ className = '', etiqueta = null }) {
  const { data: noLeidas = 0 } = useNoLeidas();

  return (
    <NavLink
      to="/notificaciones"
      className={({ isActive }) =>
        `relative flex items-center rounded-lg transition ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
            : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/60'
        } ${etiqueta ? 'w-full gap-3 px-3 py-2' : 'h-11 w-11 justify-center'} ${className}`
      }
      aria-label={noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : 'Notificaciones'}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <IconCampana className="w-5 h-5" />
        {noLeidas > 0 && !etiqueta && (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </span>
      {etiqueta && (
        <>
          <span className="text-sm font-medium">{etiqueta}</span>
          {noLeidas > 0 && (
            <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white tabular-nums">
              {noLeidas > 99 ? '99+' : noLeidas}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
