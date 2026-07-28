import { nombreMes } from './format.js';

// Semana lunes–domingo con offset relativo a la semana actual (0 = esta
// semana). Misma convención que ActividadView; compartido por las vistas
// semanales nuevas (25 puntos, clínica telefónica).
export function rangoSemana(offset) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = (hoy.getDay() + 6) % 7; // 0 = lunes
  const inicio = new Date(hoy); inicio.setDate(hoy.getDate() - dia + offset * 7);
  const fin = new Date(inicio); fin.setDate(inicio.getDate() + 6); fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function labelSemana({ inicio, fin }) {
  const rango = inicio.getMonth() === fin.getMonth()
    ? `${inicio.getDate()}–${fin.getDate()} ${MES_CORTO[fin.getMonth()]}`
    : `${inicio.getDate()} ${MES_CORTO[inicio.getMonth()]} – ${fin.getDate()} ${MES_CORTO[fin.getMonth()]}`;
  return `${nombreMes(fin.getMonth() + 1)} ${fin.getFullYear()} · ${rango}`;
}

// 'YYYY-MM-DD' de una fecha local — es la clave con la que el backend guarda
// y devuelve las columnas @db.Date de estas vistas.
export function isoDia(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Los 7 días (Date) de la semana a partir del lunes.
export const diasDeSemana = (inicio) =>
  Array.from({ length: 7 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i); return d; });

export const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
