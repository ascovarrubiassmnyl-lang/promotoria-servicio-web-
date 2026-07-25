import { useMemo, useState } from 'react';
import { ESTADOS_CLIENTE_LABEL, num } from '../lib/format.js';

// Etapas que forman el embudo (en orden de avance)
const ETAPAS_EMBUDO = ['PROSPECTO', 'CITA', 'PROPUESTA', 'CIERRE_FIRMA', 'ENTREGA_POLIZA'];

const ETAPA_COLOR = {
  PROSPECTO: { base: '#64748b', claro: '#94a3b8' },
  CITA: { base: '#2563eb', claro: '#60a5fa' },
  PROPUESTA: { base: '#7c3aed', claro: '#a78bfa' },
  CIERRE_FIRMA: { base: '#d97706', claro: '#fbbf24' },
  ENTREGA_POLIZA: { base: '#059669', claro: '#34d399' },
};

const CHIP_COLOR = {
  REFERIDOS: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
  POST_VENTA_SEGUIMIENTO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  NECESITA_SEGUIMIENTO: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
};

// Geometría del SVG
const VB_W = 1000;
const VB_H = 230;
const CY = VB_H / 2;
const H_MAX = 210;
const H_MIN = 34;

function calcularEtapas(datos) {
  const porEtapa = Object.fromEntries(datos.map((d) => [d.etapa, d.count]));
  const counts = ETAPAS_EMBUDO.map((e) => porEtapa[e] || 0);
  const max = Math.max(...counts, 1);
  const total = counts.reduce((a, b) => a + b, 0);
  let prev = null;
  return ETAPAS_EMBUDO.map((etapa, i) => {
    const conversion = prev > 0 ? Math.round((counts[i] / prev) * 100) : null;
    prev = counts[i];
    return {
      etapa,
      count: counts[i],
      pct: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
      conversion,
      altura: H_MIN + (counts[i] / max) * (H_MAX - H_MIN),
      color: ETAPA_COLOR[etapa],
    };
  });
}

export default function PipelineFunnel({ datos }) {
  const etapas = useMemo(() => calcularEtapas(datos), [datos]);
  const fueraEmbudo = useMemo(
    () => datos.filter((d) => !ETAPAS_EMBUDO.includes(d.etapa) && d.count > 0),
    [datos]
  );
  const [hovered, setHovered] = useState(null);

  const totalEmbudo = etapas.reduce((a, s) => a + s.count, 0);
  const conversionGlobal = etapas[0].count > 0
    ? ((etapas[etapas.length - 1].count / etapas[0].count) * 100).toFixed(1)
    : '0';

  const n = etapas.length;
  const W = VB_W / n;
  // Altura en cada frontera entre etapas: la etapa se estrecha hacia la siguiente
  const bordes = [...etapas.map((s) => s.altura), etapas[n - 1].altura * 0.7];

  return (
    <div>
      {/* KPIs del embudo */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Clientes en el embudo</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{num(totalEmbudo)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Conversión global</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{conversionGlobal}%</p>
        </div>
        {fueraEmbudo.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {fueraEmbudo.map((d) => (
              <span
                key={d.etapa}
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${CHIP_COLOR[d.etapa] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}
              >
                {ESTADOS_CLIENTE_LABEL[d.etapa] || d.etapa} · {num(d.count)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Embudo SVG */}
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label="Embudo del pipeline de clientes">
        <defs>
          {etapas.map((s) => (
            <linearGradient key={s.etapa} id={`grad-${s.etapa}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color.claro} />
              <stop offset="100%" stopColor={s.color.base} />
            </linearGradient>
          ))}
        </defs>
        {etapas.map((s, i) => {
          const x0 = i * W;
          const x1 = x0 + W;
          const h0 = bordes[i];
          const h1 = bordes[i + 1];
          const c = W * 0.45;
          const d = [
            `M ${x0},${CY - h0 / 2}`,
            `C ${x0 + c},${CY - h0 / 2} ${x1 - c},${CY - h1 / 2} ${x1},${CY - h1 / 2}`,
            `L ${x1},${CY + h1 / 2}`,
            `C ${x1 - c},${CY + h1 / 2} ${x0 + c},${CY + h0 / 2} ${x0},${CY + h0 / 2}`,
            'Z',
          ].join(' ');
          const alturaCentro = (h0 + h1) / 2;
          const atenuado = hovered && hovered !== s.etapa;
          return (
            <g
              key={s.etapa}
              onMouseEnter={() => setHovered(s.etapa)}
              onMouseLeave={() => setHovered(null)}
              style={{ transition: 'opacity 150ms', opacity: atenuado ? 0.35 : 1 }}
            >
              <path d={d} fill={`url(#grad-${s.etapa})`}>
                <title>{`${ESTADOS_CLIENTE_LABEL[s.etapa]}: ${num(s.count)} clientes (${s.pct}%)`}</title>
              </path>
              {alturaCentro >= 46 ? (
                <>
                  <text x={x0 + W / 2} y={CY - 4} textAnchor="middle" fill="#fff" fontSize="30" fontWeight="700" style={{ pointerEvents: 'none' }}>
                    {num(s.count)}
                  </text>
                  <text x={x0 + W / 2} y={CY + 20} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="13" fontWeight="500" style={{ pointerEvents: 'none' }}>
                    {s.pct}%
                  </text>
                </>
              ) : (
                <text x={x0 + W / 2} y={CY - alturaCentro / 2 - 12} textAnchor="middle" fill={s.color.base} fontSize="26" fontWeight="700" style={{ pointerEvents: 'none' }}>
                  {num(s.count)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Etiquetas y conversión por etapa */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        {etapas.map((s, i) => {
          const activo = hovered === s.etapa;
          return (
            <div
              key={s.etapa}
              onMouseEnter={() => setHovered(s.etapa)}
              onMouseLeave={() => setHovered(null)}
              className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                activo
                  ? 'border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-700/50'
                  : 'border-transparent'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color.base }} />
                <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                  {ESTADOS_CLIENTE_LABEL[s.etapa]}
                </p>
              </div>
              {s.conversion !== null && (
                <p className={`mt-1 text-[11px] font-medium ${
                  s.conversion >= 50
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : s.conversion > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {s.conversion}% desde anterior
                </p>
              )}
              {s.conversion === null && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {i === 0 ? 'Inicio del embudo' : 'Etapa anterior vacía'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
