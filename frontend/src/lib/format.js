export function mxn(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

export function num(value) {
  return new Intl.NumberFormat('es-MX').format(Number(value) || 0);
}

export function fechaCorta(value) {
  return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fechaHora(value) {
  return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function hora(value) {
  return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function nombreMes(m) {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[(m - 1) % 12];
}

// Devuelve un Date a un string válido para <input type="datetime-local">
export function isoLocalInput(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 16);
}

// Devuelve un Date a un string válido para <input type="date">
export function isoLocalDateInput(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

// Devuelve un Date a un string "YYYY-MM-DD" local (para keys de calendario)
export function toDiaLocal(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export const RAMOS = ['VIDA', 'ACUMULACION', 'PROTECCION', 'SALUD', 'RETIRO', 'GMM'];
export const RAMOS_LABEL = {
  VIDA: 'Vida',
  ACUMULACION: 'Acumulación',
  PROTECCION: 'Protección',
  SALUD: 'Salud',
  RETIRO: 'Retiro',
  GMM: 'Gastos Médicos Mayores',
};

export const FORMAS_PAGO = {
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  UNICO: 'Pago único',
};

// Etapas reales del embudo, en orden. "Necesita seguimiento" NO es una etapa:
// es la bandera Cliente.necesitaSeguimiento (independiente de la etapa). El
// mapa de presentación (color/orden) vive en components/clientes/etapas.js.
export const ESTADOS_CLIENTE = [
  'PROSPECTO',
  'CITA',
  'PROPUESTA',
  'CIERRE_FIRMA',
  'ENTREGA_POLIZA',
  'REFERIDOS',
  'POST_VENTA_SEGUIMIENTO',
];

export const ESTADOS_CLIENTE_LABEL = {
  PROSPECTO: 'Prospecto',
  CITA: 'Cita',
  PROPUESTA: 'Propuesta',
  CIERRE_FIRMA: 'Cierre y firma',
  ENTREGA_POLIZA: 'Entrega de póliza',
  REFERIDOS: 'Referidos',
  POST_VENTA_SEGUIMIENTO: 'Post venta y seguimiento',
  NECESITA_SEGUIMIENTO: 'Necesita seguimiento', // legacy: solo para mostrar datos viejos
};

export const ESTADOS_VENTA = ['PENDIENTE_PAGAR', 'FIRMADA', 'PAGADA', 'CANCELADA', 'APROBADA', 'RECHAZADA'];
export const ESTADOS_VENTA_LABEL = {
  PENDIENTE_PAGAR: 'Pendiente de pagar',
  FIRMADA: 'Firmada',
  PAGADA: 'Pagada',
  CANCELADA: 'Cancelada',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

export const FORMAS_PAGO_LIST = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO'];

// Convención de negocio (ver CLAUDE.md):
//  - "Ganado" = comisión de pólizas APROBADA/PAGADA (se pinta verde).
//  - "En pipeline" = comisión de PENDIENTE_PAGAR/FIRMADA (tono neutro).
//  - Nunca se suman ambas en una sola cifra.
export const VENTA_GANADA = ['PAGADA', 'APROBADA'];
export const VENTA_PIPELINE = ['PENDIENTE_PAGAR', 'FIRMADA'];
export const esVentaGanada = (v) => VENTA_GANADA.includes(v?.estado);
export const esVentaPipeline = (v) => VENTA_PIPELINE.includes(v?.estado);

export const PAGOS_POR_ANIO = { MENSUAL: 12, TRIMESTRAL: 4, SEMESTRAL: 2, ANUAL: 1, UNICO: 1 };

// Edad en años a partir de una fecha de nacimiento (null si no hay dato)
export function edad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  const hoy = new Date();
  let e = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) e--;
  return e >= 0 ? e : null;
}
