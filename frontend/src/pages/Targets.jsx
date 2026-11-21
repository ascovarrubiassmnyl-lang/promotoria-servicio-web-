import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, EmptyState, NumeroFormateado } from '../components/ui.jsx';
import { mxn, num, nombreMes } from '../lib/format.js';
import GoalBlock, { MiniBar, FilaMetrica } from '../components/metas/GoalBlock.jsx';
import { infoRitmo, pctAvance, diasPeriodo, ESTADOS_RITMO } from '../components/metas/ritmo.js';
import { METRICAS, sinMetas, cumplimiento, ESTADOS_CUMPLIMIENTO } from '../components/metas/metricas.js';
import ProcesoVentas from '../components/dashboard/ProcesoVentas.jsx';
import useIsMobile from '../hooks/useIsMobile.js';

// recharts pesa ~400 kB: las gráficas se cargan aparte (misma convención que
// tenían en Inicio y que el 3D decorativo). Las dos salen del mismo módulo.
const TendenciaVentas = lazy(() => import('../components/dashboard/Graficas.jsx').then((m) => ({ default: m.TendenciaVentas })));
const PrimaPorRamo = lazy(() => import('../components/dashboard/Graficas.jsx').then((m) => ({ default: m.PrimaPorRamo })));

const GraficaCargando = () => (
  <section className="card flex items-center justify-center p-5" style={{ minHeight: 300 }}>
    <span className="text-sm text-slate-400 dark:text-slate-500">Cargando gráfica…</span>
  </section>
);

// Análisis del mes (movido desde Inicio el 2026-11-20): tendencia de 12
// meses, prima por ramo y proceso de ventas. Inicio se quedó con lo del día;
// esto es lectura de cómo va el mes y vive junto a la meta. Mismos
// endpoints y componentes de antes, sin definiciones nuevas. Prima por ramo y
// proceso vienen de /metricas (sección `dashboard`): sin ella solo se ve la
// tendencia.
// Celular (< md): los bloques secundarios viven detrás de un encabezado que
// se abre al tocarlo, y su contenido (consultas y recharts incluidos) no se
// monta hasta entonces. En escritorio no existe: pinta a los hijos tal cual.
function Plegable({ titulo, nota, esMovil, children }) {
  const [abierto, setAbierto] = useState(false);
  if (!esMovil) return children;
  return (
    <section>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="card flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-slate-800 dark:text-slate-100">{titulo}</span>
          {nota && <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{nota}</span>}
        </span>
        <Chevron abierto={abierto} />
      </button>
      {abierto && <div className="mt-3">{children}</div>}
    </section>
  );
}

function Chevron({ abierto }) {
  return (
    <svg
      viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`h-5 w-5 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none dark:text-slate-500 ${abierto ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function AnalisisDelMes({ admin, mes, anio, esMovil = false }) {
  const { puede } = useAuth();
  const verMetricas = puede('dashboard');
  const { data: historial } = useQuery({
    queryKey: ['metas-historial', mes, anio],
    queryFn: async () => (await api.get('/targets/historial', { params: { mes, anio, meses: 12 } })).data,
  });
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', mes, anio],
    queryFn: async () => (await api.get('/metricas/dashboard', { params: { mes, anio } })).data,
    enabled: verMetricas,
  });
  const { data: proceso } = useQuery({
    queryKey: ['proceso-ventas', mes, anio],
    queryFn: async () => (await api.get('/metricas/proceso-ventas', { params: { mes, anio } })).data,
    enabled: verMetricas,
  });
  // Celular: cada bloque sin datos se oculta solo (compacto); si ya cargó
  // todo y no quedó ninguno, una línea en vez de tres tarjetas vacías.
  if (esMovil) {
    const cargando = !historial || (verMetricas && (!dashboard || !proceso));
    const hayTendencia = (historial?.periodos || []).some((p) => (p.actual?.prima || 0) > 0 || p.meta?.metaPrimaMonto);
    const hayRamos = verMetricas && (dashboard?.primaPorRamo || []).length > 0;
    const hayProceso = verMetricas && (proceso?.niveles || []).some((n) => n.count > 0);
    if (cargando) return <p className="px-1 py-3 text-sm text-slate-400 dark:text-slate-500">Cargando…</p>;
    if (!hayTendencia && !hayRamos && !hayProceso) {
      return <p className="px-1 py-3 text-sm text-slate-500 dark:text-slate-400">Aún no hay datos para analizar en {nombreMes(mes)} {anio}.</p>;
    }
    const cargandoGrafica = <p className="px-1 py-3 text-sm text-slate-400 dark:text-slate-500">Cargando gráfica…</p>;
    return (
      <div className="space-y-3">
        {hayTendencia && (
          <Suspense fallback={cargandoGrafica}>
            <TendenciaVentas historial={historial} admin={admin} compacto />
          </Suspense>
        )}
        {hayRamos && (
          <Suspense fallback={cargandoGrafica}>
            <PrimaPorRamo data={dashboard} mes={mes} anio={anio} compacto />
          </Suspense>
        )}
        {hayProceso && <ProcesoVentas proceso={proceso} compacto />}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Análisis del mes</h2>
      <div className={`grid gap-4 ${verMetricas ? 'lg:grid-cols-2' : ''}`}>
        <Suspense fallback={<GraficaCargando />}>
          <TendenciaVentas historial={historial} admin={admin} />
        </Suspense>
        {verMetricas && dashboard && (
          <Suspense fallback={<GraficaCargando />}>
            <PrimaPorRamo data={dashboard} mes={mes} anio={anio} />
          </Suspense>
        )}
      </div>
      {verMetricas && <ProcesoVentas proceso={proceso} />}
    </section>
  );
}

function ChipTranscurrido({ mes, anio }) {
  const { dia, dias, fraccion } = diasPeriodo(mes, anio);
  const texto = fraccion <= 0 ? 'El mes aún no inicia'
    : fraccion >= 1 ? 'Mes concluido'
    : <>Mes transcurrido: <b className="text-slate-700 dark:text-slate-200">{Math.round(fraccion * 100)}%</b> · día {dia} de {dias}</>;
  return (
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 rounded-lg px-2.5 py-1.5">
      {texto}
    </span>
  );
}

// Reconciliación por métrica: suma de metas individuales vs meta de promotoría.
// Solo aparecen las métricas con meta de equipo fijada.
function Reconciliacion({ equipo }) {
  const meta = equipo?.meta;
  if (!meta || sinMetas(meta)) return null;
  const filas = METRICAS.filter((m) => meta[m.campo]).map((m) => {
    const fmt = m.money ? mxn : num;
    const suma = equipo.sumaIndividual[m.key] || 0;
    const gap = meta[m.campo] - suma;
    return { ...m, fmt, suma, objetivo: meta[m.campo], gap };
  });
  return (
    <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
      <div className="mb-2 text-xs md:text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Reconciliación · suma de metas individuales vs meta de promotoría
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3 text-sm">
        {filas.map((f) => (
          <div key={f.key} className="flex items-baseline justify-between gap-3 py-1 md:py-0">
            <span className="text-slate-500 dark:text-slate-400">{f.corto}</span>
            <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200 text-right md:text-left">
              {f.fmt(f.suma)} / {f.fmt(f.objetivo)}
              {f.gap > 0 && <span className="block md:inline md:ml-2 font-semibold text-amber-600 dark:text-amber-400">Por asignar {f.fmt(f.gap)}</span>}
              {f.gap < 0 && <span className="block md:inline md:ml-2 font-semibold text-red-600 dark:text-red-400">Sobreasignado {f.fmt(-f.gap)}</span>}
              {f.gap === 0 && <span className="block md:inline md:ml-2 font-semibold text-emerald-600 dark:text-emerald-400">Cubierta</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Formulario de las 6 métricas (meta de equipo o fila de asesor). La de dinero
// (prima) lleva separador de miles en vivo, como cualquier otro monto grande
// del sistema; las de conteo (ventas, citas…) se quedan como número simple.
function CamposMeta({ valores, onChange, autoFocus = false }) {
  return METRICAS.map((m, i) => (
    <label key={m.key} className="label !mb-0">
      {m.label}
      {m.money ? (
        <NumeroFormateado
          className="w-full md:w-32 mt-1 min-h-[44px] md:min-h-0 text-base md:text-sm" placeholder={m.placeholder}
          value={valores[m.key]} autoFocus={autoFocus && i === 0}
          onChange={(v) => onChange({ ...valores, [m.key]: v })}
        />
      ) : (
        <input
          type="number" min="0" inputMode="numeric" className="input w-full md:w-32 mt-1 min-h-[44px] md:min-h-0 text-base md:text-sm" placeholder={m.placeholder}
          value={valores[m.key]} autoFocus={autoFocus && i === 0}
          onChange={(e) => onChange({ ...valores, [m.key]: e.target.value })}
        />
      )}
    </label>
  ));
}

const valoresDe = (t) => Object.fromEntries(METRICAS.map((m) => [m.key, t?.[m.campo] ?? '']));
const payloadDe = (valores) => Object.fromEntries(METRICAS.map((m) => [m.campo, valores[m.key] === '' ? null : +valores[m.key]]));

// Meta de ingreso (PRP): campo personal aparte de las 6 métricas, solo en
// Target (no se reconcilia contra la meta de equipo). El backend la traduce
// a "pólizas necesarias" con la comisión promedio histórica del asesor
// (GET /targets/resumen → promedioComisionPoliza/polizasParaMeta).
function MetaIngresoNota({ fila }) {
  const meta = fila?.meta?.metaIngresoMonto;
  if (!meta) return <span className="text-xs italic text-slate-400 dark:text-slate-500">Sin meta de ingreso</span>;
  if (!fila.promedioComisionPoliza) {
    return (
      <>
        <div className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{mxn(meta)}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">Aún sin pólizas ganadas para proyectar</div>
      </>
    );
  }
  const faltan = Math.max(0, (fila.polizasParaMeta || 0) - fila.actual.ventas);
  return (
    <>
      <div className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{mxn(meta)}/mes</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        ≈ {fila.polizasParaMeta} pólizas ({mxn(fila.promedioComisionPoliza)} prom.){' '}
        {faltan > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-400">· faltan {faltan}</span> : <span className="font-semibold text-emerald-600 dark:text-emerald-400">· cubierta</span>}
      </div>
    </>
  );
}

// Grid de bloques grandes (meta de promotoría / "mi meta") en las 6 métricas.
function BloquesMeta({ meta, actual, fraccion }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
      {METRICAS.map((m) => (
        <GoalBlock key={m.key} label={m.label} actual={actual?.[m.key] ?? 0} meta={meta?.[m.campo]} fraccion={fraccion} money={m.money} />
      ))}
    </div>
  );
}

// Celular: la prima es el bloque principal (con su marcador de ritmo y
// proyección) y el resto de métricas una lista compacta. Una métrica sin meta
// y sin avance no ocupa renglón.
function ResumenMovil({ meta, actual, fraccion }) {
  const prima = METRICAS.find((m) => m.key === 'prima');
  const resto = METRICAS.filter((m) => m.key !== 'prima' && (meta?.[m.campo] || (actual?.[m.key] ?? 0) > 0));
  return (
    <>
      <GoalBlock label={prima.label} actual={actual?.prima ?? 0} meta={meta?.[prima.campo]} fraccion={fraccion} money />
      {resto.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700/60 dark:border-slate-700/60">
          {resto.map((m) => (
            <FilaMetrica key={m.key} label={m.label} actual={actual?.[m.key] ?? 0} meta={meta?.[m.campo]} fraccion={fraccion} money={m.money} />
          ))}
        </div>
      )}
    </>
  );
}

// Celular: una tarjeta por asesor (lugar, nombre, estado y prima vs meta). Al
// tocarla se despliegan las demás métricas y la edición de su meta — el mismo
// estado `editRow` y el mismo guardado que la tabla de escritorio.
function AsesoresMovil({ filas, fraccion, totalPrimaEquipo, editRow, setEditRow, onEditar, onGuardar, saving }) {
  const [abiertoId, setAbiertoId] = useState(null);
  return (
    <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-700/60">
      {filas.map((f, i) => {
        const editando = editRow?.asesorId === f.id;
        const abierto = editando || abiertoId === f.id;
        const resto = METRICAS.filter((m) => m.key !== 'prima' && (f.meta?.[m.campo] || f.actual[m.key] > 0));
        return (
          <li key={f.id}>
            <button
              type="button"
              aria-expanded={abierto}
              onClick={() => setAbiertoId(abierto ? null : f.id)}
              disabled={editando}
              className="flex min-h-[64px] w-full items-center gap-3 py-3 text-left"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{i + 1}</span>
              <span className="block min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.nombre}</span>
                  <span className={`badge shrink-0 ${f.st.pill}`}>{f.st.label}</span>
                </span>
                <span className="mt-2 block">
                  {f.meta?.metaPrimaMonto
                    ? <MiniBar actual={f.actual.prima} meta={f.meta.metaPrimaMonto} fraccion={fraccion} money />
                    : <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">Prima {mxn(f.actual.prima)} · sin meta de prima</span>}
                </span>
              </span>
              <Chevron abierto={abierto} />
            </button>

            {abierto && !editando && (
              <div className="pb-4">
                {resto.length > 0 && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700/60 dark:border-slate-700/60">
                    {resto.map((m) => (
                      <FilaMetrica key={m.key} label={m.label} actual={f.actual[m.key]} meta={f.meta?.[m.campo]} fraccion={fraccion} money={m.money} />
                    ))}
                  </div>
                )}
                {totalPrimaEquipo > 0 && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {Math.round((f.actual.prima / totalPrimaEquipo) * 100)}% de la prima del equipo
                  </p>
                )}
                {f.meta?.metaIngresoMonto ? (
                  <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-700/40">
                    <div className="mb-1 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Meta de ingreso (PRP)</div>
                    <MetaIngresoNota fila={f} />
                  </div>
                ) : null}
                <button type="button" className="btn-secondary mt-3 min-h-[44px] w-full" onClick={() => onEditar(f)}>
                  {f.sinMeta ? 'Asignar meta' : 'Editar meta'}
                </button>
              </div>
            )}

            {editando && (
              <div className="pb-4">
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-700/40">
                  <CamposMeta valores={editRow.valores} onChange={(valores) => setEditRow({ ...editRow, valores })} />
                  <label className="label col-span-2 !mb-0">
                    Meta de ingreso (PRP)
                    <NumeroFormateado
                      className="mt-1 min-h-[44px] w-full text-base" placeholder="Ingreso MXN"
                      value={editRow.ingreso}
                      onChange={(v) => setEditRow({ ...editRow, ingreso: v })}
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setEditRow(null)}>Cancelar</button>
                  <button type="button" className="btn-primary min-h-[44px]" onClick={onGuardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Celular: el historial como lista de periodos (sin tabla ni scroll
// horizontal). Los periodos sin meta registrada no ocupan renglón.
function HistorialMovil({ filas }) {
  const conMeta = filas.filter((f) => f.cump.clave !== 'SIN_META');
  const sinMeta = filas.length - conMeta.length;
  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {conMeta.map((f) => {
          const st = ESTADOS_CUMPLIMIENTO[f.cump.clave];
          return (
            <li key={`${f.anio}-${f.mes}`} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{nombreMes(f.mes)} {f.anio}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {!f.enCurso && <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{f.cump.cumplidas}/{f.cump.total}</span>}
                  <span className={`badge ${st.pill}`}>{st.label}</span>
                </span>
              </div>
              <dl className="mt-2 space-y-1">
                {f.cump.metricas.map((m) => {
                  const fmt = m.money ? mxn : num;
                  const clase = m.cumplida
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : f.enCurso ? 'text-slate-700 dark:text-slate-200' : 'text-red-600 dark:text-red-400';
                  return (
                    <div key={m.key} className="flex items-baseline justify-between gap-3 text-sm">
                      <dt className="text-slate-500 dark:text-slate-400">{m.corto}</dt>
                      <dd className={`tabular-nums font-semibold ${clase}`}>
                        {fmt(m.logrado)} <span className="font-normal text-slate-400 dark:text-slate-500">/ {fmt(m.objetivo)}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          );
        })}
      </ul>
      {sinMeta > 0 && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {conMeta.length === 0 ? 'Ningún periodo de este rango tiene meta registrada.' : `${sinMeta} ${sinMeta === 1 ? 'periodo sin meta registrada no se muestra' : 'periodos sin meta registrada no se muestran'}.`}
        </p>
      )}
    </>
  );
}

// Historial de metas: un renglón por mes con la meta que se registró y si se
// alcanzó. La meta ya "se reinicia" sola cada mes (Target/TargetEquipo son una
// fila por mes+año); esto es la memoria de esos periodos — cumplidos y no
// cumplidos — sin tener que ir cambiando el selector mes por mes.
function Historial({ admin, asesores, mes, anio, esMovil = false }) {
  const [meses, setMeses] = useState(12);
  const [scope, setScope] = useState(''); // '' = promotoría (solo admin)
  const asesorId = admin ? scope : '';
  const hoy = new Date();

  const { data } = useQuery({
    queryKey: ['metas-historial', mes, anio, meses, asesorId],
    queryFn: async () => (await api.get('/targets/historial', { params: { mes, anio, meses, ...(asesorId ? { asesorId } : {}) } })).data,
  });

  const filas = (data?.periodos || []).map((p) => {
    const enCurso = p.mes === hoy.getMonth() + 1 && p.anio === hoy.getFullYear();
    return { ...p, enCurso, cump: cumplimiento(p.meta, p.actual, { enCurso }) };
  });
  const cerrados = filas.filter((f) => !f.enCurso && f.cump.clave !== 'SIN_META');
  const logrados = cerrados.filter((f) => f.cump.clave === 'CUMPLIDA').length;

  if (esMovil) {
    return (
      <div className="card p-4">
        <div className={`grid gap-2 ${admin ? 'grid-cols-2' : ''}`}>
          {admin && (
            <select aria-label="Historial de" className="input min-h-[44px] text-base" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">Promotoría</option>
              {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          <select aria-label="Periodos a mostrar" className="input min-h-[44px] text-base" value={meses} onChange={(e) => setMeses(+e.target.value)}>
            {[6, 12, 24].map((n) => <option key={n} value={n}>Últimos {n} meses</option>)}
          </select>
        </div>
        {!data ? (
          <p className="py-3 text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
        ) : (
          <>
            {cerrados.length > 0 && (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                <b className="text-slate-700 dark:text-slate-200">{logrados} de {cerrados.length}</b> periodos cerrados con meta se cumplieron por completo.
              </p>
            )}
            <div className="mt-1"><HistorialMovil filas={filas} /></div>
          </>
        )}
      </div>
    );
  }

  return (
    <Card
      title="Historial de metas"
      subtitle={admin && !asesorId ? 'Metas de promotoría de periodos anteriores' : 'Metas registradas y su resultado, periodo por periodo'}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {admin && (
            <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">Promotoría</option>
              {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          <select className="input w-auto" value={meses} onChange={(e) => setMeses(+e.target.value)}>
            {[6, 12, 24].map((n) => <option key={n} value={n}>Últimos {n} meses</option>)}
          </select>
        </div>
      )}
    >
      {filas.length === 0 ? <EmptyState message="Sin periodos que mostrar" /> : (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {cerrados.length === 0
              ? 'Aún no hay periodos cerrados con meta registrada.'
              : <><b className="text-slate-700 dark:text-slate-200">{logrados} de {cerrados.length}</b> periodos cerrados con meta se cumplieron por completo.</>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Periodo</th>
                  {METRICAS.map((m) => <th key={m.key} className="py-2 pr-4">{m.corto}</th>)}
                  <th className="py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const st = ESTADOS_CUMPLIMIENTO[f.cump.clave];
                  return (
                    <tr key={`${f.anio}-${f.mes}`} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                      <td className="py-2.5 pr-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
                        {nombreMes(f.mes)} {f.anio}
                        {f.enCurso && <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">en curso</span>}
                      </td>
                      {METRICAS.map((m) => {
                        const objetivo = f.meta?.[m.campo];
                        const fmt = m.money ? mxn : num;
                        if (!objetivo) return <td key={m.key} className="py-2.5 pr-4 text-slate-300 dark:text-slate-600">—</td>;
                        const ok = (f.actual[m.key] ?? 0) >= objetivo;
                        const clase = ok
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : f.enCurso ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-400';
                        return (
                          <td key={m.key} className={`py-2.5 pr-4 tabular-nums whitespace-nowrap font-semibold ${clase}`}>
                            {fmt(f.actual[m.key] ?? 0)} <span className="font-normal text-slate-400 dark:text-slate-500">/ {fmt(objetivo)}</span>
                          </td>
                        );
                      })}
                      <td className="py-2.5">
                        <span className={`badge ${st.pill}`}>{st.label}</span>
                        {f.cump.total > 0 && (
                          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 tabular-nums">{f.cump.cumplidas}/{f.cump.total}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

export default function Targets() {
  const qc = useQueryClient();
  const { esAdmin } = useAuth();
  const admin = esAdmin();
  const esMovil = useIsMobile();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [err, setErr] = useState('');
  // Edición en línea: fila de asesor en edición y formulario de meta de equipo
  const [editRow, setEditRow] = useState(null); // { asesorId, valores }
  const [editTeam, setEditTeam] = useState(null); // { valores }
  const [saving, setSaving] = useState(false);

  const { fraccion } = diasPeriodo(mes, anio);
  const periodo = `${nombreMes(mes)} ${anio}`;

  // Resumen del periodo: asesores con meta + actuales de las 6 métricas.
  // La API acota por rol: el asesor recibe solo su propia fila.
  const { data: resumen } = useQuery({
    queryKey: ['metas-resumen', mes, anio],
    queryFn: async () => (await api.get('/targets/resumen', { params: { mes, anio } })).data,
  });
  const { data: equipo } = useQuery({
    queryKey: ['meta-equipo', mes, anio],
    enabled: admin,
    queryFn: async () => (await api.get('/targets/equipo', { params: { mes, anio } })).data,
  });

  const invalidar = () => {
    qc.invalidateQueries(['metas-resumen']);
    qc.invalidateQueries(['meta-equipo']);
  };

  const guardarFila = async () => {
    setSaving(true); setErr('');
    try {
      const metaIngresoMonto = editRow.ingreso === '' ? null : +editRow.ingreso;
      await api.post('/targets', { asesorId: editRow.asesorId, mes, anio, ...payloadDe(editRow.valores), metaIngresoMonto });
      setEditRow(null);
      invalidar();
    } catch (e) { setErr(handleError(e)); } finally { setSaving(false); }
  };

  const editarFila = (f) => {
    setEditRow({ asesorId: f.id, valores: valoresDe(f.meta), ingreso: f.meta?.metaIngresoMonto ?? '' });
    setErr('');
  };

  const guardarEquipo = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      await api.post('/targets/equipo', { mes, anio, ...payloadDe(editTeam.valores) });
      setEditTeam(null);
      invalidar();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  // Filas: estado por ritmo = el PEOR avance entre las métricas con meta.
  // Ranking por % de avance de prima (y prima absoluta como desempate).
  const asesores = resumen?.asesores || [];
  const totalPrimaEquipo = asesores.reduce((s, a) => s + a.actual.prima, 0);
  const filas = asesores
    .map((a) => {
      const sinMeta = sinMetas(a.meta);
      const pcts = METRICAS.filter((m) => a.meta?.[m.campo]).map((m) => pctAvance(a.actual[m.key], a.meta[m.campo]));
      const st = sinMeta ? ESTADOS_RITMO.SIN_META : infoRitmo(Math.min(...pcts), fraccion);
      const pctP = a.meta?.metaPrimaMonto ? pctAvance(a.actual.prima, a.meta.metaPrimaMonto) : null;
      return { ...a, sinMeta, pctP, st };
    })
    .sort((a, b) => {
      if (a.sinMeta !== b.sinMeta) return a.sinMeta ? 1 : -1;
      return (b.pctP ?? -1) - (a.pctP ?? -1) || b.actual.prima - a.actual.prima;
    });

  const metaEquipo = equipo?.meta;
  const mio = admin ? null : asesores[0];
  const miSinMeta = sinMetas(mio?.meta);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{admin ? 'Metas / Targets' : 'Mi meta'}</h2>
        <div className="flex gap-2">
          <select aria-label="Mes" className="input w-auto min-h-[44px] text-base md:min-h-0 md:text-sm" value={mes} onChange={(e) => { setMes(+e.target.value); setEditRow(null); setEditTeam(null); }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{nombreMes(i + 1)}</option>)}
          </select>
          <input type="number" aria-label="Año" inputMode="numeric" className="input w-24 min-h-[44px] text-base md:min-h-0 md:text-sm" value={anio} onChange={(e) => { setAnio(+e.target.value); setEditRow(null); setEditTeam(null); }} />
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Nivel 1 — meta de promotoría (solo promotores) */}
      {admin && (
        <Card
          title={`Meta de la promotoría · ${periodo}`}
          subtitle="Objetivo agregado de todo el equipo"
          actions={(
            <div className="flex flex-wrap items-center gap-3">
              <ChipTranscurrido mes={mes} anio={anio} />
              {!editTeam && (
                <button className="btn-secondary min-h-[44px] md:min-h-0" onClick={() => setEditTeam({ valores: valoresDe(metaEquipo) })}>
                  {metaEquipo ? 'Editar meta' : 'Asignar meta'}
                </button>
              )}
            </div>
          )}
        >
          {editTeam && (
            <form onSubmit={guardarEquipo} className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3 md:flex md:flex-wrap md:items-end md:p-4">
              <CamposMeta valores={editTeam.valores} onChange={(valores) => setEditTeam({ valores })} />
              <div className="col-span-2 grid grid-cols-2 gap-2 md:flex">
                <button type="submit" className="btn-primary min-h-[44px] md:min-h-0" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                <button type="button" className="btn-secondary min-h-[44px] md:min-h-0" onClick={() => setEditTeam(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {metaEquipo || editTeam ? (
            <>
              {esMovil
                ? <ResumenMovil meta={metaEquipo} actual={equipo?.actual} fraccion={fraccion} />
                : <BloquesMeta meta={metaEquipo} actual={equipo?.actual} fraccion={fraccion} />}
              <Reconciliacion equipo={equipo} />
            </>
          ) : (
            <EmptyState message={`Sin meta de promotoría para ${periodo}. Asígnala para leer el avance del equipo contra un objetivo.`} />
          )}
        </Card>
      )}

      {/* Nivel 2 — metas individuales */}
      {admin ? (
        <Card title={`Metas por asesor · ${periodo}`} subtitle="Avance individual contra la meta asignada, en las 6 métricas">
          {filas.length === 0 ? <EmptyState message="Sin asesores activos" /> : esMovil ? (
            <AsesoresMovil
              filas={filas} fraccion={fraccion} totalPrimaEquipo={totalPrimaEquipo}
              editRow={editRow} setEditRow={setEditRow} onEditar={editarFila} onGuardar={guardarFila} saving={saving}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="py-2 pr-3 w-10">#</th>
                    <th className="py-2 pr-4">Asesor</th>
                    {METRICAS.map((m) => <th key={m.key} className="py-2 pr-4">{m.corto}</th>)}
                    <th className="py-2 pr-4">Meta ingreso (PRP)</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const editando = editRow?.asesorId === f.id;
                    return (
                      <tr key={f.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/60 dark:hover:bg-slate-700/30 align-top">
                        <td className="py-3 pr-3">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-500 dark:text-slate-300">{i + 1}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-700 dark:text-slate-200">{f.nombre}</div>
                          {totalPrimaEquipo > 0 && (
                            <div className="text-xs text-slate-400 dark:text-slate-500">{Math.round((f.actual.prima / totalPrimaEquipo) * 100)}% de la prima del equipo</div>
                          )}
                        </td>
                        {editando ? (
                          <>
                            {METRICAS.map((m, j) => (
                              <td key={m.key} className="py-3 pr-4">
                                {m.money ? (
                                  <NumeroFormateado
                                    className="w-24" placeholder={m.placeholder}
                                    value={editRow.valores[m.key]} autoFocus={j === 0}
                                    onChange={(v) => setEditRow({ ...editRow, valores: { ...editRow.valores, [m.key]: v } })}
                                  />
                                ) : (
                                  <input
                                    type="number" min="0" className="input w-24" placeholder={m.placeholder}
                                    value={editRow.valores[m.key]} autoFocus={j === 0}
                                    onChange={(e) => setEditRow({ ...editRow, valores: { ...editRow.valores, [m.key]: e.target.value } })}
                                  />
                                )}
                              </td>
                            ))}
                            <td className="py-3 pr-4">
                              <NumeroFormateado
                                className="w-32" placeholder="Ingreso MXN"
                                value={editRow.ingreso}
                                onChange={(v) => setEditRow({ ...editRow, ingreso: v })}
                              />
                            </td>
                            <td className="py-3 pr-4" colSpan={2}>
                              <div className="flex justify-end gap-2">
                                <button className="btn-primary" onClick={guardarFila} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                                <button className="btn-secondary" onClick={() => setEditRow(null)}>Cancelar</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            {METRICAS.map((m) => (
                              <td key={m.key} className="py-3 pr-4">
                                {f.meta?.[m.campo]
                                  ? <MiniBar actual={f.actual[m.key]} meta={f.meta[m.campo]} fraccion={fraccion} money={m.money} compact />
                                  : <span className="text-xs italic text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">{(m.money ? mxn : num)(f.actual[m.key])} / —</span>}
                              </td>
                            ))}
                            <td className="py-3 pr-4"><MetaIngresoNota fila={f} /></td>
                            <td className="py-3 pr-4"><span className={`badge ${f.st.pill}`}>{f.st.label}</span></td>
                            <td className="py-3 text-right">
                              <button
                                className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
                                onClick={() => editarFila(f)}
                              >
                                {f.sinMeta ? 'Asignar meta' : 'Editar meta'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : esMovil ? (
        /* Vista asesor en celular: prima vs meta arriba, el resto en lista. */
        <section className="card p-4">
          <div className="mb-4"><ChipTranscurrido mes={mes} anio={anio} /></div>
          {miSinMeta && (
            <p className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Aún no tienes meta para {periodo}. Pídesela a tu promotora; este es tu avance real.
            </p>
          )}
          <ResumenMovil meta={mio?.meta} actual={mio?.actual} fraccion={fraccion} />
          {mio?.meta?.metaIngresoMonto ? (
            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3 text-sm">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Meta de ingreso (PRP)</div>
              <MetaIngresoNota fila={mio} />
            </div>
          ) : null}
        </section>
      ) : (
        /* Vista asesor: solo su meta y su avance. La API ya fuerza el alcance. */
        <Card
          title={`Mi meta · ${periodo}`}
          subtitle="Tu avance contra la meta asignada por tu promotor"
          actions={<ChipTranscurrido mes={mes} anio={anio} />}
        >
          {miSinMeta && (
            <p className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Aún no tienes meta asignada para {periodo}. Pídesela a tu promotor; mientras tanto, aquí va tu avance real.
            </p>
          )}
          <BloquesMeta meta={mio?.meta} actual={mio?.actual} fraccion={fraccion} />
          {mio?.meta?.metaIngresoMonto ? (
            <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3 text-sm">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Meta de ingreso (PRP)</div>
              <MetaIngresoNota fila={mio} />
            </div>
          ) : null}
        </Card>
      )}

      <Plegable esMovil={esMovil} titulo="Análisis del mes" nota="Tendencia, prima por ramo y proceso de ventas">
        <AnalisisDelMes admin={admin} mes={mes} anio={anio} esMovil={esMovil} />
      </Plegable>

      {/* Historial: periodos anteriores con su meta y su resultado */}
      <Plegable esMovil={esMovil} titulo="Historial" nota={admin ? 'Metas de meses anteriores y su resultado' : 'Tus metas de meses anteriores y su resultado'}>
        <Historial admin={admin} asesores={asesores} mes={mes} anio={anio} esMovil={esMovil} />
      </Plegable>
    </div>
  );
}
