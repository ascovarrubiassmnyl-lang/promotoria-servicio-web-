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
