// Catálogo único de las métricas de meta (promotoría e individuales).
// key   → clave en los objetos `actual`/`sumaIndividual` del backend,
// campo → columna de Target/TargetEquipo,
// label → título del bloque grande; corto → encabezado de columna en la tabla.
// No duplicar esta lista en otros componentes: la UI de Metas se genera de aquí.
export const METRICAS = [
  { key: 'ventas', campo: 'metaVentasNum', label: 'Ventas (pólizas)', corto: 'Ventas', placeholder: 'Ventas', money: false },
  { key: 'prima', campo: 'metaPrimaMonto', label: 'Prima anual (MXN)', corto: 'Prima', placeholder: 'Prima MXN', money: true },
  { key: 'citas', campo: 'metaCitasNum', label: 'Citas realizadas', corto: 'Citas', placeholder: 'Citas', money: false },
  { key: 'prospectos', campo: 'metaProspectosNum', label: 'Prospectos nuevos', corto: 'Prospectos', placeholder: 'Prospectos', money: false },
  { key: 'referidos', campo: 'metaReferidosNum', label: 'Referidos obtenidos', corto: 'Referidos', placeholder: 'Referidos', money: false },
  { key: 'llamadas', campo: 'metaLlamadasNum', label: 'Llamadas', corto: 'Llamadas', placeholder: 'Llamadas', money: false },
];

// true si la meta no fija ninguna de las 6 métricas
export const sinMetas = (t) => !t || METRICAS.every((m) => !t[m.campo]);

// Cumplimiento de un periodo CERRADO o en curso: por métrica con meta fijada,
// si el avance real alcanzó el objetivo. Una sola implementación para toda la
// sección (historial y cualquier vista futura) — no re-derivar "cumplida" a
// mano en un componente.
//
// El periodo NO tiene un estado guardado: la meta vive por (mes, año) y esto
// se lee de la meta + el avance real que devuelve el servidor.
export function cumplimiento(meta, actual, { enCurso = false } = {}) {
  const conMeta = METRICAS.filter((m) => meta?.[m.campo]).map((m) => ({
    ...m,
    objetivo: meta[m.campo],
    logrado: actual?.[m.key] ?? 0,
    cumplida: (actual?.[m.key] ?? 0) >= meta[m.campo],
  }));
  const cumplidas = conMeta.filter((m) => m.cumplida).length;
  const clave = conMeta.length === 0 ? 'SIN_META'
    : enCurso ? 'EN_CURSO'
    : cumplidas === conMeta.length ? 'CUMPLIDA'
    : cumplidas > 0 ? 'PARCIAL'
    : 'NO_CUMPLIDA';
  return { metricas: conMeta, total: conMeta.length, cumplidas, clave };
}

// Presentación del cumplimiento de un periodo (mismos colores semánticos que
// el resto del sistema: emerald = logrado, amber = parcial/en curso, red = no).
export const ESTADOS_CUMPLIMIENTO = {
  CUMPLIDA: { label: 'Cumplida', pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  PARCIAL: { label: 'Parcial', pill: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  NO_CUMPLIDA: { label: 'No cumplida', pill: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  EN_CURSO: { label: 'En curso', pill: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' },
  SIN_META: { label: 'Sin meta', pill: 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400' },
};
