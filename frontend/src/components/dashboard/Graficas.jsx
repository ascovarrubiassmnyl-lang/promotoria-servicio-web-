import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext.jsx';
import { mxn, mxnCompacto, num, nombreMes, RAMOS_LABEL, RAMOS_COLOR } from '../../lib/format.js';

// Gráficas del Dashboard (2026-08-25), inspiradas en la sección "dashboard-2"
// de la plantilla shadcn-dashboard-landing-template que el usuario tomó como
// referencia de UI: se adoptó el tipo de gráfica y el layout, NO su stack
// (shadcn/ui + Radix). La única dependencia nueva es recharts.
//
// Viven en su propio módulo —y no dentro de pages/Dashboard.jsx— porque
// recharts pesa ~400 kB: se cargan con lazy() + Suspense desde el Dashboard,
// misma convención que el 3D decorativo (three.js nunca entra al bundle
// inicial). Si se importan de forma estática, ese peso se le cobra a TODA la
// app, incluida la carga en celular.

// recharts pinta SVG y no entiende las variantes `dark:` de Tailwind: necesita
// el color ya resuelto, así que se elige desde el tema activo. Los valores son
// los mismos slate del sistema de diseño.
function coloresGrafica(tema) {
  const oscuro = tema === 'dark';
  return {
    grid: oscuro ? '#334155' : '#e2e8f0', // slate-700 / slate-200
    eje: oscuro ? '#94a3b8' : '#64748b', // slate-400 / slate-500
    meta: oscuro ? '#94a3b8' : '#64748b',
    prima: '#2563eb', // brand-500
  };
}

function TooltipGrafica({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const filas = payload.filter((p) => p.value != null);
  if (!filas.length) return null;
  return (
    <div className="card bg-white px-3 py-2 shadow-lg dark:bg-slate-800">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      {filas.map((f) => (
        <p key={f.dataKey} className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.color || f.stroke }} />
          <span>{f.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-700 dark:text-slate-200">{mxn(f.value)}</span>
        </p>
      ))}
    </div>
  );
}

// Prima colocada mes a mes contra la meta registrada de ese mes. Los datos
// salen tal cual de /targets/historial (misma definición de "venta ganada" que
// Pólizas y Metas): aquí no se recalcula ni se acumula nada.
export function TendenciaVentas({ historial, admin }) {
  const { tema } = useTheme();
  const c = coloresGrafica(tema);

  // El historial llega del mes más reciente al más antiguo; la línea de tiempo
  // se lee al revés.
  const datos = [...(historial?.periodos || [])].reverse().map((p) => ({
    label: `${nombreMes(p.mes).slice(0, 3)} ${String(p.anio).slice(2)}`,
    prima: p.actual?.prima || 0,
    meta: p.meta?.metaPrimaMonto ?? null,
  }));
  const hayDatos = datos.some((d) => d.prima > 0 || d.meta);

  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Tendencia de ventas</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
        Prima colocada vs. {admin ? 'meta de promotoría' : 'tu meta'}, últimos 12 meses
      </p>

      {!historial ? (
        <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</div>
      ) : !hayDatos ? (
        <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          Aún no hay prima registrada en los últimos 12 meses.{' '}
          <Link to="/ventas" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Registra una póliza</Link>
          {' '}para empezar la serie.
        </div>
      ) : (
        <div className="mt-5 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradPrima" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c.prima} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={c.prima} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: c.eje }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={54}
                tick={{ fontSize: 11, fill: c.eje }}
                tickFormatter={mxnCompacto}
              />
              <Tooltip content={<TooltipGrafica />} cursor={{ stroke: c.grid }} />
              <Area
                type="monotone"
                dataKey="prima"
                name="Prima colocada"
                stroke={c.prima}
                strokeWidth={2}
                fill="url(#gradPrima)"
              />
              {/* La meta solo se dibuja donde existe un Target de ese mes:
                  connectNulls=false deja el hueco en vez de inventar una línea.
                  Los puntos NO son decorativos: un mes con meta rodeado de
                  meses sin meta no tiene segmento que trazar, así que sin dot
                  la meta quedaba invisible (pasó con la única meta cargada). */}
              <Line
                type="monotone"
                dataKey="meta"
                name="Meta"
                stroke={c.meta}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={{ r: 2.5, fill: c.meta, strokeWidth: 0 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

// Desglose por ramo de la MISMA prima ganada del periodo que muestra el KPI
// "Prima vendida" (por eso el centro de la dona reusa data.primaAnualTotal en
// vez de sumar los segmentos: una sola cifra, un solo origen).
export function PrimaPorRamo({ data, mes, anio }) {
  const [activo, setActivo] = useState(null);
  const ramos = data.primaPorRamo || [];
  const totalSegmentos = ramos.reduce((s, r) => s + r.prima, 0);

  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Prima por ramo</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
        De dónde viene la prima de {nombreMes(mes)} {anio}
      </p>

      {ramos.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          Sin pólizas ganadas este mes.{' '}
          <Link to="/ventas" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Ver pólizas</Link>
        </div>
      ) : (
        <div className="mt-5 grid items-center gap-5 sm:grid-cols-2">
          <div className="relative h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ramos}
                  dataKey="prima"
                  nameKey="ramo"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {ramos.map((r) => (
                    <Cell
                      key={r.ramo}
                      fill={RAMOS_COLOR[r.ramo] || '#94a3b8'}
                      opacity={activo && activo !== r.ramo ? 0.25 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {mxn(data.primaAnualTotal)}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">prima del mes</span>
            </div>
          </div>

          <div className="space-y-1">
            {ramos.map((r) => {
              const pct = totalSegmentos ? Math.round((r.prima / totalSegmentos) * 100) : 0;
              const seleccionado = activo === r.ramo;
              return (
                <button
                  key={r.ramo}
                  type="button"
                  onClick={() => setActivo(seleccionado ? null : r.ramo)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                    seleccionado ? 'bg-slate-100 dark:bg-slate-700/60' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RAMOS_COLOR[r.ramo] || '#94a3b8' }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">
                    {RAMOS_LABEL[r.ramo] || r.ramo}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{mxn(r.prima)}</span>
                    <span className="block text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                      {pct}% · {num(r.count)} {r.count === 1 ? 'póliza' : 'pólizas'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
