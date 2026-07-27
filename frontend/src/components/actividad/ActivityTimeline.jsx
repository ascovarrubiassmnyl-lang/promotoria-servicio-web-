import { useMemo } from 'react';
import { EmptyState } from '../ui.jsx';
import { mxn, hora, fechaCorta, RAMOS_LABEL } from '../../lib/format.js';
import { infoTipo, esEventoEstructurado } from './tipos.jsx';

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

const IconoPersona = () => (
  <svg className="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8a3 3 0 100-6 3 3 0 000 6" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
  </svg>
);

// Chips de metadatos estructurados del evento (cliente, producto·ramo, prima…)
function MetaChips({ m }) {
  const chips = [];
  const tag = 'inline-flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-700/60 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300';
  if (m.cliente) chips.push(<span key="cliente" className={tag}><IconoPersona />{m.cliente}</span>);
  if (m.producto) chips.push(<span key="producto" className={tag}>{m.producto}{m.ramo ? ` · ${RAMOS_LABEL[m.ramo] || m.ramo}` : ''}</span>);
  if (m.titulo) chips.push(<span key="titulo" className={tag}>{m.titulo}</span>);
  if (m.modalidad === 'ACOMPANAMIENTO') chips.push(<span key="modalidad" className={tag}>Acompañamiento</span>);
  if (m.nota) chips.push(<span key="nota" className={tag}>{m.nota}</span>);
  if (m.referido) chips.push(<span key="referido" className={tag}>{m.referido}</span>);
  if (m.prima != null) chips.push(
    <span key="prima" className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      {mxn(m.prima)} prima
    </span>
  );
  if (m.proximoCobro) chips.push(<span key="proximo" className={tag}>Próximo cobro: {fechaCorta(m.proximoCobro)}</span>);
  if (!chips.length) return null;
  return <div className="flex flex-wrap gap-1.5 mt-2">{chips}</div>;
}

function Evento({ e, primero, ultimo, mostrarAsesor }) {
  const t = infoTipo(e.tipo);
  const estructurado = esEventoEstructurado(e);
  // Título desde datos estructurados; los eventos históricos que solo guardaron
  // texto pre-renderizado se muestran con ese texto crudo como fallback.
  const titulo = (estructurado && t.titulo(e.metadata)) || e.descripcion || t.label;
  return (
    <div className="relative flex gap-4 py-1.5">
      <div className="relative w-9 shrink-0 flex justify-center">
        <span className={`absolute w-0.5 bg-slate-200 dark:bg-slate-700 ${primero ? 'top-1/2' : 'top-0'} ${ultimo ? 'bottom-1/2' : 'bottom-0'}`} aria-hidden />
        <span className={`relative z-10 mt-1.5 flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-inset ${t.marker}`}>
          {t.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 flex items-start justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-600 transition">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${t.text}`}>{t.label}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</p>
          {estructurado && <MetaChips m={e.metadata} />}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap pt-0.5">{hora(e.creadoEn)}</p>
          {mostrarAsesor && e.asesor && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{e.asesor.nombre} {e.asesor.apellidoP}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Línea de tiempo reutilizable de eventos de actividad estructurados,
// agrupada por día (Hoy / Ayer / fecha) con eje vertical y marcador por tipo.
// El estilo por tipo sale exclusivamente del mapa en tipos.jsx.
export default function ActivityTimeline({ eventos, loading, mostrarAsesor = false, mensajeVacio = 'No hay eventos en el rango seleccionado.' }) {
  const grupos = useMemo(() => {
    const m = new Map();
    for (const e of eventos || []) {
      const k = diaKey(e.creadoEn);
      if (!m.has(k)) m.set(k, { key: k, label: diaLabel(e.creadoEn), items: [] });
      m.get(k).items.push(e);
    }
    return Array.from(m.values());
  }, [eventos]);

  if (loading) return <div className="card"><EmptyState message="Cargando…" /></div>;
  if (!grupos.length) return <div className="card"><EmptyState message={mensajeVacio} /></div>;

  return (
    <div>
      {grupos.map((g) => (
        <div key={g.key} className="mb-3">
          <div className="flex items-baseline gap-2.5 pt-2 pb-1.5">
            <h4 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{g.label}</h4>
            <span className="text-[13px] text-slate-400 dark:text-slate-500">
              {g.items.length} evento{g.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div>
            {g.items.map((e, i) => (
              <Evento key={e.id} e={e} primero={i === 0} ultimo={i === g.items.length - 1} mostrarAsesor={mostrarAsesor} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
