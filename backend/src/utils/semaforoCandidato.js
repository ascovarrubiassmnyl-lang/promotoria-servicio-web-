// Semáforo de selección de candidatos (VERDE/AMARILLO/ROJO) a partir de la
// evaluación vitales+valores. ÚNICA implementación de la regla: si la
// promotora define una distinta, se ajusta SOLO aquí (función pura, sin BD).
//
// Regla vigente (default acordado 2026-07-31, pendiente de confirmación de la
// promotora): promedio de las 12 dimensiones → ≥4.0 VERDE, 3.0–3.9 AMARILLO,
// <3.0 ROJO; además ROJO automático si cualquier vital queda en 1 (los
// vitales son eliminatorios en el formato SMNYL).

export const VITALES = [
  'caracterIntegridad',
  'agilidadMental',
  'empuje',
  'nivelEnergia',
  'motivacionDinero',
  'posibilidadPermanencia',
];

export const VALORES = [
  'imagenProfesional',
  'enfoqueSocial',
  'autoGestionable',
  'orientadoProcesos',
  'claridadMetas',
  'enfoqueActividad',
];

// true si las 6 dimensiones del grupo están contestadas (1–5; 0 = sin contestar).
export const grupoCompleto = (ev, campos) => campos.every((k) => (ev?.[k] ?? 0) >= 1);

// Calcula el semáforo desde una evaluación completa. Si falta alguna
// dimensión regresa SIN_EVALUAR (nunca se adelanta un color parcial).
export function calcularSemaforo(ev) {
  if (!grupoCompleto(ev, VITALES) || !grupoCompleto(ev, VALORES)) return 'SIN_EVALUAR';
  if (VITALES.some((k) => ev[k] <= 1)) return 'ROJO';
  const notas = [...VITALES, ...VALORES].map((k) => ev[k]);
  const promedio = notas.reduce((a, b) => a + b, 0) / notas.length;
  if (promedio >= 4) return 'VERDE';
  if (promedio >= 3) return 'AMARILLO';
  return 'ROJO';
}
