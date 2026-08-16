// Mapas ÚNICOS del módulo de Pólizas: moneda, método de pago y semáforo del
// historial de cobros. Espejo de los enums del backend (schema.prisma).
// No duplicar labels ni colores de estos conceptos en otros componentes.

// --- Moneda -----------------------------------------------------------------
// `Venta.primaAnual` SIEMPRE está en MXN (es la que suman métricas, comisiones,
// metas y ranking). Estas monedas describen la denominación del contrato, y
// `primaMoneda` + `tipoCambio` guardan el monto original.
export const MONEDAS = [
  { value: 'MXN', label: 'Pesos (MXN)', simbolo: '$', sufijo: 'MXN' },
  { value: 'USD', label: 'Dólares (USD)', simbolo: 'US$', sufijo: 'USD' },
  { value: 'UDI', label: 'UDIS', simbolo: '', sufijo: 'UDIS' },
];

const MONEDA_POR_VALOR = Object.fromEntries(MONEDAS.map((m) => [m.value, m]));

export const infoMoneda = (v) => MONEDA_POR_VALOR[v] || MONEDA_POR_VALOR.MXN;

export const requiereTipoCambio = (v) => v === 'USD' || v === 'UDI';

// Monto en la moneda original, con su sufijo. Para MXN se usa `mxn()` normal.
export function montoMoneda(valor, moneda) {
  if (valor == null || valor === '') return '—';
  const info = infoMoneda(moneda);
  const n = Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${info.simbolo}${n} ${info.sufijo}`.trim();
}

// --- Equivalente en pesos ---------------------------------------------------
// Convierte un monto capturado en `moneda` a MXN usando la tabla de tipos de
// cambio de Banxico que devuelve GET /ventas/tipo-cambio (shape:
// { MXN:{valor}, USD:{valor,fecha}|null, UDI:{...}|null }).
//
// Devuelve null cuando NO se puede afirmar el equivalente — sin monto, sin
// tabla, o sin tipo de cambio para esa moneda. Es deliberado: es preferible no
// mostrar nada a mostrar una cifra en pesos que no corresponde a la realidad.
// El llamador decide qué poner en su lugar (normalmente, nada).
export function equivalenteMXN(valor, moneda, tipos) {
  const n = +valor;
  if (!Number.isFinite(n) || n === 0) return null;
  if (moneda === 'MXN' || !moneda) return null; // ya está en pesos: no hay equivalente que mostrar
  const tc = tipos?.[moneda]?.valor;
  if (!tc || tc <= 0) return null;
  return n * tc;
}

// Tipo de cambio vigente de una moneda según la tabla, o null.
export const tcDe = (moneda, tipos) => (moneda && moneda !== 'MXN' ? (tipos?.[moneda]?.valor ?? null) : null);

// --- Método de pago ---------------------------------------------------------
export const METODOS_PAGO = [
  { value: 'TARJETA_CREDITO', label: 'Tarjeta de crédito' },
  { value: 'TARJETA_CREDITO_MSI', label: 'Tarjeta de crédito (MSI)' },
  { value: 'TARJETA_DEBITO', label: 'Tarjeta de débito' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'CARGO_NOMINA', label: 'Cargo a nómina' },
];

const METODO_POR_VALOR = Object.fromEntries(METODOS_PAGO.map((m) => [m.value, m]));

export const labelMetodoPago = (v) => METODO_POR_VALOR[v]?.label || null;

// --- Semáforo del historial de pagos ---------------------------------------
// Verde = al corriente, ámbar = tiene un cobro vencido sin registrar,
// rojo = póliza cancelada/rechazada. Es una lectura DERIVADA de la póliza y sus
// pagos: no hay campo "semáforo" en la base.
export const SEMAFOROS_PAGO = {
  PAGADO: {
    label: 'Al corriente',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  },
  PENDIENTE: {
    label: 'Pago vencido',
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  },
  CANCELADO: {
    label: 'Cancelada',
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30',
  },
  SIN_COBROS: {
    label: 'Sin cobros',
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-600',
  },
};

// Estado del semáforo de una póliza. `ahora` es inyectable para test.
export function semaforoPago(venta, ahora = new Date()) {
  if (!venta) return 'SIN_COBROS';
  if (venta.estado === 'CANCELADA' || venta.estado === 'RECHAZADA') return 'CANCELADO';
  // Domiciliada: el cargo es automático, no hay cobro que perseguir.
  if (venta.domiciliada) return 'PAGADO';
  if (venta.fechaProximoPago && new Date(venta.fechaProximoPago) < ahora) return 'PENDIENTE';
  if (venta.pagos?.length || venta.estado === 'PAGADA') return 'PAGADO';
  return 'SIN_COBROS';
}

export const infoSemaforo = (clave) => SEMAFOROS_PAGO[clave] || SEMAFOROS_PAGO.SIN_COBROS;
