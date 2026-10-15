// Esquema de comisiones del asesor a lo largo de TODA la vida de la póliza
// (2026-10-15, validado por el usuario). Fuente: manuales SMNYL en la bóveda
// (02_Productos/Manuales: Orvi 99, Vida Mujer, Star Dotal, Imagina Ser).
// Información INTERNA del asesor: nunca se muestra al cliente.
//
// Vive en código (no en la base) por la misma razón que popEstandar.js: es
// dato de la compañía, no se captura, y así llega igual a producción sin
// sembrar nada. Funciones puras; las rutas solo las llaman.
//
// Reglas:
//  - El % se aplica sobre la PRIMA BÁSICA del año de póliza en curso. Los
//    recargos por pago fraccionado NO comisionan (manual Orvi), así que la base
//    de cada recibo es prima anual / pagos por año, no lo que cobró el banco.
//  - La comisión se gana al pagarse cada recibo: con pago mensual, la comisión
//    del año 1 llega en 12 partes; con anual, de golpe.
//  - `hasta: null` = mientras se sigan pagando primas (vitalicios, hasta
//    edad 60, Imagina Ser de prima nivelada).

const T = (desde, hasta, pct) => ({ desde, hasta, pct });

// Tramos estándar repetidos en varias tablas.
const ESTANDAR_44 = [T(1, 1, 44), T(2, 2, 15), T(3, 3, 10), T(4, 10, 5)];
const ESTANDAR_35_UDI = [T(1, 1, 35), T(2, 2, 15), T(3, 3, 10), T(4, 10, 5)];

// variantes: se elige la primera cuya condición se cumple. Condiciones:
//  moneda: 'USD'|'UDI'|'MXN' · saMin/saMax (suma asegurada, en su moneda) ·
//  edadMax/edadMin (edad del asegurado al contratar).
// aniosPago: años de pago de primas cuando el producto los fija.
export const ESQUEMAS_COMISION = {
  'Orvi 6 pagos': {
    aniosPago: 6,
    variantes: [{ etiqueta: 'USD', moneda: 'USD', tramos: [T(1, 1, 20), T(2, 2, 10), T(3, 3, 5), T(4, 6, 4)] }],
  },
  'Orvi 10 pagos': {
    aniosPago: 10,
    variantes: [
      { etiqueta: 'UDI', moneda: 'UDI', tramos: [T(1, 1, 35), T(2, 2, 10), T(3, 3, 10), T(4, 10, 9)] },
      { etiqueta: 'USD', moneda: 'USD', tramos: [T(1, 1, 36), T(2, 2, 11), T(3, 3, 10), T(4, 10, 8.5)] },
    ],
  },
  'Orvi 15 pagos': {
    aniosPago: 15,
    variantes: [{ etiqueta: 'USD', tramos: [T(1, 1, 35), T(2, 2, 10), T(3, 3, 10), T(4, 10, 9), T(11, 15, 2)] }],
  },
  'Orvi 20 pagos': {
    aniosPago: 20,
    variantes: [
      { etiqueta: 'UDI, suma asegurada ≥ 1,500,000', moneda: 'UDI', saMin: 1500000, tramos: [...ESTANDAR_35_UDI, T(11, 20, 2)] },
      { etiqueta: 'UDI, suma asegurada < 1,500,000', moneda: 'UDI', tramos: [...ESTANDAR_44, T(11, 20, 2)], requiereSA: true },
      { etiqueta: 'USD', moneda: 'USD', tramos: [...ESTANDAR_44, T(11, 20, 2)] },
    ],
  },
  'Orvi Edad 60': {
    aniosPago: null, // hasta que el asegurado cumpla 60
    hastaEdad: 60,
    variantes: [
      { etiqueta: 'Edad al contratar ≤ 41', edadMax: 41, tramos: [T(1, 1, 44), T(2, 2, 10), T(3, 3, 10), T(4, 10, 9), T(11, null, 2)] },
      { etiqueta: 'Edad al contratar > 41', tramos: [T(1, 1, 35), T(2, 2, 10), T(3, 3, 10), T(4, 10, 9), T(11, null, 2)], porDefectoSinEdad: true },
    ],
  },
  'Orvi Todos los pagos': {
    aniosPago: null, // vitalicio
    variantes: [
      { etiqueta: 'UDI, suma asegurada ≥ 1,500,000', moneda: 'UDI', saMin: 1500000, tramos: [...ESTANDAR_35_UDI, T(11, null, 2)] },
      { etiqueta: 'UDI, suma asegurada < 1,500,000', moneda: 'UDI', tramos: [...ESTANDAR_44, T(11, null, 2)], requiereSA: true },
      { etiqueta: 'USD', moneda: 'USD', tramos: [...ESTANDAR_44, T(11, null, 2)] },
    ],
  },
  'Vida Mujer': {
    aniosPago: 20,
    variantes: [{ etiqueta: 'MXN', tramos: [T(1, 1, 40), T(2, 2, 15), T(3, 3, 10), T(4, 10, 5), T(11, 20, 2)] }],
  },
  // Star Dotal: tabla del manual (PDF). En el plazo de 5 años el año 3 viene
  // vacío en la tabla validada por el usuario — se respeta como 0%.
  'Star Dotal 5 años': {
    aniosPago: 5,
    variantes: [{ etiqueta: 'USD', tramos: [T(1, 1, 11), T(2, 2, 5), T(4, 5, 4)] }],
  },
  'Star Dotal 10 años': {
    aniosPago: 10,
    variantes: [
      { etiqueta: 'UDI', moneda: 'UDI', tramos: [T(1, 1, 30), T(2, 2, 9), T(3, 3, 8), T(4, 10, 5)] },
      { etiqueta: 'USD', tramos: [T(1, 1, 27), T(2, 2, 9), T(3, 3, 7), T(4, 10, 5)] },
    ],
  },
  'Star Dotal 15 años': {
    aniosPago: 15,
    variantes: [{ etiqueta: 'USD', tramos: [T(1, 1, 28), T(2, 2, 9), T(3, 3, 7), T(4, 10, 5), T(11, 15, 5)] }],
  },
  'Star Dotal 20 años': {
    aniosPago: 20,
    variantes: [{ etiqueta: 'USD y UDI', tramos: [T(1, 1, 35), T(2, 2, 12), T(3, 3, 10), T(4, 10, 5), T(11, 20, 2)] }],
  },
  'Imagina Ser PPR — Prima Nivelada Plazo Largo': {
    aniosPago: null, // hasta la edad de retiro elegida
    variantes: [{ etiqueta: 'Plazo largo (20+ años)', tramos: [T(1, 1, 35), T(2, 2, 12), T(3, 3, 8), T(4, 10, 5), T(11, null, 3.5)] }],
  },
  'Imagina Ser PPR — Prima Nivelada Plazo Medio': {
    aniosPago: null,
    variantes: [{ etiqueta: 'Plazo medio (10–19 años)', tramos: [T(1, 1, 30), T(2, 2, 12), T(3, 3, 8), T(4, 10, 5), T(11, null, 3.5)] }],
  },
  'Imagina Ser PPR — Pagos Limitados 10': {
    aniosPago: 10,
    variantes: [{ etiqueta: 'Pagos limitados 10', tramos: [T(1, 1, 27), T(2, 2, 8.5), T(3, 3, 4), T(4, 10, 4)] }],
  },
  'Imagina Ser PPR — Pagos Limitados 15': {
    aniosPago: 15,
    variantes: [{ etiqueta: 'Pagos limitados 15', tramos: [T(1, 1, 30), T(2, 2, 12), T(3, 3, 8), T(4, 10, 5), T(11, 15, 3.5)] }],
  },
  'Imagina Ser PPR — Prima Única Plazo Largo': { aniosPago: 1, variantes: [{ etiqueta: 'Prima única', tramos: [T(1, 1, 8.5)] }] },
  'Imagina Ser PPR — Prima Única Plazo Medio': { aniosPago: 1, variantes: [{ etiqueta: 'Prima única', tramos: [T(1, 1, 8.5)] }] },
};

// Comisión sobre aportaciones adicionales de Imagina Ser (manual): 0.8%.
export const PCT_APORTACION_ADICIONAL_IMAGINA = 0.8;

export const PAGOS_POR_ANIO = { MENSUAL: 12, TRIMESTRAL: 4, SEMESTRAL: 2, ANUAL: 1, UNICO: 1 };
export const MESES_POR_PAGO = { MENSUAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12, UNICO: 12 };

// Edad cumplida en `en` a partir de 'YYYY-MM-DD' o Date.
export function edadEn(fechaNacimiento, en = new Date()) {
  if (!fechaNacimiento) return null;
  const n = new Date(fechaNacimiento);
  if (Number.isNaN(n.getTime())) return null;
  let e = en.getFullYear() - n.getFullYear();
  const m = en.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && en.getDate() < n.getDate())) e -= 1;
  return e;
}

const cumple = (v, { moneda, sumaAsegurada, edad }) => {
  if (v.moneda && v.moneda !== moneda) return false;
  if (v.saMin != null && !(sumaAsegurada != null && sumaAsegurada >= v.saMin)) return false;
  if (v.requiereSA && sumaAsegurada == null) return false;
  if (v.edadMax != null && !(edad != null && edad <= v.edadMax)) return false;
  return true;
};

// Esquema que le toca a una póliza. Devuelve null si el producto no tiene
// tabla (GMM, SeguBeca, producto personalizado): ahí manda el % que capture
// el asesor, solo para el año 1.
//   { producto, variante, tramos, aniosPago, supuestos[] }
export function resolverEsquema({ producto, moneda, sumaAsegurada, sumaAseguradaMoneda, edad }) {
  const def = ESQUEMAS_COMISION[producto];
  if (!def) return null;
  const supuestos = [];
  // El umbral de 1,500,000 de Orvi está en UDI: solo cuenta una SA en UDI.
  const sa = sumaAsegurada != null && (sumaAseguradaMoneda || moneda) === moneda ? +sumaAsegurada : null;
  let v = def.variantes.find((x) => cumple(x, { moneda, sumaAsegurada: sa, edad }));
  if (!v) {
    // Faltan datos para elegir (SA o edad): se usa la tasa MENOR y se avisa.
    v = [...def.variantes].sort((a, b) => a.tramos[0].pct - b.tramos[0].pct)[0];
    supuestos.push('Faltan datos para elegir la tasa (suma asegurada o edad); se usó la tasa menor.');
  } else if (v.porDefectoSinEdad && edad == null) {
    supuestos.push('Sin fecha de nacimiento del asegurado; se usó la tasa de mayores de 41 años.');
  }
  return {
    producto,
    variante: v.etiqueta,
    tramos: v.tramos,
    aniosPago: def.aniosPago,
    hastaEdad: def.hastaEdad || null,
    supuestos,
  };
}

// % del año de póliza `anio` (1 = primer año). 0 si el esquema ya no paga.
export function pctDelAnio(tramos, anio) {
  const t = (tramos || []).find((x) => anio >= x.desde && (x.hasta == null || anio <= x.hasta));
  return t ? t.pct : 0;
}

// Año de póliza (1, 2, 3…) en que cae `fecha`, contado desde el inicio de
// vigencia. Antes del inicio cuenta como año 1.
export function anioDePoliza(inicio, fecha) {
  if (!inicio) return 1;
  const i = new Date(inicio);
  const f = new Date(fecha);
  let meses = (f.getFullYear() - i.getFullYear()) * 12 + (f.getMonth() - i.getMonth());
  if (f.getDate() < i.getDate()) meses -= 1;
  return Math.max(1, Math.floor(meses / 12) + 1);
}

// Cuántos años de primas se proyectan: los que fija el producto, o hasta la
// edad tope, o hasta el fin de vigencia; con tope de 30 para vitalicios sin
// más datos (una proyección más larga deja de ser útil).
export function aniosAProyectar(esquema, { edad, inicio, fin } = {}) {
  if (esquema?.aniosPago) return esquema.aniosPago;
  if (esquema?.hastaEdad && edad != null) return Math.max(1, esquema.hastaEdad - edad);
  if (inicio && fin) {
    const a = anioDePoliza(inicio, fin);
    if (a >= 1) return Math.min(a, 30);
  }
  return 30;
}

// Proyección año por año de la comisión de una póliza, en la moneda de la
// prima. `primaOriginal` = prima anual básica en su moneda.
export function proyeccionComision({ esquema, pctAnio1, primaOriginal, formaPago, anios }) {
  const n = PAGOS_POR_ANIO[formaPago] || 1;
  const tramos = esquema?.tramos || [T(1, 1, pctAnio1 || 0)];
  const total = formaPago === 'UNICO' ? 1 : anios;
  const filas = [];
  for (let a = 1; a <= total; a += 1) {
    const pct = pctDelAnio(tramos, a);
    const anual = primaOriginal != null ? +(primaOriginal * pct / 100).toFixed(2) : null;
    filas.push({ anio: a, pct, comisionAnual: anual, porRecibo: anual != null ? +(anual / n).toFixed(2) : null, recibos: n });
  }
  return filas;
}

// Comisión de UN recibo pagado. Se calcula en la moneda de la póliza y se
// convierte a pesos con el tipo de cambio del día del pago.
//   base   = prima anual básica (moneda original) / recibos por año
//   parcial: si se pagó menos de lo esperado, comisiona en proporción.
export function comisionDeRecibo({ venta, esquema, fechaPeriodo, montoEsperado, montoPagado, tipoCambio }) {
  const anio = anioDePoliza(venta.fechaInicioVigencia || venta.fechaEmision || venta.creadoEn, fechaPeriodo);
  const pct = esquema ? pctDelAnio(esquema.tramos, anio) : (anio === 1 ? venta.comisionPct || 0 : null);
  if (pct == null) return { anioPoliza: anio, comisionPct: null, comisionMonto: null, tipoCambio: null };
  const n = PAGOS_POR_ANIO[venta.formaPago] || 1;
  const divisa = venta.moneda && venta.moneda !== 'MXN';
  const primaOriginal = divisa ? venta.primaMoneda : venta.primaAnual;
  if (primaOriginal == null) return { anioPoliza: anio, comisionPct: pct, comisionMonto: null, tipoCambio: null };
  const fraccion = montoEsperado > 0 && montoPagado != null ? Math.min(1, Math.max(0, montoPagado / montoEsperado)) : 1;
  const enMoneda = (primaOriginal / n) * (pct / 100) * fraccion;
  if (!divisa) return { anioPoliza: anio, comisionPct: pct, comisionMonto: +enMoneda.toFixed(2), tipoCambio: null };
  if (!tipoCambio) return { anioPoliza: anio, comisionPct: pct, comisionMonto: null, tipoCambio: null };
  return { anioPoliza: anio, comisionPct: pct, comisionMonto: +(enMoneda * tipoCambio).toFixed(2), tipoCambio };
}

// ---------------------------------------------------------------------------
// ISR en RESICO (personas físicas) — ESTIMADO. Tabla mensual del art. 113-E
// LISR tal como la conocemos; la tasa aplica sobre TODO el ingreso cobrado del
// mes (no es marginal) y no hay deducción de gastos. Confirmar con el contador
// (pendiente en la bóveda) antes de usarlo para declarar.
export const TABLA_RESICO_MENSUAL = [
  { hasta: 25000, tasa: 1.0 },
  { hasta: 50000, tasa: 1.1 },
  { hasta: 83333.33, tasa: 1.5 },
  { hasta: 208333.33, tasa: 2.0 },
  { hasta: 3500000 / 12, tasa: 2.5 },
];
export const TOPE_RESICO_ANUAL = 3500000;

export function isrResicoMensual(ingresoMes) {
  if (!ingresoMes || ingresoMes <= 0) return { tasa: 0, isr: 0, fueraDeTabla: false };
  const fila = TABLA_RESICO_MENSUAL.find((f) => ingresoMes <= f.hasta);
  if (!fila) return { tasa: 2.5, isr: +(ingresoMes * 0.025).toFixed(2), fueraDeTabla: true };
  return { tasa: fila.tasa, isr: +(ingresoMes * fila.tasa / 100).toFixed(2), fueraDeTabla: false };
}
