import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { mxn, num, nombreMes } from '../lib/format.js';
import { diasPeriodo, claveRitmo, ESTADOS_RITMO, pctAvance } from '../components/metas/ritmo.js';
import { RankingAsesores } from '../components/dashboard/Leaderboard.jsx';
import MiDia from '../components/inicio/MiDia.jsx';
import { medir } from '../lib/medir.js';

// Inicio (rediseño 2026-11-20, auditoría de Inicio del 20-nov). Responde tres
// preguntas, en este orden y en 1.5–2 pantallas de laptop:
//   1. ¿Qué tengo hoy?          → franja "Hoy" (citas, invitaciones, 25 puntos)
//   2. ¿A quién contacto ahora? → bandeja "Contactar ahora" (una sola lista,
//                                 ordenada por urgencia, de GET /hoy)
//   3. ¿Cómo voy?               → "Tus números": 4 KPIs, cada uno enlaza a su
//                                 detalle
// Lo que salió de Inicio se MOVIÓ, no se borró:
//  - Tendencia de ventas, Prima por ramo y Proceso de ventas → Mi meta
//    (/targets, sección "Análisis del mes").
//  - "Requiere tu atención": los seguimientos y recordatorios están en la
//    bandeja; las invitaciones en la franja Hoy; el resto de avisos en
//    Notificaciones (campana); pólizas pendientes de pago en Pólizas.
//  - "Pólizas activas" y "Clientes" (KPIs) → Pólizas y CRM.
// Reglas: un bloque sin datos no se renderiza o queda en una línea; nada de
// scroll horizontal entre 360 y 1,440 px; las acciones nunca se cortan (en
// celular pasan a ícono).
// Alcance por rol garantizado en servidor: el asesor recibe solo sus números
// y su meta; ranking y meta de promotoría solo llegan a promotores. La ruta `/`
// no exige la sección `dashboard`: el día es de todos (GET /hoy); los números
// solo se piden y se pintan si `puede('dashboard')`.
export default function Dashboard() {
  const { user, esAdmin, puede } = useAuth();
  const admin = esAdmin();
  const verNumeros = puede('dashboard');
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  const { data } = useQuery({
    queryKey: ['dashboard', mes, anio],
    queryFn: async () => (await api.get('/metricas/dashboard', { params: { mes, anio } })).data,
    enabled: verNumeros,
    placeholderData: (previo) => previo,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Encabezado user={user} admin={admin} />
      <MiDia />
      {verNumeros && (
        <Numeros
          data={data}
          user={user}
          admin={admin}
          mes={mes}
          anio={anio}
          onCambiarPeriodo={(m, a) => { medir('numeros', 'cambiar_periodo'); setMes(m); setAnio(a); }}
        />
      )}
    </div>
  );
}

/* ---------- Tus números: 4 KPIs y ranking del periodo ---------- */

function Numeros({ data, user, admin, mes, anio, onCambiarPeriodo }) {
  const { fraccion } = diasPeriodo(mes, anio);
  // "Cierres" sale del mismo proceso de ventas (nivel CIERRES): una sola
  // definición, aunque la tarjeta del proceso viva ahora en Mi meta.
  const { data: proceso } = useQuery({
    queryKey: ['proceso-ventas', mes, anio],
    queryFn: async () => (await api.get('/metricas/proceso-ventas', { params: { mes, anio } })).data,
  });

  return (
    <section className="space-y-3" data-bloque="numeros">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {admin ? 'Números de la promotoría' : 'Tus números'}
        </h2>
        <PeriodoSelector mes={mes} anio={anio} onChange={onCambiarPeriodo} />
      </div>

      {!data ? (
        <div className="card p-6 text-center text-sm text-slate-400 dark:text-slate-500">Cargando números…</div>
      ) : (
        <>
          <KpiPrincipales data={data} proceso={proceso} admin={admin} fraccion={fraccion} />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tendencia, prima por ramo y proceso de ventas: <Link to="/targets" onClick={() => medir('numeros', 'ir_analisis')} className="font-semibold text-brand-600 hover:underline dark:text-brand-400">{admin ? 'Metas' : 'Mi meta'}</Link>
          </p>

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
        </>
      )}
    </section>
  );
}

/* ---------- Encabezado compacto: saludo + fecha en una línea ---------- */

function saludo(hora) {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function Encabezado({ user, admin }) {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {saludo(ahora.getHours())}, {user?.nombre}
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {fecha.charAt(0).toUpperCase() + fecha.slice(1)} · {admin ? 'Promotoría' : 'Asesor'}
      </p>
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
      <div className="flex items-center rounded-full bg-white shadow-card dark:bg-slate-800 dark:shadow-none">
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Periodo anterior"
          className="rounded-l-full p-2 pl-3 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 active:scale-90 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
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
          className="rounded-r-full p-2 pr-3 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 active:scale-90 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
        >
          <IconChevron dir="right" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-flotante dark:border-white/[0.1] dark:bg-slate-800">
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

// Variación porcentual contra el mes anterior. El servidor ya acota el mes
// anterior a los mismos días cuando el visible va en curso (comparativo de
// /metricas/dashboard). `null` cuando el anterior está en cero: un aumento
// "desde cero" no es un porcentaje, es el primer mes con dato.
function delta(actual, previo) {
  if (!previo) return null;
  return Math.round(((actual - previo) / previo) * 100);
}

// "vs. 1–20 oct" (mes en curso, mismos días) o "vs. octubre" (mes cerrado).
function etiquetaComparativo(c) {
  if (!c) return '';
  const mes = nombreMes(c.mes).toLowerCase();
  return c.hastaDia ? `vs. 1–${c.hastaDia} ${mes.slice(0, 3)}` : `vs. ${mes}`;
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

function Kpi({ to, clase = '', label, valor, clave, children }) {
  return (
    <Link to={to} onClick={() => medir('numeros', `kpi_${clave}`)} className={`kpi ${clase} block transition hover:shadow-flotante active:scale-[0.99]`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-val">{valor}</p>
      {children}
    </Link>
  );
}

// Los 4 números del mes que pidió la auditoría: prima vs. meta, citas,
// cierres y vencimientos. Cada uno enlaza a su detalle.
function KpiPrincipales({ data, proceso, admin, fraccion }) {
  const metaPrima = data.meta?.prima || 0;
  const sinMeta = !metaPrima;
  const pct = pctAvance(data.primaAnualTotal, metaPrima);
  const st = ESTADOS_RITMO[sinMeta ? 'SIN_META' : claveRitmo(pct, fraccion)];
  const vencen = data.polizasPorVencer || { count: 0, dias: 15 };
  const comp = data.comparativo;
  const deltaPrima = comp ? delta(data.primaAnualTotal, comp.prima) : null;
  const nivel = (clave) => proceso?.niveles?.find((n) => n.clave === clave)?.count;
  const cierres = nivel('CIERRES');
  const emitidas = nivel('EMITIDAS');
  const polizas = admin ? '/equipo' : '/ventas';

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi to="/targets" clave={sinMeta ? 'prima_sin_meta' : 'prima'} clase="kpi-green" label="Prima del mes" valor={mxn(data.primaAnualTotal)}>
        {sinMeta ? (
          // La meta es por mes: la gráfica de Mi meta puede mostrar metas de
          // otros meses y este seguir sin una. Sin meta, un CTA en vez de
          // texto gris (la tarjeta entera ya lleva a Metas).
          <p className="kpi-note">
            {admin
              ? <span className="font-semibold text-brand-600 dark:text-brand-400">Asignar meta de {nombreMes(data.mes).toLowerCase()}</span>
              : <>Sin meta en {nombreMes(data.mes).toLowerCase()} · pídela a tu promotora</>}
          </p>
        ) : (
          <p className={`kpi-note ${st.text}`}>{pct}% de {admin ? 'la meta de equipo' : 'tu meta'}</p>
        )}
        {deltaPrima != null && (
          <p className="kpi-note flex items-center gap-1"><NotaDelta pct={deltaPrima} /> {etiquetaComparativo(comp)}</p>
        )}
      </Kpi>
      <Kpi to="/citas" clave="citas" label="Citas del mes" valor={num(data.citasPeriodo)}>
        <p className="kpi-note">{num(data.citasCompletadasMes)} realizadas</p>
      </Kpi>
      <Kpi to={polizas} clave="cierres" label="Cierres" valor={cierres == null ? '—' : num(cierres)}>
        <p className="kpi-note">{emitidas == null ? 'firmadas en el mes' : `${num(emitidas)} emitidas y pagadas`}</p>
      </Kpi>
      <Kpi to={polizas} clave="vencen" clase={vencen.count > 0 ? 'kpi-amber' : ''} label={`Vencen en ${vencen.dias} días`} valor={num(vencen.count)}>
        <p className="kpi-note">pólizas por renovar</p>
      </Kpi>
    </div>
  );
}
