import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { mxn, num, nombreMes } from '../lib/format.js';
import { diasPeriodo, claveRitmo, ESTADOS_RITMO, pctAvance } from '../components/metas/ritmo.js';
import { infoTipoNotificacion } from '../components/notificaciones/tipos.jsx';
import { useListaNotificaciones, useMarcarLeida, useMarcarTodasLeidas } from '../hooks/useNotificaciones.js';
import { RankingAsesores } from '../components/dashboard/Leaderboard.jsx';

// recharts pesa ~400 kB: las gráficas se cargan aparte para no cobrárselo al
// bundle inicial de toda la app (misma convención que el 3D decorativo). Las
// dos salen del mismo módulo, así que es una sola descarga.
const TendenciaVentas = lazy(() => import('../components/dashboard/Graficas.jsx').then((m) => ({ default: m.TendenciaVentas })));
const PrimaPorRamo = lazy(() => import('../components/dashboard/Graficas.jsx').then((m) => ({ default: m.PrimaPorRamo })));

function GraficaCargando() {
  return (
    <section className="card flex items-center justify-center p-5 sm:p-7" style={{ minHeight: 300 }}>
      <span className="text-sm text-slate-400 dark:text-slate-500">Cargando gráfica…</span>
    </section>
  );
}

// Dashboard (rediseño 2026-08-25, a pedido del usuario): minimalista a
// propósito — antes tenía 6 secciones y se sentía "ruidoso" para un asesor.
// Se redujo a lo que de verdad se consulta día a día: 4 KPIs (prima del
// periodo, pólizas activas, clientes, vigencias por vencer), "Requiere tu
// atención" y el proceso de ventas. Se eliminaron "Estado de pólizas" y "Referidos y
// bonos" (esos números siguen disponibles en Pólizas y Metas, no se
// duplican aquí). El anillo de avance con narrativa de ritmo también se
// retiró del centro visual; el mismo semáforo de ritmo sobrevive, más
// discreto, como nota de color bajo la cifra de prima.
// Gráficas (2026-08-25, inspiradas en la sección "dashboard-2" de la plantilla
// shadcn-dashboard-landing-template que el usuario tomó como referencia de UI):
// se agregó UNA fila con "Tendencia de ventas" (12 meses, prima vs meta) y
// "Prima por ramo" (dona), más el delta "vs. mes anterior" en dos KPIs. Es lo
// que el rediseño minimalista no tenía —lectura en el tiempo y de dónde viene
// el dinero— sin volver a llenar la pantalla de tarjetas. Se adoptó el tipo de
// gráfica y el layout de la plantilla, NO su stack (shadcn/ui + Radix): la
// única dependencia nueva es recharts, el motor de las gráficas.
// Definiciones únicas (mismas fuentes que Pólizas/Metas, ver metricas.js):
//  - Venta ganada = APROBADA/PAGADA creada en el periodo.
//  - Póliza "activa" = estado ∈ {PAGADA, FIRMADA, APROBADA} (igual que la
//    ficha de cliente), snapshot de hoy, no acotado al mes en curso.
// Alcance por rol garantizado en servidor: el asesor recibe solo sus números
// y su meta individual; ranking y meta de promotoría solo llegan a promotores.
//
// "Requiere tu atención" ES la bandeja de notificaciones (2026-08-25, a
// pedido del usuario): se eliminó la sección /notificaciones y su enlace del
// menú de hamburguesa (campana) — el modelo, la API y el push del backend no
// cambiaron, solo dejaron de tener una página propia en el frontend. Este
// bloque combina las notificaciones sin leer (Nota.destinatario recordatorios,
// invitaciones de acompañamiento, avisos de meta…) con los pendientes que ya
// calculaba el servidor (pagos, citas de hoy, seguimiento, bonos), en una sola
// lista ordenada por urgencia. Al ya no haber una bandeja histórica navegable,
// "marcar como leída" aquí equivale a "ya lo atendí, quítalo de la lista".

export default function Dashboard() {
  const { user, esAdmin, puede } = useAuth();
  const admin = esAdmin();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const { fraccion } = diasPeriodo(mes, anio);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', mes, anio],
    queryFn: async () => (await api.get('/metricas/dashboard', { params: { mes, anio } })).data,
  });
  // Proceso de ventas del mes: los 5 pasos del trabajo comercial, del
  // prospecto nuevo a la póliza cobrada. Mide la tasa de cierre por el
  // recorrido completo, no solo por las pólizas que ya entraron.
  const { data: proceso } = useQuery({
    queryKey: ['proceso-ventas', mes, anio],
    queryFn: async () => (await api.get('/metricas/proceso-ventas', { params: { mes, anio } })).data,
  });
  // Tendencia de 12 meses y comparativo contra el mes anterior: se toman de
  // /targets/historial en vez de recalcularlos aquí, para que la prima del
  // dashboard y la de Metas nunca puedan diferir (misma actualesPorMes()).
  // Vive bajo la sección `metas`, así que solo se pide si el rol la tiene.
  const verTendencia = puede('metas');
  const { data: historial } = useQuery({
    queryKey: ['metas-historial', mes, anio],
    queryFn: async () => (await api.get('/targets/historial', { params: { mes, anio, meses: 12 } })).data,
    enabled: verTendencia,
  });

  const cambiarPeriodo = (m, a) => { setMes(m); setAnio(a); };

  if (isLoading || !data) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Encabezado user={user} admin={admin} mes={mes} anio={anio} onCambiarPeriodo={cambiarPeriodo} />

      <KpiPrincipales data={data} admin={admin} fraccion={fraccion} historial={historial} />

      <div className={`grid gap-6 ${verTendencia ? 'lg:grid-cols-2' : ''}`}>
        <Suspense fallback={<GraficaCargando />}>
          {verTendencia && <TendenciaVentas historial={historial} admin={admin} />}
        </Suspense>
        <Suspense fallback={<GraficaCargando />}>
          <PrimaPorRamo data={data} mes={mes} anio={anio} />
        </Suspense>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Atencion atencion={data.atencion} admin={admin} />
        <ProcesoVentas proceso={proceso} />
      </div>

      {/* Ranking: solo con alcance de administración. El servidor tampoco
          incluye `data.ranking` cuando quien consulta es ASESOR. */}
      {admin && (
        <RankingAsesores
          ranking={data.ranking}
          fraccion={fraccion}
          mes={mes}
          anio={anio}
          currentUserId={user?.id}
          vacio={<>Aún no hay asesores activos. <Link to="/asesores" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Invita al primero</Link>.</>}
        />
      )}
    </div>
  );
}

/* ---------- Encabezado: saludo + fecha + selector de periodo ---------- */

function saludo(hora) {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function Encabezado({ user, admin, mes, anio, onCambiarPeriodo }) {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-[28px]">
          {saludo(ahora.getHours())}, {user?.nombre}
        </h2>
        <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span>{fechaCap}</span>
          <span className="badge bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
            {admin ? 'Promotoría' : 'Asesor'}
          </span>
        </p>
      </div>
      <PeriodoSelector mes={mes} anio={anio} onChange={onCambiarPeriodo} />
    </div>
  );
}

// Selector de periodo (mes + año): flechas para moverse de mes en mes y un
// popover con cuadrícula de meses + salto de año para llegar lejos sin dar
// decenas de clics — mismo criterio que el selector de año de DatePicker.
function PeriodoSelector({ mes, anio, onChange }) {
  const [open, setOpen] = useState(false);
  const [anioVisible, setAnioVisible] = useState(anio);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAnioVisible(anio);
    const cerrar = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoy = new Date();
  const esActual = mes === hoy.getMonth() + 1 && anio === hoy.getFullYear();

  const mover = (delta) => {
    let m = mes + delta;
    let a = anio;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    onChange(m, a);
  };

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      {!esActual && (
        <button
          type="button"
          onClick={() => onChange(hoy.getMonth() + 1, hoy.getFullYear())}
          className="text-xs font-semibold text-brand-600 transition hover:underline dark:text-brand-400"
        >
          Hoy
        </button>
      )}
      <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Periodo anterior"
          className="rounded-l-xl p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 active:scale-90 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
        >
          <IconChevron dir="left" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-w-[132px] px-1 py-2 text-center text-sm font-semibold tabular-nums text-slate-700 transition hover:text-brand-600 dark:text-slate-200 dark:hover:text-brand-400"
        >
          {nombreMes(mes)} {anio}
        </button>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Periodo siguiente"
          className="rounded-r-xl p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 active:scale-90 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
        >
          <IconChevron dir="right" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => setAnioVisible((a) => a - 1)}
              aria-label="Año anterior"
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <IconChevron dir="left" small />
            </button>
            <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{anioVisible}</span>
            <button
              type="button"
              onClick={() => setAnioVisible((a) => a + 1)}
              aria-label="Año siguiente"
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <IconChevron dir="right" small />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const activo = m === mes && anioVisible === anio;
              const esMesActual = m === hoy.getMonth() + 1 && anioVisible === hoy.getFullYear();
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onChange(m, anioVisible); setOpen(false); }}
                  className={`rounded-lg py-1.5 text-xs font-medium transition ${
                    activo
                      ? 'bg-brand-600 text-white'
                      : esMesActual
                        ? 'font-semibold text-brand-600 dark:text-brand-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {nombreMes(m).slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function IconChevron({ dir, small }) {
  const d = dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  return (
    <svg viewBox="0 0 24 24" className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ---------- KPIs principales ---------- */

// Variación porcentual del mes visible contra el anterior. `null` cuando no
// hay con qué comparar (sin historial, o el mes anterior en cero: un aumento
// "desde cero" no es un porcentaje, es simplemente el primer mes con dato).
function delta(historial, campo) {
  const p = historial?.periodos;
  if (!p || p.length < 2) return null;
  const actual = p[0]?.actual?.[campo] || 0;
  const previo = p[1]?.actual?.[campo] || 0;
  if (!previo) return null;
  return Math.round(((actual - previo) / previo) * 100);
}

function NotaDelta({ pct }) {
  if (pct == null) return null;
  const sube = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
      sube ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    }`}>
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={sube ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
      </svg>
      {sube ? '+' : ''}{pct}%
    </span>
  );
}

function KpiPrincipales({ data, admin, fraccion, historial }) {
  const metaPrima = data.meta?.prima || 0;
  const sinMeta = !metaPrima;
  const pct = pctAvance(data.primaAnualTotal, metaPrima);
  const st = ESTADOS_RITMO[sinMeta ? 'SIN_META' : claveRitmo(pct, fraccion)];
  const vencen = data.polizasPorVencer || { count: 0, dias: 15 };
  // Solo prima y altas de clientes tienen una serie histórica equivalente en
  // /targets/historial. "Pólizas activas" y "Vencen en N días" son fotos de
  // hoy, no del periodo: compararlas contra "el mes pasado" no significaría
  // lo mismo, así que se quedan sin delta a propósito.
  const deltaPrima = delta(historial, 'prima');
  const deltaAltas = delta(historial, 'prospectos');

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <div className="kpi kpi-green">
        <p className="kpi-label">Prima vendida</p>
        <p className="kpi-val">{mxn(data.primaAnualTotal)}</p>
        <p className={`kpi-note ${sinMeta ? '' : st.text}`}>
          {sinMeta ? (admin ? 'sin meta de promotoría' : 'sin meta asignada') : `${pct}% de ${admin ? 'la meta de equipo' : 'tu meta'}`}
        </p>
        {deltaPrima != null && (
          <p className="kpi-note flex items-center gap-1">
            <NotaDelta pct={deltaPrima} /> vs. mes anterior
          </p>
        )}
      </div>
      <div className="kpi">
        <p className="kpi-label">Pólizas activas</p>
        <p className="kpi-val">{num(data.polizasActivas)}</p>
        <p className="kpi-note">vigentes hoy</p>
      </div>
      <div className="kpi kpi-accent">
        <p className="kpi-label">Clientes</p>
        <p className="kpi-val">{num(data.totalClientes)}</p>
        <p className="kpi-note">+{num(data.clientesMes)} este mes</p>
        {deltaAltas != null && (
          <p className="kpi-note flex items-center gap-1">
            <NotaDelta pct={deltaAltas} /> vs. mes anterior
          </p>
        )}
      </div>
      <div className={`kpi ${vencen.count > 0 ? 'kpi-amber' : ''}`}>
        <p className="kpi-label">Vencen en {vencen.dias} días</p>
        <p className="kpi-val">{num(vencen.count)}</p>
        <p className="kpi-note">próxima vigencia</p>
      </div>
    </div>
  );
}

/* ---------- Requiere tu atención (= bandeja de notificaciones) ---------- */

function Atencion({ atencion, admin }) {
  const navigate = useNavigate();
  const { data: notifData } = useListaNotificaciones({ estado: 'no-leidas' });
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();
  const notificaciones = notifData?.notificaciones || [];

  const abrirNotificacion = (n) => {
    marcarLeida.mutate({ id: n.id, leida: true });
    const url = n.datos?.url;
    if (!url) return;
    try {
      navigate(url.startsWith('http') ? new URL(url).pathname : url);
    } catch {
      /* url inválida: no navegar, ya quedó marcada como leída */
    }
  };

  // Notificaciones reales primero (más recientes = más arriba, ya vienen
  // ordenadas por el servidor), luego los pendientes derivados que ya
  // calculaba este bloque. Mismo estilo de fila para los dos orígenes.
  const notifItems = notificaciones.map((n) => {
    const info = infoTipoNotificacion(n.tipo);
    return {
      key: `notif:${n.id}`,
      color: info.dot,
      t: n.titulo,
      s: n.cuerpo,
      onClick: () => abrirNotificacion(n),
    };
  });

  const pendientesItems = [
    atencion.pendientesPago.count > 0 && {
      key: 'pendientes-pago',
      color: 'bg-amber-500',
      to: admin ? '/equipo' : '/ventas',
      t: `${num(atencion.pendientesPago.count)} ${atencion.pendientesPago.count === 1 ? 'póliza pendiente' : 'pólizas pendientes'} de pago`,
      s: `${mxn(atencion.pendientesPago.prima)} en prima sin cobrar`,
    },
    atencion.citasHoy > 0 && {
      key: 'citas-hoy',
      color: 'bg-brand-500',
      to: '/citas',
      t: `${num(atencion.citasHoy)} ${atencion.citasHoy === 1 ? 'cita' : 'citas'} hoy`,
      s: 'Revisa tu agenda del día',
    },
    atencion.seguimiento > 0 && {
      key: 'seguimiento',
      color: 'bg-amber-500',
      to: '/clientes',
      t: `${num(atencion.seguimiento)} ${atencion.seguimiento === 1 ? 'cliente necesita' : 'clientes necesitan'} seguimiento`,
      s: 'Marcados en el pipeline de clientes',
    },
    atencion.bonosPorGanar.monto > 0 && {
      key: 'bonos',
      color: 'bg-emerald-500',
      t: `${mxn(atencion.bonosPorGanar.monto)} en bonos por ganar`,
      s: 'Se liberan al cerrar las ventas del mes',
    },
  ].filter(Boolean);

  const items = [...notifItems, ...pendientesItems];

  return (
    <section className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Requiere tu atención</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Notificaciones y pendientes de esta semana</p>
        </div>
        {notifItems.length > 0 && (
          <button
            type="button"
            onClick={() => marcarTodas.mutate()}
            disabled={marcarTodas.isPending}
            className="text-xs font-semibold text-brand-600 transition hover:underline dark:text-brand-400"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>
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
                  <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{it.s}</p>
                </div>
                {(it.to || it.onClick) && <Chevron />}
              </div>
            );
            if (it.to) return <Link key={it.key} to={it.to} className="block cursor-pointer">{fila}</Link>;
            if (it.onClick) return <button key={it.key} type="button" onClick={it.onClick} className="block w-full cursor-pointer text-left">{fila}</button>;
            return <div key={it.key}>{fila}</div>;
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

function ProcesoVentas({ proceso }) {
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

