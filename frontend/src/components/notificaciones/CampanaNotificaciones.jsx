import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hora, fechaCorta } from '../../lib/format.js';
import { infoTipoNotificacion } from './tipos.jsx';
import {
  useNoLeidas, useListaNotificaciones, useMarcarLeida, useMarcarTodasLeidas,
} from '../../hooks/useNotificaciones.js';

const IconCampana = (p) => (
  <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// "Hoy 14:30" / "Ayer 09:05" / "12 ago" — mismo criterio de Hoy/Ayer que el
// timeline de Actividad.
function cuando(iso) {
  const d = new Date(iso);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy - dia) / 86400000);
  if (diff === 0) return `Hoy ${hora(iso)}`;
  if (diff === 1) return `Ayer ${hora(iso)}`;
  return fechaCorta(iso);
}

// Campana + panel de notificaciones del usuario en sesión. Las notificaciones
// son la fuente de verdad de los avisos que también salen por push: aunque el
// navegador o el celular no entregue la push, aquí siempre quedan.
//
// `alineacion`: 'derecha' cuelga el panel hacia la izquierda del botón (barra
// superior móvil); 'izquierda' lo abre hacia la derecha, que es lo que
// necesita el sidebar de escritorio para no salirse de la pantalla.
export default function CampanaNotificaciones({ className = '', alineacion = 'derecha', etiqueta = null }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const { data: noLeidas = 0 } = useNoLeidas();
  const { data, isLoading } = useListaNotificaciones(abierto);
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();
  const lista = data?.notificaciones || [];

  // Cerrar al hacer clic fuera o con Escape (mismo patrón que MenuAcciones).
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const abrir = (n) => {
    if (!n.leida) marcarLeida.mutate(n.id);
    setAbierto(false);
    // La url del payload es la misma que usa el service worker al tocar la
    // push; puede venir absoluta (PUBLIC_URL) desde el job de recordatorios.
    const url = n.datos?.url;
    if (!url) return;
    try {
      navigate(url.startsWith('http') ? new URL(url).pathname : url);
    } catch {
      /* url inválida: no navegar */
    }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`relative flex items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/60 transition ${
          etiqueta ? 'w-full gap-3 px-2 py-2' : 'h-11 w-11 justify-center'
        }`}
        aria-label={noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : 'Notificaciones'}
        aria-haspopup="true"
        aria-expanded={abierto}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <IconCampana className="w-5 h-5" />
          {noLeidas > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </span>
        {etiqueta && <span className="text-sm font-medium">{etiqueta}</span>}
      </button>

      {abierto && (
        <div className={`absolute bottom-full z-50 mb-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 ${
          alineacion === 'izquierda' ? 'left-0' : 'right-0 bottom-auto top-full mb-0 mt-1'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400 disabled:opacity-50"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {isLoading && <p className="px-3 py-6 text-center text-sm text-slate-400">Cargando…</p>}
            {!isLoading && lista.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                No tienes notificaciones
              </p>
            )}
            {lista.map((n) => {
              const info = infoTipoNotificacion(n.tipo);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => abrir(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/40 ${
                    n.leida ? '' : 'bg-brand-50/60 dark:bg-brand-500/5'
                  }`}
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${info.marker}`}>
                    {info.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{n.titulo}</span>
                      {!n.leida && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${info.dot}`} />}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{n.cuerpo}</span>
                    <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">{cuando(n.creadoEn)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
