import { Link } from 'react-router-dom';
import { num } from '../../lib/format.js';

// Movido de Inicio a Mi meta (/targets) en el rediseño de Inicio del
// 2026-11-20: Inicio responde "¿qué tengo hoy?" y "¿a quién contacto?"; el
// proceso del mes es lectura de análisis. Mismo componente, sin cambios de
// definición (GET /metricas/proceso-ventas).
/* ---------- Proceso de ventas ---------- */

// Los 5 pasos del proceso de ventas (2026-08-26, definidos por el usuario),
// de contacto frío (slate) a póliza cobrada (emerald): mismo criterio de "el
// color encodea progreso" que usa el mapa de etapas de clientes. Las etiquetas
// y los conteos vienen del servidor (GET /metricas/proceso-ventas) — aquí solo
// se pinta, no se define ninguna métrica.
const DOTS_PROCESO = ['bg-slate-400', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-emerald-500'];

// Debajo de este % de conversión entre dos pasos consecutivos, el paso se
// marca en ámbar como cuello de botella.
const CUELLO_BOTELLA_PCT = 50;

export default function ProcesoVentas({ proceso }) {
  // UNA sola lectura del proceso (antes eran dos, "Pipeline" y "Actividad",
  // en un toggle): el usuario pidió consolidarlas porque medían "casi las
  // mismas métricas solo divididas" y obligaban a reconciliar dos embudos.
  const niveles = proceso?.niveles || [];
  const total = niveles.reduce((s, n) => s + n.count, 0);
  const top = Math.max(...niveles.map((n) => n.count), 1);

  // Mayor caída entre dos pasos consecutivos: dónde conviene enfocarse.
  const peor = niveles.reduce((p, n) => (
    n.conversionPct != null && (!p || n.conversionPct < p.conversionPct) ? n : p
  ), null);
  const idxPeor = peor ? niveles.indexOf(peor) : -1;

  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Proceso de ventas</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
        Lo que pasó este mes, del prospecto nuevo a la póliza pagada
      </p>

      {total === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Sin actividad registrada este mes.{' '}
          <Link to="/clientes" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Registra un prospecto</Link>
          {' '}para empezar a medir el proceso.
        </div>
      ) : (
        <>
          <div className="mt-4">
            {niveles.map((n, i) => (
              <div key={n.clave}>
                {n.conversionPct != null && (
                  <p className="py-0.5 pl-[104px] text-[11px] tabular-nums text-slate-400 dark:text-slate-500 sm:pl-[132px]">
                    <span className={n.conversionPct < CUELLO_BOTELLA_PCT ? 'font-bold text-amber-600 dark:text-amber-400' : ''}>
                      {niveles[i - 1].label} → {n.label}: {n.conversionPct}%
                    </span>
                  </p>
                )}
                <div className="flex items-center gap-4 py-1.5">
                  <span className="w-[88px] shrink-0 text-[13px] font-medium leading-tight text-slate-500 dark:text-slate-400 sm:w-[116px]" title={n.label}>{n.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                    <div
                      className={`h-full rounded-full ${DOTS_PROCESO[i] || 'bg-slate-400'} transition-all duration-500 motion-reduce:transition-none`}
                      style={{ width: `${Math.max((n.count / top) * 100, 4)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{num(n.count)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            <span>
              Tasa de cierre del proceso completo:{' '}
              <b className="tabular-nums text-slate-700 dark:text-slate-200">
                {proceso?.tasaCierrePct != null ? `${proceso.tasaCierrePct}%` : '—'}
              </b>
              {' '}(de prospecto nuevo a póliza pagada).
            </span>
            {proceso?.llamadasSinRegistro && (
              <span>
                Hay citas pero ninguna llamada registrada: registra cada llamada desde Inicio, la ficha o la clínica para medir ese paso.
              </span>
            )}
            {idxPeor > 0 && peor.conversionPct < CUELLO_BOTELLA_PCT && (
              <span>
                Mayor caída en <b className="text-slate-700 dark:text-slate-200">{niveles[idxPeor - 1].label} → {peor.label}</b> ({peor.conversionPct}%).
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}


