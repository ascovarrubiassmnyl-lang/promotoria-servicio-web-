// Orden, filtros rápidos y paginación de la lista del CRM (2026-10-15,
// auditoría de UI: "la lista es una tabla de 61 filas sin orden"). Funciones
// puras sobre lo que ya devuelve GET /clientes — no piden datos nuevos.
// `proximaAccion` la deriva el servidor; aquí solo se clasifica.

const DIA = 24 * 60 * 60 * 1000;
export const POR_PAGINA = 25;
export const DIAS_NUEVO = 7;

const inicioDeHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// 'vencida' | 'hoy' | 'futura' | 'sin'. "Hoy" gana sobre "vencida": una cita
// de las 10:00 a las 11:00 sigue siendo de hoy, no un pendiente atrasado.
export function estadoAccion(c, ahora = new Date()) {
  const pa = c.proximaAccion;
  if (!pa) return 'sin';
  const f = new Date(pa.fecha);
  const hoy = inicioDeHoy();
  if (f >= hoy && f < new Date(hoy.getTime() + DIA)) return 'hoy';
  return f < ahora ? 'vencida' : 'futura';
}

export const esNuevo = (c) => Date.now() - new Date(c.creadoEn).getTime() < DIAS_NUEVO * DIA;

// Filtros rápidos: un clic, combinables con etapa y segmento (no entre sí).
export const FILTROS_RAPIDOS = [
  { value: 'vencidos', label: 'Vencidos', test: (c) => estadoAccion(c) === 'vencida', tono: 'red' },
  { value: 'hoy', label: 'Para hoy', test: (c) => estadoAccion(c) === 'hoy', tono: 'brand' },
  { value: 'sin-accion', label: 'Sin próxima acción', test: (c) => estadoAccion(c) === 'sin' },
  { value: 'sin-llamar', label: 'Nunca llamados', test: (c) => !c.fechaUltimaLlamada },
  { value: 'nuevos', label: `Nuevos (${DIAS_NUEVO} días)`, test: esNuevo },
];
export const infoFiltroRapido = (v) => FILTROS_RAPIDOS.find((f) => f.value === v) || null;

const RANGO_ACCION = { vencida: 0, hoy: 1, futura: 2, sin: 3 };
const nombreCompleto = (c) => `${c.nombre} ${c.apellidoP || ''} ${c.apellidoM || ''}`.trim();
const tiempo = (f) => (f ? new Date(f).getTime() : 0);

// Orden por defecto = "Próxima acción": lo vencido primero (lo más atrasado
// arriba), luego lo de hoy, lo futuro y al final quien no tiene nada
// programado (los más nuevos primero, que son los que se enfrían).
export const ORDENES = [
  {
    value: 'accion',
    label: 'Próxima acción',
    cmp: (a, b) => {
      const ra = RANGO_ACCION[estadoAccion(a)];
      const rb = RANGO_ACCION[estadoAccion(b)];
      if (ra !== rb) return ra - rb;
      if (ra === 3) return tiempo(b.creadoEn) - tiempo(a.creadoEn);
      return tiempo(a.proximaAccion.fecha) - tiempo(b.proximaAccion.fecha);
    },
  },
  { value: 'recientes', label: 'Más recientes', cmp: (a, b) => tiempo(b.creadoEn) - tiempo(a.creadoEn) },
  // Nunca llamados primero, después el contacto más viejo.
  { value: 'sin-contacto', label: 'Más tiempo sin llamar', cmp: (a, b) => tiempo(a.fechaUltimaLlamada) - tiempo(b.fechaUltimaLlamada) },
  { value: 'nombre', label: 'Nombre (A–Z)', cmp: (a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es') },
];
export const ordenPorClave = (v) => ORDENES.find((o) => o.value === v) || ORDENES[0];

// "Hoy", "Ayer", "Hace 5 días", "Hace 3 meses" o "Nunca".
export function haceCuanto(fecha) {
  if (!fecha) return 'Nunca';
  const dias = Math.floor((inicioDeHoy() - new Date(new Date(fecha).setHours(0, 0, 0, 0))) / DIA);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 45) return `Hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses < 12 ? `Hace ${meses} meses` : `Hace ${Math.round(meses / 12)} año${meses >= 18 ? 's' : ''}`;
}
