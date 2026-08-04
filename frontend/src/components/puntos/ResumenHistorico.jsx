import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Card, EmptyState } from '../ui.jsx';
import { isoDia, rangoSemana, labelSemana } from '../../lib/semana.js';
import { nombreMes } from '../../lib/format.js';

// Resumen histórico del sistema de 25 puntos: tendencia semana a semana
// (barras SVG nativas, sin librería nueva como el resto del dashboard), KPIs
// agregados del rango y una lista de semanas clickeables que dispara el
// drill-down (el padre recibe `onSeleccionaSemana` con el offset relativo).
//
// El rango por defecto son las últimas 12 semanas; el usuario puede ampliar
// con el selector de meses atrás y acotar con un rango personalizado
// (DatePicker). Cuando viene `asesorId` se lo pasa al backend (el backend
// fuerza self-scope para ASESOR).

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const CONCEPTOS_LABEL = {
  referidosObtenidos: 'Ref. obtenidos',
  llamadasRealizadas: 'Llamadas',
  citasObtenidas: 'Citas obtenidas',
  cuestionariosRealizados: 'Cuestionarios',
  cierresRealizados: 'Cierres',
  solicitudes: 'Solicitudes',
};

// Semana del lunes que cae `offset` semanas relativas a hoy. Usamos la misma
// convención del resto de la app (lunes-domingo).
const lunesDeHoy = () => {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const d = (h.getDay() + 6) % 7;
  const l = new Date(h); l.setDate(h.getDate() - d); return l;
};

export default function ResumenHistorico({ asesorId, metaDiaria, onSeleccionaSemana }) {
  const [atras, setAtras] = useState(12); // número de semanas hacia atrás
  const [err, setErr] = useState('');

  const inicioRango = useMemo(() => {
    const l = lunesDeHoy();
    l.setDate(l.getDate() - (atras - 1) * 7);
    return isoDia(l);
  }, [atras]);
  const finRango = useMemo(() => isoDia(lunesDeHoy()), []);

  const { data, isLoading } = useQuery({
    queryKey: ['puntos-historico', inicioRango, finRango, asesorId || 'yo'],
    queryFn: async () => (await api.get('/puntos/historico', {
      params: { inicio: inicioRango, fin: finRango, asesorId: asesorId || undefined },
    })).data,
    onError: (e) => setErr(handleError(e)),
  });

  const semanas = data?.semanas || [];
  const resumen = data?.resumen || {};
  const maxPuntos = Math.max(metaDiaria * 5, 1, ...semanas.map((s) => s.puntos));
  const hoyIso = isoDia(new Date());

  const barraAltura = (p) => Math.max(2, Math.round((p / maxPuntos) * 90)); // px

  const semanaActualOffset = (semanaIso) => {
    // Calcula el offset relativo a hoy dado el lunes de una semana ISO.
    const l = new Date(`${semanaIso}T00:00:00.000Z`);
    const hoy = lunesDeHoy();
    const diff = Math.round((hoy.getTime() - l.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return -diff;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Rango:</span>
          {[4, 8, 12, 26, 52].map((n) => (
            <button
              key={n}
              onClick={() => setAtras(n)}
              className={`btn-secondary px-2.5 py-1 text-xs ${atras === n ? '!bg-slate-100 dark:!bg-slate-700' : ''}`}
            >
              {n >= 52 ? '1 año' : n >= 26 ? '6 meses' : `${n} sem`}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {labelRangoLargo(inicioRango, finRango)} · {semanas.length} semanas
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`kpi ${(resumen.promedioSemanal || 0) >= metaDiaria * 5 ? 'kpi-green' : 'kpi-accent'}`}>
          <p className="kpi-label">Puntos totales</p>
          <p className="kpi-val">{resumen.puntosTotales || 0}</p>
          <p className="kpi-note">{resumen.totalSemanas || 0} semanas evaluadas</p>
        </div>
        <div className={`kpi ${(resumen.promedioSemanal || 0) >= metaDiaria * 5 ? 'kpi-green' : 'kpi-amber'}`}>
          <p className="kpi-label">Promedio por semana</p>
          <p className="kpi-val">{resumen.promedioSemanal || 0}</p>
          <p className="kpi-note">Meta semanal: {metaDiaria * 5} pts</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Mejor semana</p>
          <p className="kpi-val">{resumen.mejorSemana?.puntos || 0}</p>
          <p className="kpi-note">
            {resumen.mejorSemana ? labelSemanaCorta(resumen.mejorSemana.semanaInicio) : 'Sin registros aún'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Días activos acumulados</p>
          <p className="kpi-val">{resumen.diasActivos || 0}</p>
          <p className="kpi-note">Sobre {semanas.length * 7} días posibles</p>
        </div>
      </div>

      <Card
        title="Tendencia por semana"
        subtitle="Cada barra es una semana. Las aprobadas (≥ meta semanal) se ven en verde. Haz clic en una para abrir esa semana."
      >
        {isLoading ? (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : !semanas.length ? (
          <EmptyState message="Aún no hay datos en este rango." />
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-1.5 min-w-max h-32 px-1">
              {semanas.map((s) => {
                const altura = barraAltura(s.puntos);
                const alcanzada = s.puntos >= metaDiaria * 5;
                const esActual = s.semanaInicio === isoDia(lunesDeHoy());
                const o = semanaActualOffset(s.semanaInicio);
                return (
                  <button
                    key={s.semanaInicio}
                    onClick={() => onSeleccionaSemana(o)}
                    title={`${labelSemanaCorta(s.semanaInicio)} · ${s.puntos} pts`}
                    className="group flex flex-col items-center justify-end h-full w-9 sm:w-11"
                  >
                    <span className={`text-[10px] font-semibold tabular-nums mb-0.5 ${alcanzada ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {s.puntos}
                    </span>
                    <div
                      className={`w-full rounded-t transition-all ${esActual ? 'ring-2 ring-brand-400 dark:ring-brand-500' : 'group-hover:opacity-80'} ${
                        alcanzada
                          ? 'bg-emerald-500/80 dark:bg-emerald-500/70'
                          : s.puntos > 0
                            ? 'bg-brand-400/70 dark:bg-brand-500/60'
                            : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                      style={{ height: `${altura}px` }}
                    />
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">
                      {labelCortoMes(s.semanaInicio)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
      </Card>

      <Card
        title="Totales por concepto"
        subtitle="Acumulado de todo el rango seleccionado."
      >
        {isLoading ? (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {Object.entries(CONCEPTOS_LABEL).map(([campo, label]) => {
              const valor = resumen.totalPorConcepto?.[campo] || 0;
              return (
                <div key={campo} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2.5">
                  <p className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">{label}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-700 dark:text-slate-200">{valor}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Semanas" subtitle="Lista para drill-down. Clic en una semana para ver/capturar sus datos.">
        {isLoading ? (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : !semanas.length ? (
          <EmptyState message="Sin semanas en el rango." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 dark:text-slate-500 text-left">
                  <th className="py-1.5 pr-2">Semana</th>
                  <th className="py-1.5 px-2 text-right">Puntos</th>
                  <th className="py-1.5 px-2 text-right">Días activos</th>
                  <th className="py-1.5 pl-2 text-right">Solicitudes</th>
                </tr>
              </thead>
              <tbody>
                {[...semanas].reverse().map((s) => {
                  const o = semanaActualOffset(s.semanaInicio);
                  const esActual = s.semanaInicio === isoDia(lunesDeHoy());
                  const alcanzada = s.puntos >= metaDiaria * 5;
                  return (
                    <tr
                      key={s.semanaInicio}
                      className="border-t border-slate-50 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                      onClick={() => onSeleccionaSemana(o)}
                      title="Abrir esa semana"
                    >
                      <td className="py-2 pr-2 font-medium text-slate-700 dark:text-slate-200">
                        {labelSemanaLarga(s.semanaInicio)}
                        {esActual && <span className="ml-2 text-[10px] font-semibold text-brand-700 dark:text-brand-300">(actual)</span>}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold tabular-nums ${alcanzada ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {s.puntos}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{s.dias}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{s.porConcepto?.solicitudes || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Etiquetas de semana en formato corto y largo a partir del lunes ISO YYYY-MM-DD.
const pad = (n) => String(n).padStart(2, '0');
const desdeIso = (iso) => { const d = new Date(`${iso}T00:00:00.000Z`); return d; };

function labelSemanaCorta(iso) {
  const l = desdeIso(iso);
  const d = new Date(l); d.setUTCDate(d.getUTCDate() + 6);
  return `${l.getUTCDate()}-${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]}`;
}

function labelSemanaLarga(iso) {
  const l = desdeIso(iso);
  const d = new Date(l); d.setUTCDate(d.getUTCDate() + 6);
  const same = l.getUTCMonth() === d.getUTCMonth();
  return same
    ? `${l.getUTCDate()}–${d.getUTCDate()} ${nombreMes(l.getUTCMonth() + 1)} ${l.getUTCFullYear()}`
    : `${l.getUTCDate()} ${MES_CORTO[l.getUTCMonth()]} – ${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function labelCortoMes(iso) {
  const l = desdeIso(iso);
  return `${MES_CORTO[l.getUTCMonth()]} ${pad(l.getUTCDate())}`;
}

function labelRangoLargo(inicioIso, finIso) {
  const i = desdeIso(inicioIso);
  const f = desdeIso(finIso);
  const same = i.getUTCMonth() === f.getUTCMonth() && i.getUTCFullYear() === f.getUTCFullYear();
  const m = (d) => `${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return same ? `${i.getUTCDate()}–${f.getUTCDate()} ${MES_CORTO[f.getUTCMonth()]} ${f.getUTCFullYear()}` : `${m(i)} – ${m(f)}`;
}
