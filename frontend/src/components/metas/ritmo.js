// Estado por ritmo: el % de avance de una meta se lee contra la fracción del
// periodo transcurrida, no como porcentaje suelto. Mapa único para toda la
// sección de Metas — no duplicar umbrales ni colores en otros componentes.
//
//   ratio = (%avance / 100) / fraccionTranscurrida
//   %avance >= 100      → CUMPLIDA
//   ratio >= EN_RITMO   → EN_RITMO
//   ratio >= LIGERO     → LIGERO_ATRASO
//   si no               → ATRASADO
//
// Los umbrales son un parámetro del design system, no números mágicos.
export const UMBRALES_RITMO = { EN_RITMO: 1, LIGERO_ATRASO: 0.8 };

export const ESTADOS_RITMO = {
  CUMPLIDA: {
    label: 'Cumplida',
    text: 'text-emerald-700 dark:text-emerald-300',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  EN_RITMO: {
    label: 'En ritmo',
    text: 'text-emerald-700 dark:text-emerald-300',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  LIGERO_ATRASO: {
    label: 'Ligero atraso',
    text: 'text-amber-700 dark:text-amber-300',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  ATRASADO: {
    label: 'Atrasado',
    text: 'text-red-700 dark:text-red-300',
    pill: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    bar: 'bg-red-500',
  },
  SIN_META: {
    label: 'Sin meta',
    text: 'text-slate-500 dark:text-slate-400',
    pill: 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400',
    bar: 'bg-slate-300 dark:bg-slate-600',
  },
};

// Fracción del mes transcurrida (0..1) para el periodo consultado:
// mes pasado = 1, mes futuro = 0, mes en curso = día / días del mes.
export function fraccionTranscurrida(mes, anio, ahora = new Date()) {
  const iniMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0);
  if (ahora >= finMes) return 1;
  if (ahora < iniMes) return 0;
  return ahora.getDate() / finMes.getDate();
}

// Días transcurridos / totales del periodo, para el chip "día X de Y".
export function diasPeriodo(mes, anio, ahora = new Date()) {
  const dias = new Date(anio, mes, 0).getDate();
  const f = fraccionTranscurrida(mes, anio, ahora);
  return { dia: Math.round(f * dias), dias, fraccion: f };
}

export function claveRitmo(pct, fraccion) {
  if (pct >= 100) return 'CUMPLIDA';
  if (fraccion <= 0) return 'EN_RITMO'; // el periodo aún no inicia: nada exigible
  const ratio = (pct / 100) / fraccion;
  if (ratio >= UMBRALES_RITMO.EN_RITMO) return 'EN_RITMO';
  if (ratio >= UMBRALES_RITMO.LIGERO_ATRASO) return 'LIGERO_ATRASO';
  return 'ATRASADO';
}

export function infoRitmo(pct, fraccion) {
  return ESTADOS_RITMO[claveRitmo(pct, fraccion)];
}

// Proyección de cierre del periodo al ritmo actual: actual / fracción
// transcurrida. Null si aún no hay tiempo transcurrido.
export function proyeccion(actual, fraccion) {
  if (!fraccion || fraccion <= 0) return null;
  return Math.round(actual / fraccion);
}

export function pctAvance(actual, meta) {
  if (!meta || meta <= 0) return 0;
  return Math.round((actual / meta) * 100);
}
