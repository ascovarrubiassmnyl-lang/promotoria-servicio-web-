import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState } from '../components/ui.jsx';
import { mxn, num, nombreMes, ESTADOS_VENTA_LABEL } from '../lib/format.js';
import { infoEtapa } from '../components/clientes/etapas.js';
import { diasPeriodo, claveRitmo, ESTADOS_RITMO, pctAvance, proyeccion } from '../components/metas/ritmo.js';

// Dashboard (rediseño 2026-07): jerarquiza y empuja a la acción.
// Definiciones únicas (mismas fuentes que Pólizas/Metas, ver metricas.js):
//  - Venta ganada = APROBADA/PAGADA creada en el periodo.
//  - "Comisión ganada" (verde) y "Comisión en pipeline" (neutra) nunca se suman.
//  - La única "tasa de conversión" es la del embudo (entre etapas); la de
//    referidos se llama "tasa de referidos" y vive solo en su tarjeta.
// Alcance por rol garantizado en servidor: el asesor recibe solo sus números y
// su meta individual; ranking y meta de promotoría solo llegan a promotores.

const RITMO_STROKE = {
  CUMPLIDA: 'text-emerald-500',
  EN_RITMO: 'text-emerald-500',
  LIGERO_ATRASO: 'text-amber-500',
  ATRASADO: 'text-red-500',
  SIN_META: 'text-brand-500',
};

export default function Dashboard() {
  const { user, esAdmin } = useAuth();
  const admin = esAdmin();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const { dia, dias, fraccion } = diasPeriodo(mes, anio);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', mes, anio],
    queryFn: async () => (await api.get('/metricas/dashboard', { params: { mes, anio } })).data,
  });
  const { data: funnel } = useQuery({
    queryKey: ['funnel'],
    queryFn: async () => (await api.get('/metricas/funnel')).data,
  });

  if (isLoading || !data) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">Hola, {user?.nombre}</h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {admin ? 'Promotoría' : 'Tu mes'}
            <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
            {nombreMes(mes)} {anio}
            {fraccion > 0 && fraccion < 1 && (
              <><span className="mx-2 text-slate-300 dark:text-slate-600">·</span>día {dia} de {dias}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={mes} onChange={(e) => setMes(+e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{nombreMes(i + 1)}</option>)}
          </select>
          <input type="number" className="input w-24" value={anio} onChange={(e) => setAnio(+e.target.value)} />
        </div>
      </div>

      <Hero data={data} admin={admin} mes={mes} anio={anio} fraccion={fraccion} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Atencion atencion={data.atencion} admin={admin} />
        <Embudo funnel={funnel} />
      </div>

      <EstadoPolizas polizasMes={data.polizasMes} periodo={`${nombreMes(mes)} ${anio}`} />

      <div className={`grid gap-6 ${admin ? 'lg:grid-cols-2' : ''}`}>
        {admin && <Ranking ranking={data.ranking} fraccion={fraccion} />}
        <ReferidosBonos data={data} periodo={`${nombreMes(mes)} ${anio}`} />
      </div>
    </div>
  );
}

/* ---------- Hero: anillo de meta de prima + cómo va el mes ---------- */

function Hero({ data, admin, mes, anio, fraccion }) {
  const metaPrima = data.meta?.prima || 0;
  const sinMeta = !metaPrima;
  const pct = pctAvance(data.primaAnualTotal, metaPrima);
  const clave = sinMeta ? 'SIN_META' : claveRitmo(pct, fraccion);
  const st = ESTADOS_RITMO[clave];
  const proj = proyeccion(data.primaAnualTotal, fraccion);
  const projPct = proj != null && !sinMeta ? pctAvance(proj, metaPrima) : null;
  const metaVentas = data.meta?.ventas || 0;
  const periodo = `${nombreMes(mes)} ${anio}`;

  return (
    <section className="card grid items-center gap-6 p-5 sm:gap-8 sm:p-8 lg:grid-cols-[auto_1px_1fr] lg:gap-10">
      <Anillo pct={sinMeta ? 0 : pct} clave={clave} fraccion={fraccion}>
        {sinMeta ? (
          <>
            <span className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{mxn(data.primaAnualTotal)}</span>
            <span className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Prima del mes</span>
            <span className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">sin meta asignada</span>
          </>
        ) : (
          <>
            <span className="text-5xl font-bold tabular-nums tracking-tight text-slate-800 dark:text-slate-100">{pct}%</span>
            <span className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Meta de prima</span>
            <span className="mt-1.5 text-sm tabular-nums text-slate-500 dark:text-slate-400">{mxn(data.primaAnualTotal)} de {mxn(metaPrima)}</span>
          </>
        )}
      </Anillo>

      <div className="hidden self-stretch bg-slate-100 dark:bg-slate-700/60 lg:block" />

      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cómo va el mes</h3>
          <span className={`badge badge-dot ${st.pill}`}>{st.label}</span>
        </div>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
          {sinMeta ? (
            admin ? (
              <>Sin meta de promotoría para {periodo}. <Link to="/targets" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Asígnala en Metas</Link> para leer el avance del equipo contra un objetivo.</>
            ) : (
              <>Aún no tienes meta asignada para {periodo}. Pídesela a tu promotor; mientras tanto, aquí va tu avance real.</>
            )
          ) : proj == null ? (
            <>El periodo aún no inicia. La meta del mes es <B>{mxn(metaPrima)}</B> en prima.</>
          ) : clave === 'CUMPLIDA' ? (
            <>Meta cumplida con <B>{mxn(data.primaAnualTotal)}</B> colocados. Lo que cierres de aquí al día {dias(mes, anio)} es terreno ganado.</>
          ) : clave === 'EN_RITMO' ? (
            <>Vas a buen ritmo. Al paso actual el mes cierra en <B>{mxn(proj)}</B>, alrededor del <B>{projPct}%</B> de la meta.</>
          ) : (
            <>Vas por debajo del ritmo del mes. Al paso actual cerrarías en <B>{mxn(proj)}</B> — cerca del <B>{projPct}%</B> de la meta. Faltan <B>{mxn(metaPrima - data.primaAnualTotal)}</B> para llegar.</>
          )}
        </p>
        <div className="grid grid-cols-2 gap-3 pt-1 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-4">
          <HeroStat k="Ventas" v={metaVentas ? `${num(data.ventasAprobadas)} / ${num(metaVentas)}` : num(data.ventasAprobadas)}
            d={metaVentas ? `${pctAvance(data.ventasAprobadas, metaVentas)}% de la meta` : 'pagadas o aprobadas'} />
          <HeroStat k="Comisión ganada" v={mxn(data.comisionTotal)} d="de ventas del mes" green />
          <HeroStat k="Clientes" v={num(data.totalClientes)} d={`+${num(data.clientesMes)} nuevos este mes`} />
          <HeroStat k="Citas completadas" v={num(data.citasCompletadasMes)} d={`de ${num(data.citasPeriodo)} en el mes`} />
        </div>
      </div>
    </section>
  );
}

const dias = (mes, anio) => new Date(anio, mes, 0).getDate();

function B({ children }) {
  return <b className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{children}</b>;
}

// En móvil cada stat es una tarjetita (borde + fondo tenue); en escritorio
// (sm+) se aplana a texto suelto, como el rediseño original de escritorio.
function HeroStat({ k, v, d, green = false }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-700/60 dark:bg-slate-900/30 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{k}</p>
      <p className={`mt-1 text-[22px] font-bold tabular-nums tracking-tight ${green ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>{v}</p>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{d}</p>
    </div>
  );
}

// Anillo "eclipse": avance de la meta de prima con punto de ritmo (fracción
// del mes transcurrida) sobre la misma circunferencia. Se anima al montar,
// salvo prefers-reduced-motion (motion-reduce anula la transición).
function Anillo({ pct, clave, fraccion, children }) {
  const R = 100;
  const C = 2 * Math.PI * R;
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  const offset = C * (1 - Math.min(pct, 100) / 100);
  const ang = fraccion * 2 * Math.PI;
  const mostrarPunto = fraccion > 0 && fraccion < 1;

  return (
    <div className="relative mx-auto h-56 w-56 sm:h-60 sm:w-60">
      <svg viewBox="0 0 236 236" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="118" cy="118" r={R} fill="none" strokeWidth="13" className="stroke-slate-100 dark:stroke-slate-700/70" />
        <circle cx="118" cy="118" r="82" fill="none" strokeWidth="1" className="stroke-slate-100 dark:stroke-slate-700/50" />
        <circle
          cx="118" cy="118" r={R} fill="none" strokeWidth="13" strokeLinecap="round" stroke="currentColor"
          className={`${RITMO_STROKE[clave]} transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none`}
          strokeDasharray={C} strokeDashoffset={montado ? offset : C}
        />
        {mostrarPunto && (
          <circle
            cx={118 + R * Math.cos(ang)} cy={118 + R * Math.sin(ang)} r="4.5"
            className="fill-slate-500 dark:fill-slate-200"
          >
            <title>Ritmo del mes: {Math.round(fraccion * 100)}% transcurrido</title>
          </circle>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

/* ---------- Requiere tu atención ---------- */

function Atencion({ atencion, admin }) {
  const items = [
    atencion.pendientesPago.count > 0 && {
      color: 'bg-amber-500',
      to: admin ? '/equipo' : '/ventas',
      t: `${num(atencion.pendientesPago.count)} ${atencion.pendientesPago.count === 1 ? 'póliza pendiente' : 'pólizas pendientes'} de pago`,
      s: `${mxn(atencion.pendientesPago.prima)} en prima sin cobrar`,
    },
    atencion.citasHoy > 0 && {
      color: 'bg-brand-500',
      to: '/citas',
      t: `${num(atencion.citasHoy)} ${atencion.citasHoy === 1 ? 'cita' : 'citas'} hoy`,
      s: 'Revisa tu agenda del día',
    },
    atencion.seguimiento > 0 && {
      color: 'bg-amber-500',
      to: '/clientes',
      t: `${num(atencion.seguimiento)} ${atencion.seguimiento === 1 ? 'cliente necesita' : 'clientes necesitan'} seguimiento`,
      s: 'Marcados en el pipeline de clientes',
    },
    atencion.bonosPorGanar.monto > 0 && {
      color: 'bg-emerald-500',
      t: `${mxn(atencion.bonosPorGanar.monto)} en bonos por ganar`,
      s: 'Se liberan al cerrar las ventas del mes',
    },
  ].filter(Boolean);

  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Requiere tu atención</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Lo que conviene mover esta semana</p>
      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Todo al día por ahora.{' '}
          <Link to="/citas" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Agenda una cita</Link>
          {' '}o{' '}
          <Link to="/clientes" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">registra un prospecto</Link>
          {' '}para mover el mes.
        </div>
      ) : (
        <div className="mt-4">
          {items.map((it, i) => {
            const fila = (
              <div className={`group flex items-center gap-4 py-4 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-700/60' : ''}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${it.color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">{it.t}</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{it.s}</p>
                </div>
                {it.to && <Chevron />}
              </div>
            );
            return it.to
              ? <Link key={it.t} to={it.to} className="block cursor-pointer">{fila}</Link>
              : <div key={it.t}>{fila}</div>;
          })}
        </div>
      )}
    </section>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 -translate-x-1 text-slate-400 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 dark:text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/* ---------- Embudo diagnóstico ---------- */

// Etapas núcleo del embudo para el diagnóstico de conversión (las posteriores
// —Referidos, Post venta— son de mantenimiento, no de avance de venta).
const ETAPAS_NUCLEO = 5;

function Embudo({ funnel }) {
  const datos = (funnel || []).map((f) => ({ ...infoEtapa(f.etapa), count: f.count }));
  const total = datos.reduce((s, d) => s + d.count, 0);
  const top = Math.max(...datos.map((d) => d.count), 1);

  // Conversión entre etapas consecutivas del núcleo + mayor cuello de botella.
  let peor = null;
  const conversiones = datos.slice(0, ETAPAS_NUCLEO).map((d, i) => {
    if (i === 0) return null;
    const prev = datos[i - 1];
    if (!prev.count) return null;
    const pct = Math.round((d.count / prev.count) * 100);
    if (!peor || pct < peor.pct) peor = { pct, de: prev.label, a: d.label };
    return { pct, de: prev.label, a: d.label };
  });

  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Embudo del pipeline</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Dónde avanza y dónde se cae la conversión</p>
      {total === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Aún no hay clientes en el pipeline.{' '}
          <Link to="/clientes" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Agrega tu primer cliente</Link>
          {' '}para ver el embudo.
        </div>
      ) : (
        <>
          <div className="mt-4">
            {datos.map((d, i) => (
              <div key={d.value}>
                {conversiones[i] && (
                  <p className="py-0.5 pl-[104px] text-[11px] tabular-nums text-slate-400 dark:text-slate-500 sm:pl-[132px]">
                    <span className={conversiones[i].pct < 70 ? 'font-bold text-amber-600 dark:text-amber-400' : ''}>
                      {conversiones[i].de} → {conversiones[i].a}: {conversiones[i].pct}%
                    </span>
                  </p>
                )}
                <div className="flex items-center gap-4 py-1.5">
                  <span className="w-[88px] shrink-0 truncate text-[13px] font-medium text-slate-500 dark:text-slate-400 sm:w-[116px]">{d.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                    <div className={`h-full rounded-full ${d.dot} transition-all duration-500 motion-reduce:transition-none`} style={{ width: `${Math.max((d.count / top) * 100, 4)}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{num(d.count)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {peor && peor.pct < 70 ? (
              <>Mayor caída en <b className="text-slate-700 dark:text-slate-200">{peor.de} → {peor.a}</b> ({peor.pct}%). Ahí conviene enfocar el seguimiento.</>
            ) : (
              <>El pipeline avanza sin cuellos de botella marcados.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/* ---------- Franja: estado de pólizas del mes ---------- */

const ESTADOS_POLIZA_DOT = [
  ['PENDIENTE_PAGAR', 'bg-amber-500'],
  ['FIRMADA', 'bg-blue-500'],
  ['APROBADA', 'bg-emerald-500'],
  ['PAGADA', 'bg-emerald-500'],
  ['CANCELADA', 'bg-red-400'],
  ['RECHAZADA', 'bg-red-400'],
];

function EstadoPolizas({ polizasMes, periodo }) {
  const totalMes = Object.values(polizasMes || {}).reduce((s, n) => s + n, 0);
  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Estado de pólizas</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Pólizas registradas en {periodo}</p>
      {totalMes === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          Sin pólizas registradas este mes.{' '}
          <Link to="/ventas" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Registra la primera</Link>.
        </div>
      ) : (
        // Móvil: rejilla de tarjetitas; escritorio (sm+): franja con divisores.
        <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-0">
          {ESTADOS_POLIZA_DOT.map(([estado, dot], i) => (
            <div
              key={estado}
              className={`rounded-xl border border-slate-100 p-3 dark:border-slate-700/60 sm:min-w-[120px] sm:flex-1 sm:rounded-none sm:border-0 sm:p-0 sm:px-5 sm:py-1 ${i > 0 ? 'sm:border-l sm:border-slate-100 dark:sm:border-slate-700/60' : 'sm:pl-0'}`}
            >
              <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-800 dark:text-slate-100">{num(polizasMes[estado] || 0)}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <span className={`h-[7px] w-[7px] rounded-full ${dot}`} />
                {ESTADOS_VENTA_LABEL[estado]}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Ranking de asesores (solo promotores) ---------- */

function Ranking({ ranking = [], fraccion }) {
  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Ranking de asesores</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Por prima colocada este mes</p>
      {ranking.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Aún no hay asesores activos.{' '}
          <Link to="/asesores" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Invita al primero</Link>.
        </div>
      ) : (
        <div className="mt-4">
          {ranking.map((r, i) => {
            const pct = r.metaPrima ? pctAvance(r.prima, r.metaPrima) : null;
            const st = r.metaPrima ? ESTADOS_RITMO[claveRitmo(pct, fraccion)] : ESTADOS_RITMO.SIN_META;
            return (
              <Link
                key={r.id}
                to={`/equipo/${r.id}`}
                className={`group flex cursor-pointer items-center gap-4 py-4 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-700/60' : ''}`}
              >
                <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">{r.nombre}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                    <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${pct == null ? 0 : Math.min(pct, 100)}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="money-earned text-sm">{mxn(r.prima)}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    {pct == null ? 'sin meta asignada' : `${pct}% de su meta`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- Referidos y bonos ---------- */

function ReferidosBonos({ data, periodo }) {
  const { referidosMes, bonosMes } = data;
  const tasa = referidosMes.total > 0 ? Math.round((referidosMes.convertidos / referidosMes.total) * 100) : null;
  const Fila = ({ k, v, clase = 'text-slate-800 dark:text-slate-100' }) => (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-3 text-sm first:border-t-0 dark:border-slate-700/60">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <b className={`tabular-nums font-semibold ${clase}`}>{v}</b>
    </div>
  );
  return (
    <section className="card p-5 sm:p-7">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Referidos y bonos</h3>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{periodo}</p>
      <div className="mt-4 grid gap-x-10 sm:grid-cols-2">
        <div>
          <Fila k="Referidos del mes" v={num(referidosMes.total)} />
          <Fila k="Convertidos" v={num(referidosMes.convertidos)} clase="text-emerald-600 dark:text-emerald-400" />
          <Fila k="Tasa de referidos" v={tasa == null ? '—' : `${tasa}%`} />
        </div>
        <div>
          <Fila k="Bonos cobrados" v={mxn(bonosMes.cobrados.monto)} clase="text-emerald-600 dark:text-emerald-400" />
          <Fila k="Bonos por ganar" v={mxn(bonosMes.porGanar.monto)} />
          <Fila k="Comisión en pipeline" v={mxn(data.comisionPipeline)} clase="text-slate-500 dark:text-slate-400" />
        </div>
      </div>
    </section>
  );
}
