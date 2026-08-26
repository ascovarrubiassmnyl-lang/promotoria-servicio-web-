import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mxn, num, nombreMes } from '../../lib/format.js';
import { claveRitmo, ESTADOS_RITMO, pctAvance } from '../metas/ritmo.js';

// Ranking de asesores del dashboard (2026-08-25), rediseñado con el patrón de
// leaderboard que el usuario tomó como referencia: podio de los 3 primeros +
// lista paginada debajo, dentro de una sola tarjeta con encabezado de rango de
// fechas y selector de métrica.
//
// Se adoptó el DISEÑO, no el stack: el original venía en TypeScript sobre
// shadcn/ui (`@/components/ui/*`, `cn()`, Radix). Este proyecto es JS puro con
// Tailwind y su propio sistema de diseño (.card, .avatar, .money-earned,
// tokens brand/emerald/amber/slate), misma decisión que ya se tomó con las
// gráficas de `Graficas.jsx` — sin dependencias nuevas.
//
// Equivalencias de props del componente de referencia:
//   fromDate/toDate  → primer y último día del periodo consultado.
//   runOptions       → METRICAS_RANKING (por qué se ordena; el endpoint ya
//                      devuelve las cuatro cifras, no hay request extra).
//   podiumRankings   → los 3 primeros de la métrica activa.
//   currentUserId    → resalta la fila propia (el promotor no aparece en el
//                      roster, que filtra rol ASESOR, pero el resaltado queda
//                      para cualquier consumidor futuro).
//
// SOLO LO VEN LOS PROMOTORES: el servidor únicamente incluye `ranking` en
// /metricas/dashboard cuando quien consulta no es ASESOR, y el dashboard solo
// monta este bloque con alcance de administración — las dos capas de siempre.

// Métricas por las que se puede ordenar. `money` decide el formato (mxn vs
// num), mismo criterio que el catálogo METRICAS de Metas.
export const METRICAS_RANKING = [
  { id: 'prima', label: 'Prima colocada', corto: 'prima', money: true, nota: 'colocada este mes' },
  { id: 'ventas', label: 'Pólizas ganadas', corto: 'pólizas', money: false, nota: 'ganadas este mes' },
  { id: 'citas', label: 'Citas del mes', corto: 'citas', money: false, nota: 'agendadas este mes' },
  { id: 'clientes', label: 'Clientes en cartera', corto: 'clientes', money: false, nota: 'cartera activa' },
];

const TAM_PAGINA = 10;

const iniciales = (nombre = '') => nombre.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

const formatoValor = (valor, money) => (money ? mxn(valor) : num(valor));

// Colores del podio: oro / plata / bronce. Se quedan aquí porque no son
// estados de negocio (no tocan el semáforo de ritmo ni los tokens semánticos).
const PODIO = {
  1: {
    anillo: 'ring-amber-300 dark:ring-amber-500/60',
    fondo: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    barra: 'bg-gradient-to-t from-amber-200 to-amber-100 dark:from-amber-600/40 dark:to-amber-500/20',
    alto: 'h-24',
  },
  2: {
    anillo: 'ring-slate-300 dark:ring-slate-500/60',
    fondo: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
    barra: 'bg-gradient-to-t from-slate-200 to-slate-100 dark:from-slate-600/50 dark:to-slate-600/20',
    alto: 'h-16',
  },
  3: {
    anillo: 'ring-orange-300 dark:ring-orange-500/60',
    fondo: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    barra: 'bg-gradient-to-t from-orange-200 to-orange-100 dark:from-orange-700/40 dark:to-orange-600/20',
    alto: 'h-12',
  },
};

function Corona({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 7.5a1.25 1.25 0 1 1 2.06.95l1.9 3.05 2.99-3.6a1.25 1.25 0 1 1 2.1 0l2.99 3.6 1.9-3.05A1.25 1.25 0 1 1 21 7.5c0 .5-.29.93-.72 1.13L18.6 17.4a1 1 0 0 1-.98.8H6.38a1 1 0 0 1-.98-.8L3.72 8.63A1.25 1.25 0 0 1 3 7.5Z" />
    </svg>
  );
}

/* ---------- Podio (top 3) ---------- */

function LeaderboardPodium({ rankings = [], money }) {
  if (rankings.length === 0) return null;
  // Orden visual 2 – 1 – 3 (el primero al centro y más alto).
  const porLugar = new Map(rankings.map((r) => [r.rank, r]));
  const visual = [2, 1, 3].map((n) => porLugar.get(n)).filter(Boolean);

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {visual.map((r) => {
        const p = PODIO[r.rank];
        return (
          <Link
            key={r.id}
            to={`/equipo/${r.id}`}
            className="group flex w-24 flex-col items-center sm:w-32"
          >
            <div className="relative">
              {r.rank === 1 && (
                <Corona className="absolute -top-4 left-1/2 h-4 w-4 -translate-x-1/2 text-amber-400 dark:text-amber-300" />
              )}
              <div className={`avatar !h-12 !w-12 text-base ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ${p.anillo}`}>
                {iniciales(r.nombre)}
              </div>
              <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${p.fondo}`}>
                {r.rank}
              </span>
            </div>
            <p className="mt-3 w-full truncate text-center text-xs font-semibold text-slate-700 transition-colors group-hover:text-brand-600 dark:text-slate-200 dark:group-hover:text-brand-400">
              {r.nombre}
            </p>
            <p className={`mt-0.5 text-xs font-semibold tabular-nums ${money ? 'money-earned' : 'text-slate-600 dark:text-slate-300'}`}>
              {formatoValor(r.valor, money)}
            </p>
            <div className={`mt-2 w-full rounded-t-lg ${p.barra} ${p.alto}`} />
          </Link>
        );
      })}
    </div>
  );
}

/* ---------- Lista paginada ---------- */

function LeaderboardRankings({ rankings = [], currentUserId, money, fraccion, mostrarMeta }) {
  const [pagina, setPagina] = useState(1);
  const paginas = Math.max(1, Math.ceil(rankings.length / TAM_PAGINA));

  // Cambiar de métrica reordena la lista: volver a la primera página.
  useEffect(() => { setPagina(1); }, [rankings]);

  const desde = (pagina - 1) * TAM_PAGINA;
  const visibles = rankings.slice(desde, desde + TAM_PAGINA);
  const lider = rankings[0]?.valor || 0;

  return (
    <div>
      {visibles.map((r, i) => {
        // Con meta fijada la barra mide avance contra su meta y hereda el
        // color del semáforo de ritmo (mapa único de metas/ritmo.js). Sin meta
        // —o en una métrica que no la tiene— mide su parte contra el líder,
        // en neutro, para no fingir un estado que no existe.
        const pct = mostrarMeta && r.metaPrima ? pctAvance(r.valor, r.metaPrima) : null;
        const st = pct == null ? ESTADOS_RITMO.SIN_META : ESTADOS_RITMO[claveRitmo(pct, fraccion)];
        const ancho = pct == null ? (lider > 0 ? (r.valor / lider) * 100 : 0) : Math.min(pct, 100);
        const yo = currentUserId && r.id === currentUserId;
        return (
          <Link
            key={r.id}
            to={`/equipo/${r.id}`}
            className={`group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 ${
              i > 0 || desde > 0 ? 'border-t border-slate-100 dark:border-slate-700/60' : ''
            } ${yo ? 'bg-brand-50/60 dark:bg-brand-900/20' : ''}`}
          >
            <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500">{r.rank}</span>
            <div className="avatar !h-8 !w-8 text-[11px]">{iniciales(r.nombre)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                {r.nombre}
                {yo && <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">Tú</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{r.detalle}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${ancho}%` }} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm tabular-nums ${money ? 'money-earned' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
                {formatoValor(r.valor, money)}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {mostrarMeta ? (pct == null ? 'sin meta asignada' : `${pct}% de su meta`) : (lider > 0 ? `${Math.round((r.valor / lider) * 100)}% del líder` : '—')}
              </p>
            </div>
          </Link>
        );
      })}

      {paginas > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700/60">
          <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
            {desde + 1}–{Math.min(desde + TAM_PAGINA, rankings.length)} de {rankings.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
              disabled={pagina === paginas}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tarjeta completa ---------- */

export function RankingAsesores({ ranking = [], fraccion, mes, anio, currentUserId, vacio }) {
  const [metricaId, setMetricaId] = useState(METRICAS_RANKING[0].id);
  const metrica = METRICAS_RANKING.find((m) => m.id === metricaId) || METRICAS_RANKING[0];

  const filas = useMemo(() => {
    const ordenadas = [...ranking].sort((a, b) => (b[metrica.id] || 0) - (a[metrica.id] || 0));
    return ordenadas.map((r, i) => ({
      ...r,
      rank: i + 1,
      valor: r[metrica.id] || 0,
      // Byline: las otras tres cifras que ya vienen del endpoint, para no
      // perderlas al ordenar por una sola.
      detalle: METRICAS_RANKING.filter((m) => m.id !== metrica.id)
        .map((m) => `${formatoValor(r[m.id] || 0, m.money)} ${m.corto}`)
        .join(' · '),
    }));
  }, [ranking, metrica]);

  const dias = new Date(anio, mes, 0).getDate();
  const rango = `1 – ${dias} de ${nombreMes(mes).toLowerCase()} ${anio}`;

  return (
    <section className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Ranking de asesores</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{rango}</p>
        </div>
        <select
          aria-label="Ordenar el ranking por"
          value={metricaId}
          onChange={(e) => setMetricaId(e.target.value)}
          className="input w-auto py-1.5 text-sm"
        >
          {METRICAS_RANKING.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {filas.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">{vacio}</div>
      ) : (
        <>
          <div className="mt-8 mb-6">
            <LeaderboardPodium rankings={filas.slice(0, 3)} money={metrica.money} />
          </div>
          <LeaderboardRankings
            rankings={filas}
            currentUserId={currentUserId}
            money={metrica.money}
            fraccion={fraccion}
            mostrarMeta={metrica.id === 'prima'}
          />
        </>
      )}
    </section>
  );
}
