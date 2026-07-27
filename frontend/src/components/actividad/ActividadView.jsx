import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import ActivityTimeline from './ActivityTimeline.jsx';
import { ORDEN_TIPOS, infoTipo } from './tipos.jsx';
import { nombreMes } from '../../lib/format.js';

// Semana lunes–domingo con offset relativo a la semana actual (0 = esta semana).
function rangoSemana(offset) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = (hoy.getDay() + 6) % 7; // 0 = lunes
  const inicio = new Date(hoy); inicio.setDate(hoy.getDate() - dia + offset * 7);
  const fin = new Date(inicio); fin.setDate(inicio.getDate() + 6); fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function labelSemana({ inicio, fin }) {
  const rango = inicio.getMonth() === fin.getMonth()
    ? `${inicio.getDate()}–${fin.getDate()} ${MES_CORTO[fin.getMonth()]}`
    : `${inicio.getDate()} ${MES_CORTO[inicio.getMonth()]} – ${fin.getDate()} ${MES_CORTO[fin.getMonth()]}`;
  return `${nombreMes(fin.getMonth() + 1)} ${fin.getFullYear()} · ${rango}`;
}

// Vista de actividad compartida por ambos roles (misma regla que PolizasView):
//  - asesorId=null → para un asesor, su propia actividad; para un promotor, la
//    de todo el equipo. asesorId=X → actividad del asesor X (solo promotor).
// La autorización real vive en el backend: GET /api/actividad fuerza
// asesorId = req.user.id para el rol ASESOR aunque manipule el parámetro.
// Filtro por tipo: los chips SON el filtro (toggle, con conteo); la navegación
// temporal es por semana, la misma unidad que el rango consultado.
export default function ActividadView({
  asesorId = null,
  titulo = 'Actividad',
  scopeLabel = 'Tu actividad',
  banner = null,
  filtrosExtra = null,
  mostrarAsesor = false,
  onLimpiar,
}) {
  const [offset, setOffset] = useState(0);
  const [tipoActivo, setTipoActivo] = useState(null);
  const semana = useMemo(() => rangoSemana(offset), [offset]);

  const { data, isLoading } = useQuery({
    queryKey: ['actividad', asesorId || 'todos', semana.inicio.toISOString()],
    queryFn: async () => (await api.get('/actividad', {
      params: {
        asesorId: asesorId || undefined,
        desde: semana.inicio.toISOString(),
        hasta: semana.fin.toISOString(),
        limit: 500,
      },
    })).data,
  });

  const conteos = useMemo(() => {
    const m = {};
    for (const e of data || []) m[e.tipo] = (m[e.tipo] || 0) + 1;
    return m;
  }, [data]);

  // Chips en orden canónico + cualquier tipo desconocido presente en los datos
  // (fallback visual neutro) + el tipo activo aunque su conteo sea 0.
  const tiposChips = useMemo(() => {
    const presentes = Object.keys(conteos);
    const orden = [...ORDEN_TIPOS.filter((t) => conteos[t]), ...presentes.filter((t) => !ORDEN_TIPOS.includes(t)).sort()];
    if (tipoActivo && !orden.includes(tipoActivo)) orden.push(tipoActivo);
    return orden;
  }, [conteos, tipoActivo]);

  const eventos = useMemo(
    () => (tipoActivo ? (data || []).filter((e) => e.tipo === tipoActivo) : (data || [])),
    [data, tipoActivo],
  );

  const limpiar = () => { setTipoActivo(null); setOffset(0); onLimpiar?.(); };

  const chipBase = 'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition bg-white dark:bg-slate-800';
  const chipOff = 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{titulo}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {eventos.length} evento{eventos.length === 1 ? '' : 's'} · {scopeLabel}
          </p>
        </div>
        {filtrosExtra}
      </div>

      {banner}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setOffset((o) => o - 1)} className="btn-secondary px-3">← Semana anterior</button>
          <button onClick={() => setOffset(0)} className={`btn-secondary px-3 ${offset === 0 ? '!bg-slate-100 dark:!bg-slate-700' : ''}`}>Esta semana</button>
          <button onClick={() => setOffset((o) => o + 1)} className="btn-secondary px-3">Semana siguiente →</button>
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{labelSemana(semana)}</p>
        <button onClick={limpiar} className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline">Limpiar filtros</button>
      </div>

      {/* Los chips de tipo SON el filtro: toggle con conteo, sin dropdown redundante */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTipoActivo(null)}
          className={`${chipBase} ${tipoActivo === null ? 'border-transparent ring-[1.5px] ring-inset ring-brand-500 dark:ring-brand-400 text-slate-800 dark:text-slate-100' : chipOff}`}
        >
          Todos
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tipoActivo === null ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
            {data?.length ?? 0}
          </span>
        </button>
        {tiposChips.map((tipo) => {
          const t = infoTipo(tipo);
          const on = tipoActivo === tipo;
          return (
            <button
              key={tipo}
              onClick={() => setTipoActivo(on ? null : tipo)}
              className={`${chipBase} ${on ? `border-transparent ring-[1.5px] ring-inset ${t.chipOn} text-slate-800 dark:text-slate-100` : chipOff}`}
            >
              <span className={`h-2 w-2 rounded-full ${t.dot}`} />
              {t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${on ? t.badgeOn : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {conteos[tipo] || 0}
              </span>
            </button>
          );
        })}
      </div>

      <ActivityTimeline
        eventos={eventos}
        loading={isLoading}
        mostrarAsesor={mostrarAsesor}
        mensajeVacio={tipoActivo ? 'No hay eventos de este tipo en el rango seleccionado.' : 'Sin actividad en esta semana.'}
      />
    </div>
  );
}
