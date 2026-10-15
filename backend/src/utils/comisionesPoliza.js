import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { tipoCambioVigente } from '../services/tipoCambio.js';
import {
  resolverEsquema, comisionDeRecibo, proyeccionComision, aniosAProyectar, edadEn,
  pctDelAnio, PAGOS_POR_ANIO, MESES_POR_PAGO, ESQUEMAS_COMISION,
} from './comisiones.js';

// Puente entre el esquema de comisiones (utils/comisiones.js, puro) y la base:
// qué esquema le toca a una póliza, el registro de cada recibo pagado con su
// comisión, y la proyección. Las rutas de /ventas solo llaman esto.

export const ESTADOS_CON_PRIMER_PAGO = ['PAGADA', 'APROBADA'];

// Edad del asegurado al inicio de vigencia: primer asegurado de la ficha y,
// si no trae fecha, la del cliente.
export function edadAlContratar(venta, cliente) {
  const nac = (Array.isArray(venta.asegurados) && venta.asegurados.find((a) => a?.fechaNacimiento)?.fechaNacimiento)
    || cliente?.fechaNacimiento || null;
  return edadEn(nac, venta.fechaInicioVigencia ? new Date(venta.fechaInicioVigencia) : new Date());
}

// Esquema para los datos de una póliza (nueva o editada). `nombreProducto` es
// el nombre del catálogo cuando hay productoCatalogoId (el texto libre
// `producto` puede haberse editado).
export function esquemaParaPoliza(venta, { nombreProducto, cliente } = {}) {
  return resolverEsquema({
    producto: nombreProducto || venta.producto,
    moneda: venta.moneda || 'MXN',
    sumaAsegurada: venta.sumaAsegurada,
    sumaAseguradaMoneda: venta.sumaAseguradaMoneda,
    edad: edadAlContratar(venta, cliente),
  });
}

// Tipo de cambio para convertir la comisión de un recibo a pesos: el vigente
// (Banxico o respaldo manual); si no hay, el que se usó al capturar la prima.
async function tcParaRecibo(venta) {
  if (!venta.moneda || venta.moneda === 'MXN') return null;
  const tc = await tipoCambioVigente(venta.moneda).catch(() => null);
  return tc?.valor || venta.tipoCambio || null;
}

export function montoEsperadoDeRecibo(venta) {
  if (venta.montoPago != null) return venta.montoPago;
  const n = PAGOS_POR_ANIO[venta.formaPago] || 1;
  return venta.primaAnual != null ? +(venta.primaAnual / n).toFixed(2) : null;
}

export function siguientePeriodo(fecha, formaPago) {
  const d = new Date(fecha);
  if (formaPago === 'UNICO') return null;
  d.setMonth(d.getMonth() + (MESES_POR_PAGO[formaPago] || 12));
  return d;
}

// Registra un recibo pagado con su comisión. No duplica: si ya hay un pago
// PAGADO para el mismo periodo (mismo día), devuelve { duplicado }.
export async function registrarPagoConComision(venta, { periodo, fechaPago, montoPagado, justificacion, registradoPor }) {
  const p = new Date(periodo);
  const dia = new Date(p); dia.setHours(0, 0, 0, 0);
  const finDia = new Date(dia.getTime() + 86400000);
  const ya = await prisma.pagoPoliza.findFirst({
    where: { ventaId: venta.id, estado: 'PAGADO', periodo: { gte: dia, lt: finDia } },
  });
  if (ya) return { duplicado: ya };

  const montoEsperado = montoEsperadoDeRecibo(venta);
  const pagado = montoPagado == null ? montoEsperado : +montoPagado;
  const com = comisionDeRecibo({
    venta,
    esquema: venta.esquemaComision,
    fechaPeriodo: p,
    montoEsperado,
    montoPagado: pagado,
    tipoCambio: await tcParaRecibo(venta),
  });
  const pago = await prisma.pagoPoliza.create({
    data: {
      ventaId: venta.id,
      periodo: p,
      fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
      estado: 'PAGADO',
      montoEsperado: montoEsperado ?? null,
      montoPagado: pagado ?? null,
      justificacion: String(justificacion || '').trim().slice(0, 300) || null,
      registradoPor: registradoPor || null,
      ...com,
    },
  });
  return { pago };
}

// Al dar de alta (o pasar a PAGADA/APROBADA) una póliza sin ningún pago: el
// primer recibo ya se cobró. Se registra con periodo = inicio de vigencia y,
// si no había próximo pago capturado, se fija el siguiente recibo.
export async function registrarPrimerPagoSiAplica(venta, { registradoPor } = {}) {
  if (!ESTADOS_CON_PRIMER_PAGO.includes(venta.estado)) return null;
  const hay = await prisma.pagoPoliza.count({ where: { ventaId: venta.id } });
  if (hay > 0) return null;
  const periodo = venta.fechaInicioVigencia || venta.fechaEmision || new Date();
  const { pago } = await registrarPagoConComision(venta, {
    periodo,
    fechaPago: venta.fechaPago || venta.fechaEmision || new Date(),
    registradoPor,
    justificacion: 'Primer recibo (registrado al dar de alta la póliza como pagada)',
  });
  if (!venta.fechaProximoPago && venta.formaPago !== 'UNICO') {
    const sig = siguientePeriodo(periodo, venta.formaPago);
    const fin = venta.fechaFinVigencia ? new Date(venta.fechaFinVigencia) : null;
    if (sig && (!fin || sig <= fin)) {
      await prisma.venta.update({ where: { id: venta.id }, data: { fechaProximoPago: sig } });
    }
  }
  return pago;
}

// Proyección año por año en la moneda de la póliza y en pesos (TC del día).
// La usan la ficha (con lo cobrado) y la vista previa del formulario.
export async function proyeccionPoliza(venta, cliente) {
  const divisa = venta.moneda && venta.moneda !== 'MXN';
  const primaOriginal = divisa ? venta.primaMoneda : venta.primaAnual;
  const esquema = venta.esquemaComision || null;
  const anios = !esquema ? 1 : aniosAProyectar(esquema, {
    edad: edadAlContratar(venta, cliente),
    inicio: venta.fechaInicioVigencia,
    fin: venta.fechaFinVigencia,
  });
  const filas = proyeccionComision({ esquema, pctAnio1: venta.comisionPct, primaOriginal, formaPago: venta.formaPago, anios });
  const tc = divisa ? await tcParaRecibo(venta) : 1;
  const enPesos = (v) => (v == null ? null : tc ? +(v * tc).toFixed(2) : null);
  return {
    esquema,
    moneda: venta.moneda || 'MXN',
    tipoCambio: divisa ? tc : null,
    sinTabla: !esquema,
    anios: filas.map((f) => ({ ...f, comisionAnualMXN: enPesos(f.comisionAnual), porReciboMXN: enPesos(f.porRecibo) })),
    totalVidaMXN: enPesos(filas.reduce((s2, f) => s2 + (f.comisionAnual || 0), 0)),
  };
}

// Proyección año por año + lo cobrado, para la ficha de la póliza.
export async function resumenComisionPoliza(venta, cliente) {
  const proy = await proyeccionPoliza(venta, cliente);
  const pagos = await prisma.pagoPoliza.findMany({
    where: { ventaId: venta.id, estado: 'PAGADO' },
    select: { anioPoliza: true, comisionMonto: true },
  });
  const cobradoPorAnio = {};
  for (const p of pagos) {
    if (p.comisionMonto == null) continue;
    cobradoPorAnio[p.anioPoliza || 1] = (cobradoPorAnio[p.anioPoliza || 1] || 0) + p.comisionMonto;
  }
  return {
    ...proy,
    anios: proy.anios.map((f) => ({ ...f, cobradoMXN: +(cobradoPorAnio[f.anio] || 0).toFixed(2) })),
    cobradoMXN: +pagos.reduce((s2, p) => s2 + (p.comisionMonto || 0), 0).toFixed(2),
    pendientesDeConvertir: pagos.filter((p) => p.comisionMonto == null).length,
  };
}

// Job horario: completa la comisión de los recibos que quedaron sin ella
// (sin tipo de cambio en su momento, o pagos anteriores a esta función).
export async function reconciliarComisionesPendientes() {
  const pendientes = await prisma.pagoPoliza.findMany({
    // Un recibo de un año sin tabla (GMM año 2+) queda con anioPoliza y sin
    // % — no se vuelve a intentar.
    where: { estado: 'PAGADO', comisionMonto: null, OR: [{ anioPoliza: null }, { comisionPct: { not: null } }] },
    include: { venta: true },
    take: 200,
  });
  let resueltos = 0;
  for (const p of pendientes) {
    const v = p.venta;
    const com = comisionDeRecibo({
      venta: v,
      esquema: v.esquemaComision,
      fechaPeriodo: p.periodo,
      montoEsperado: p.montoEsperado,
      montoPagado: p.montoPagado,
      tipoCambio: await tcParaRecibo(v),
    });
    // Producto sin tabla después del año 1: no hay nada que completar.
    if (com.comisionPct == null && p.anioPoliza != null) continue;
    await prisma.pagoPoliza.update({ where: { id: p.id }, data: com });
    if (com.comisionMonto != null) resueltos += 1;
  }
  return resueltos;
}

// Pólizas capturadas antes del esquema (o editadas fuera de la API): se les
// asigna el que les toca. Solo productos con tabla, para no reintentar cada
// hora los que nunca tendrán (GMM, SeguBeca, personalizados).
export async function asignarEsquemasFaltantes() {
  const nombres = Object.keys(ESQUEMAS_COMISION);
  const ventas = await prisma.venta.findMany({
    where: {
      esquemaComision: { equals: Prisma.DbNull },
      OR: [{ producto: { in: nombres } }, { productoCatalogo: { nombre: { in: nombres } } }],
    },
    include: { productoCatalogo: { select: { nombre: true } }, cliente: { select: { fechaNacimiento: true } } },
    take: 200,
  });
  for (const v of ventas) {
    const esquema = esquemaParaPoliza(v, { nombreProducto: v.productoCatalogo?.nombre, cliente: v.cliente });
    if (!esquema) continue;
    const pct = pctDelAnio(esquema.tramos, 1);
    await prisma.venta.update({
      where: { id: v.id },
      data: { esquemaComision: esquema, comisionPct: pct, comisionMonto: +(v.primaAnual * pct / 100).toFixed(2) },
    });
  }
  return ventas.length;
}

export { pctDelAnio };
