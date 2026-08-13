import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, MenuAcciones } from '../components/ui.jsx';
import { hora, fechaCorta } from '../lib/format.js';
import { TIPOS_NOTIFICACION, infoTipoNotificacion } from '../components/notificaciones/tipos.jsx';
import {
  useListaNotificaciones, useMarcarLeida, useMarcarTodasLeidas, useEliminarNotificacion,
} from '../hooks/useNotificaciones.js';

// Agrupación por día (Hoy / Ayer / fecha), mismo criterio que ActivityTimeline.
const diaKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const diaLabel = (iso) => {
  const d = new Date(iso);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy - a) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return fechaCorta(iso);
};

const ESTADOS = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'no-leidas', label: 'Sin leer' },
  { valor: 'leidas', label: 'Leídas' },
];

function Fila({ n, onAbrir, onLeida, onEliminar }) {
  const info = infoTipoNotificacion(n.tipo);
  const navegable = !!n.datos?.url;
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition ${
        n.leida
          ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
          : 'border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/5'
      } hover:border-slate-300 dark:hover:border-slate-600`}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${info.marker}`}>
        {info.icon}
      </span>

      <button
        type="button"
        onClick={() => onAbrir(n)}
        disabled={!navegable}
        className={`min-w-0 flex-1 text-left ${navegable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{info.label}</p>
          {!n.leida && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${info.dot}`} aria-label="Sin leer" />}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{n.titulo}</p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{n.cuerpo}</p>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500 whitespace-nowrap pt-0.5">
          {hora(n.creadoEn)}
        </span>
        <MenuAcciones
          small
          items={[
            navegable && { label: 'Abrir', onClick: () => onAbrir(n) },
            n.leida
              ? { label: 'Marcar como no leída', onClick: () => onLeida(n.id, false) }
              : { label: 'Marcar como leída', onClick: () => onLeida(n.id, true) },
            'sep',
            { label: 'Eliminar', danger: true, onClick: () => onEliminar(n) },
          ]}
        />
      </div>
    </div>
  );
}

// Sección completa de notificaciones (/notificaciones). Es la bandeja de
// entrada del usuario en sesión: la fuente de verdad de todo aviso que también
// sale por push — aunque el celular/navegador no entregue la push, aquí queda.
// Cada quien ve exclusivamente las suyas (el servidor fuerza destinatarioId,
// sin excepción de admin).
export default function Notificaciones() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState('todas');
  const [tipo, setTipo] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [porEliminar, setPorEliminar] = useState(null);

  const { data, isLoading } = useListaNotificaciones({ estado, tipo, pagina });
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();
  const eliminar = useEliminarNotificacion();

  const lista = data?.notificaciones || [];
  const noLeidas = data?.noLeidas ?? 0;
  const conteos = data?.conteos || {};
  const total = data?.total ?? 0;
  const paginas = data?.paginas ?? 1;
  const totalBandeja = Object.values(conteos).reduce((s, n) => s + n, 0);

  // Cambiar de filtro siempre vuelve a la primera página: si estabas en la 3 y
  // el nuevo filtro tiene 1 sola, quedarías viendo una página vacía.
  const cambiarEstado = (v) => { setEstado(v); setPagina(1); };
  const cambiarTipo = (v) => { setTipo(v); setPagina(1); };

  const grupos = useMemo(() => {
    const m = new Map();
    for (const n of lista) {
      const k = diaKey(n.creadoEn);
      if (!m.has(k)) m.set(k, { key: k, label: diaLabel(n.creadoEn), items: [] });
      m.get(k).items.push(n);
    }
    return Array.from(m.values());
  }, [lista]);

  const abrir = (n) => {
    if (!n.leida) marcarLeida.mutate({ id: n.id, leida: true });
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

  const onLeida = (id, leida) => marcarLeida.mutate({ id, leida });

  const confirmarEliminar = () => {
    if (!porEliminar) return;
    eliminar.mutate(porEliminar.id, {
      onSuccess: () => {
        setPorEliminar(null);
        // Si era la última fila de la página, retroceder para no quedar vacíos.
        if (lista.length === 1 && pagina > 1) setPagina((p) => p - 1);
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Notificaciones</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Tus avisos del sistema. Aquí quedan guardados aunque la notificación push no llegue al celular.
          </p>
        </div>
        {noLeidas > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => marcarTodas.mutate()}
            disabled={marcarTodas.isPending}
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="kpi kpi-accent">
          <p className="kpi-label">Sin leer</p>
          <p className="kpi-val tabular-nums">{noLeidas}</p>
          <p className="kpi-note">{noLeidas === 0 ? 'Estás al día' : 'Pendientes de revisar'}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Total en la bandeja</p>
          <p className="kpi-val tabular-nums">{totalBandeja}</p>
          <p className="kpi-note">Avisos recibidos</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">En este filtro</p>
          <p className="kpi-val tabular-nums">{total}</p>
          <p className="kpi-note">
            {paginas > 1 ? `Página ${pagina} de ${paginas}` : 'Todo en una página'}
          </p>
        </div>
      </div>

      {/* Filtros: estado + chips por tipo (el chip ES el filtro, con conteo) */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => cambiarEstado(e.valor)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                estado === e.valor
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {e.label}
              {e.valor === 'no-leidas' && noLeidas > 0 && (
                <span className="ml-1.5 tabular-nums opacity-80">{noLeidas}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-700 pt-3">
          <button
            type="button"
            onClick={() => cambiarTipo(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
              tipo === null
                ? 'bg-slate-800 text-white ring-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:ring-slate-200'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700/60'
            }`}
          >
            Todos los tipos
          </button>
          {Object.entries(TIPOS_NOTIFICACION).map(([clave, info]) => {
            const n = conteos[clave] || 0;
            if (!n && tipo !== clave) return null;
            const activo = tipo === clave;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => cambiarTipo(activo ? null : clave)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                  activo
                    ? info.marker
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700/60'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
                {info.label}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista agrupada por día */}
      {isLoading && <div className="card"><EmptyState message="Cargando…" /></div>}

      {!isLoading && grupos.length === 0 && (
        <div className="card">
          <EmptyState
            message={
              estado === 'no-leidas'
                ? 'No tienes notificaciones sin leer. Estás al día.'
                : tipo
                  ? 'No hay notificaciones de este tipo.'
                  : 'Todavía no tienes notificaciones. Aquí aparecerán las invitaciones a acompañamientos, las respuestas de tus citas y los recordatorios.'
            }
          />
        </div>
      )}

      {!isLoading && grupos.map((g) => (
        <div key={g.key}>
          <div className="flex items-baseline gap-2.5 pb-2">
            <h4 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{g.label}</h4>
            <span className="text-[13px] text-slate-400 dark:text-slate-500">
              {g.items.length} aviso{g.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="space-y-2">
            {g.items.map((n) => (
              <Fila key={n.id} n={n} onAbrir={abrir} onLeida={onLeida} onEliminar={setPorEliminar} />
            ))}
          </div>
        </div>
      ))}

      {paginas > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => Math.max(p - 1, 1))}
          >
            Anteriores
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
            Página {pagina} de {paginas}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => Math.min(p + 1, paginas))}
          >
            Siguientes
          </button>
        </div>
      )}

      {/* Borrado permanente: menú ⋯ + confirmación, nunca botón rojo directo */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPorEliminar(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Eliminar notificación</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Se borrará «{porEliminar.titulo}» de tu bandeja. La cita o el recordatorio que la originó no se toca.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPorEliminar(null)}>Cancelar</button>
              <button type="button" className="btn-danger" onClick={confirmarEliminar} disabled={eliminar.isPending}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
