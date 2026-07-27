import { mxn, num } from '../../lib/format.js';
import { infoRitmo, pctAvance, proyeccion, ESTADOS_RITMO } from './ritmo.js';

// Marcador de "ritmo": línea vertical en la posición de la fracción del
// periodo transcurrida, para leer el avance contra el tiempo de un vistazo.
function MarcadorRitmo({ fraccion, conEtiqueta = false }) {
  if (fraccion <= 0 || fraccion >= 1) return null;
  const left = `${Math.min(Math.max(fraccion * 100, 2), 98)}%`;
  return (
    <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-500 dark:bg-slate-300" style={{ left }}>
      {conEtiqueta && (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
          ritmo
        </span>
      )}
    </div>
  );
}

// Bloque grande de meta (promotoría o "mi meta"): actual / meta, %, estado
// por ritmo, barra con marcador de ritmo y proyección de fin de mes.
export default function GoalBlock({ label, actual, meta, fraccion, money = false }) {
  const fmt = money ? mxn : num;
  const sinMeta = !meta || meta <= 0;
  const pct = pctAvance(actual, meta);
  const st = sinMeta ? ESTADOS_RITMO.SIN_META : infoRitmo(pct, fraccion);
  const proj = proyeccion(actual, fraccion);
  const projPct = proj != null && !sinMeta ? pctAvance(proj, meta) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
        <span className={`badge ${st.pill}`}>{st.label}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{fmt(actual)}</span>
        <span className="text-sm font-medium tabular-nums text-slate-400 dark:text-slate-500">
          {sinMeta ? 'sin meta asignada' : `/ ${fmt(meta)} meta`}
        </span>
        {!sinMeta && <span className={`ml-auto text-xl font-bold tabular-nums ${st.text}`}>{pct}%</span>}
      </div>
      <div className="relative h-3 rounded-full bg-slate-100 dark:bg-slate-700/60 mt-5">
        <div className={`h-full rounded-full ${st.bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
        <MarcadorRitmo fraccion={fraccion} conEtiqueta />
      </div>
      {!sinMeta && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {proj == null ? 'El periodo aún no inicia' : (
            <>Proyección fin de mes: <b className="tabular-nums text-slate-700 dark:text-slate-200">{fmt(proj)}</b> ({projPct}% de la meta al ritmo actual)</>
          )}
        </p>
      )}
    </div>
  );
}

// Barra compacta para la tabla de asesores: avance + marcador de ritmo.
// compact = celda angosta para tablas con muchas métricas.
export function MiniBar({ actual, meta, fraccion, money = false, compact = false }) {
  const fmt = money ? mxn : num;
  const pct = pctAvance(actual, meta);
  const st = infoRitmo(pct, fraccion);
  return (
    <div className={compact ? 'min-w-[92px]' : 'min-w-[150px]'}>
      <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 mb-1">
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        <MarcadorRitmo fraccion={fraccion} />
      </div>
      <div className={`flex justify-between gap-2 text-xs tabular-nums text-slate-500 dark:text-slate-400 ${compact ? 'text-[11px]' : ''}`}>
        <span>{fmt(actual)} / {fmt(meta)}</span>
        <span className={`font-bold ${st.text}`}>{pct}%</span>
      </div>
    </div>
  );
}
