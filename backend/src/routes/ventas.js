import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('ventas'));

// Crea (o regenera) el próximo recordatorio de pago para una venta.
// Si ya existe un RECORDATORIO_PAGO pendiente (no completado, no enviado) para esta venta,
// lo actualiza en lugar de duplicar.
async function sincronizarRecordatorioPago(venta) {
  if (!venta.fechaProximoPago) return null;
  if (venta.formaPago === 'UNICO') return null; // una sola prima, no hay cobros subsecuentes
  // Póliza domiciliada: el cargo es automático, recordar el cobro sería ruido.
  // Si estaba domiciliada y ya había recordatorio abierto, se limpia.
  if (venta.domiciliada) {
    await prisma.nota.deleteMany({
      where: { ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', completada: false },
    });
    return null;
  }
  const texto = `Pago de póliza: ${venta.producto} (${venta.formaPago.toLowerCase()}) · ${venta.cliente?.nombre ?? ''} ${venta.cliente?.apellidoP ?? ''}`.trim();
  const existente = await prisma.nota.findFirst({
    where: { ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', completada: false },
  });
  if (existente) {
    return prisma.nota.update({
      where: { id: existente.id },
      data: {
        fechaAviso: new Date(venta.fechaProximoPago),
        texto,
        notificacionEnviada: false,
        avisoPrevioEnviado: false,
      },
    });
  }
  return prisma.nota.create({
    data: {
      clienteId: venta.clienteId,
      asesorId: venta.asesorId,
      ventaId: venta.id,
      tipo: 'RECORDATORIO_PAGO',
      // El cobro es asunto del cliente: el asesor debe contactarlo.
      destinatario: 'CLIENTE',
      texto,
      fechaAviso: new Date(venta.fechaProximoPago),
    },
  });
}

// Normaliza el array de coberturas de la ficha técnica:
// [{ nombre, detalle?, monto?, costo? }]. `monto` es la suma asegurada de esa
// cobertura (texto libre: "$800,000", "Incluida", "10%"); `costo` es el costo
// extra numérico en MXN de contratarla — null significa que va incluida.
function limpiarCoberturas(v) {
  if (!Array.isArray(v)) return null;
  const limpio = v
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      nombre: String(c.nombre || '').trim().slice(0, 140),
      detalle: String(c.detalle || '').trim().slice(0, 140) || null,
      monto: String(c.monto || '').trim().slice(0, 60) || null,
      costo: c.costo === null || c.costo === undefined || c.costo === '' || Number.isNaN(+c.costo)
        ? null
        : +c.costo,
    }))
    .filter((c) => c.nombre);
  return limpio.length ? limpio : null;
}

// Cuántos cobros al año implica cada forma de pago (para derivar el monto
// esperado de un recibo cuando la póliza no tiene `montoPago` capturado).
const PAGOS_POR_ANIO = { MENSUAL: 12, TRIMESTRAL: 4, SEMESTRAL: 2, ANUAL: 1, UNICO: 1 };

function montoEsperadoDePoliza(venta) {
  if (venta.montoPago != null) return venta.montoPago;
  const n = PAGOS_POR_ANIO[venta.formaPago] || 1;
  return venta.primaAnual != null ? +(venta.primaAnual / n).toFixed(2) : null;
}

const MONEDAS = ['MXN', 'USD', 'UDI'];
const METODOS_PAGO = ['TARJETA_CREDITO', 'TARJETA_CREDITO_MSI', 'TARJETA_DEBITO', 'TRANSFERENCIA', 'EFECTIVO', 'CARGO_NOMINA'];

// Prima en MXN a partir del monto en la moneda original. `primaAnual` SIEMPRE
// queda en pesos porque es la que suman métricas, comisiones, metas y ranking;
// convertirla aquí evita que cada consumidor invente su propia conversión.
function resolverPrima({ moneda, primaAnual, primaMoneda, tipoCambio }) {
  const divisa = MONEDAS.includes(moneda) ? moneda : 'MXN';
  if (divisa === 'MXN') {
    return { moneda: 'MXN', primaAnual: +primaAnual, primaMoneda: null, tipoCambio: null };
  }
  const tc = +tipoCambio;
  if (!tc || tc <= 0) return { error: 'Con moneda USD o UDI se requiere el tipo de cambio' };
  const original = primaMoneda != null && primaMoneda !== '' ? +primaMoneda : +primaAnual;
  if (!original || original <= 0) return { error: 'Prima inválida' };
  return {
    moneda: divisa,
    primaAnual: +(original * tc).toFixed(2),
    primaMoneda: original,
    tipoCambio: tc,
  };
}

// Normaliza beneficiarios: [{ nombre, porcentaje? }]
function limpiarBeneficiarios(v) {
  if (!Array.isArray(v)) return null;
  const limpio = v
    .filter((b) => b && typeof b === 'object')
    .map((b) => ({
      nombre: String(b.nombre || '').trim().slice(0, 140),
      porcentaje: b.porcentaje === null || b.porcentaje === undefined || b.porcentaje === '' ? null : +b.porcentaje,
    }))
    .filter((b) => b.nombre);
  return limpio.length ? limpio : null;
}

// Resumen de cartera por asesor para la vista de promotor (roster de Equipo).
// SOLO promotores (ADMIN/SUPERADMIN): un asesor no puede ver agregados de otros.
router.get('/equipo/resumen', asyncHandler(async (req, res) => {
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!isAdmin) return res.status(403).json({ error: 'Solo promotores pueden consultar el equipo' });
  const [asesores, ventas] = await Promise.all([
    prisma.usuario.findMany({
      where: { rol: 'ASESOR', activo: true },
      select: { id: true, nombre: true, apellidoP: true, apellidoM: true, fotoUrl: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.venta.findMany({ select: { asesorId: true, primaAnual: true, comisionMonto: true, estado: true } }),
  ]);
  const GANADAS = ['PAGADA', 'APROBADA'];
  const PIPELINE = ['PENDIENTE_PAGAR', 'FIRMADA'];
  const resumen = asesores.map((a) => {
    const propias = ventas.filter((v) => v.asesorId === a.id);
    const ganadas = propias.filter((v) => GANADAS.includes(v.estado));
    const pendientes = propias.filter((v) => PIPELINE.includes(v.estado));
    const activas = ganadas.length + pendientes.length;
    return {
      asesor: a,
      polizas: propias.length,
      primaGestionada: propias.reduce((s, v) => s + v.primaAnual, 0),
      comisionGanada: ganadas.reduce((s, v) => s + (v.comisionMonto || 0), 0),
      comisionPipeline: pendientes.reduce((s, v) => s + (v.comisionMonto || 0), 0),
      ganadas: ganadas.length,
      pendientes: pendientes.length,
      cierrePct: activas ? Math.round((ganadas.length / activas) * 100) : 0,
    };
  });
  res.json(resumen);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { estado, asesorId, clienteId, desde, hasta } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (clienteId) where.clienteId = clienteId;
  if (estado) where.estado = estado;
  if (desde || hasta) {
    where.creadoEn = {};
    if (desde) where.creadoEn.gte = new Date(desde);
    if (hasta) where.creadoEn.lte = new Date(hasta);
  }
  const ventas = await prisma.venta.findMany({
    where,
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, apellidoM: true, telefono: true, email: true, fechaNacimiento: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      validador: { select: { id: true, nombre: true } },
      productoCatalogo: { select: { id: true, nombre: true, ramo: true, comisionPct: true, descripcion: true } },
      recordatoriosPago: { orderBy: { fechaAviso: 'asc' }, take: 5 },
      pagos: { orderBy: { periodo: 'desc' } },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(ventas.map((v) => ({ ...v, montoEsperado: montoEsperadoDePoliza(v) })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const venta = await prisma.venta.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, apellidoM: true, telefono: true, email: true, rfc: true, direccion: true, fechaNacimiento: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true, email: true, telefono: true } },
      validador: { select: { id: true, nombre: true } },
      productoCatalogo: true,
      recordatoriosPago: { orderBy: { fechaAviso: 'asc' } },
      pagos: { orderBy: { periodo: 'desc' }, include: { registrador: { select: { id: true, nombre: true, apellidoP: true } } } },
    },
  });
  if (!venta) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = venta.asesorId === req.user.id;
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });
  res.json({ ...venta, montoEsperado: montoEsperadoDePoliza(venta) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    clienteId, ramo, producto, primaAnual, comisionPct, estado, notas,
    productoCatalogoId, fechaFirma, fechaEmision, fechaPago, fechaEntregaPoliza,
    formaPago, fechaInicioVigencia, fechaFinVigencia, fechaProximoPago, diaPago, montoPago,
    sumaAsegurada, plazo, deducible, coaseguro, coberturas, beneficiarios,
    moneda, primaMoneda, tipoCambio, domiciliada, metodoPago,
  } = req.body || {};
  if (!clienteId || !ramo || !producto || primaAnual == null) return res.status(400).json({ error: 'clienteId, ramo, producto y primaAnual son requeridos' });
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || cliente.asesorId);
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'El cliente pertenece a otro asesor' });

  // Si viene productoCatalogoId, pero no producto/comisionPct, pre-puebla desde el catálogo
  let catalogo = null;
  if (productoCatalogoId) {
    catalogo = await prisma.productoCatalogo.findUnique({ where: { id: productoCatalogoId } });
  }
  const divisa = resolverPrima({ moneda, primaAnual, primaMoneda, tipoCambio });
  if (divisa.error) return res.status(400).json({ error: divisa.error });
  const pctFinal = comisionPct ?? (catalogo?.comisionPct ?? 10);
  const comisionMontoFinal = +(divisa.primaAnual * pctFinal / 100).toFixed(2);

  const venta = await prisma.venta.create({
    data: {
      asesorId, clienteId, ramo, producto,
      primaAnual: divisa.primaAnual,
      moneda: divisa.moneda, primaMoneda: divisa.primaMoneda, tipoCambio: divisa.tipoCambio,
      comisionPct: pctFinal, comisionMonto: comisionMontoFinal,
      estado: estado || 'PENDIENTE_PAGAR',
      notas: notas || null,
      productoCatalogoId: productoCatalogoId || null,
      fechaFirma: fechaFirma ? new Date(fechaFirma) : null,
      fechaEmision: fechaEmision ? new Date(fechaEmision) : null,
      fechaPago: fechaPago ? new Date(fechaPago) : null,
      fechaEntregaPoliza: fechaEntregaPoliza ? new Date(fechaEntregaPoliza) : null,
      formaPago: formaPago || 'ANUAL',
      domiciliada: domiciliada === true,
      metodoPago: METODOS_PAGO.includes(metodoPago) ? metodoPago : null,
      fechaInicioVigencia: fechaInicioVigencia ? new Date(fechaInicioVigencia) : null,
      fechaFinVigencia: fechaFinVigencia ? new Date(fechaFinVigencia) : null,
      fechaProximoPago: fechaProximoPago ? new Date(fechaProximoPago) : null,
      diaPago: diaPago ?? null,
      montoPago: montoPago ?? null,
      sumaAsegurada: sumaAsegurada ?? null,
      plazo: plazo || null,
      deducible: deducible ?? null,
      coaseguro: coaseguro || null,
      coberturas: limpiarCoberturas(coberturas),
      beneficiarios: limpiarBeneficiarios(beneficiarios),
    },
    include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  // Sincroniza recordatorio de pago
  await sincronizarRecordatorioPago(venta);
  await registrarActividad(asesorId, 'POLIZA_CREADA', {
    ventaId: venta.id,
    clienteId: venta.cliente?.id || clienteId,
    cliente: venta.cliente ? `${venta.cliente.nombre} ${venta.cliente.apellidoP}` : null,
    producto, ramo, prima: divisa.primaAnual,
  });
  res.status(201).json(venta);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.venta.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = existente.asesorId === req.user.id;
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });

  const {
    ramo, producto, primaAnual, comisionPct, estado, notas,
    productoCatalogoId, fechaFirma, fechaEmision, fechaPago, fechaEntregaPoliza,
    fechaCancelacion, montoCancelado, motivoCancelacion,
    formaPago, fechaInicioVigencia, fechaFinVigencia, fechaProximoPago, diaPago, montoPago,
    sumaAsegurada, plazo, deducible, coaseguro, coberturas, beneficiarios,
    moneda, primaMoneda, tipoCambio, domiciliada, metodoPago,
  } = req.body || {};
  const data = {};
  if (ramo) data.ramo = ramo;
  if (producto) data.producto = producto;
  if (productoCatalogoId !== undefined) data.productoCatalogoId = productoCatalogoId || null;
  // La moneda y la prima se resuelven juntas: cambiar solo el tipo de cambio
  // debe recalcular la prima en pesos, y viceversa.
  if (primaAnual != null || moneda !== undefined || primaMoneda !== undefined || tipoCambio !== undefined) {
    const divisa = resolverPrima({
      moneda: moneda !== undefined ? moneda : existente.moneda,
      primaAnual: primaAnual != null ? primaAnual : existente.primaAnual,
      primaMoneda: primaMoneda !== undefined ? primaMoneda : existente.primaMoneda,
      tipoCambio: tipoCambio !== undefined ? tipoCambio : existente.tipoCambio,
    });
    if (divisa.error) return res.status(400).json({ error: divisa.error });
    data.primaAnual = divisa.primaAnual;
    data.moneda = divisa.moneda;
    data.primaMoneda = divisa.primaMoneda;
    data.tipoCambio = divisa.tipoCambio;
    const pct = comisionPct ?? existente.comisionPct;
    data.comisionPct = pct;
    data.comisionMonto = +(divisa.primaAnual * pct / 100).toFixed(2);
  } else if (comisionPct != null) {
    data.comisionPct = comisionPct;
    data.comisionMonto = +(existente.primaAnual * comisionPct / 100).toFixed(2);
  }
  if (domiciliada !== undefined) data.domiciliada = domiciliada === true;
  if (metodoPago !== undefined) data.metodoPago = METODOS_PAGO.includes(metodoPago) ? metodoPago : null;
  if (fechaFirma !== undefined) data.fechaFirma = fechaFirma ? new Date(fechaFirma) : null;
  if (fechaEmision !== undefined) data.fechaEmision = fechaEmision ? new Date(fechaEmision) : null;
  if (fechaPago !== undefined) data.fechaPago = fechaPago ? new Date(fechaPago) : null;
  if (fechaEntregaPoliza !== undefined) data.fechaEntregaPoliza = fechaEntregaPoliza ? new Date(fechaEntregaPoliza) : null;
  if (fechaCancelacion !== undefined) data.fechaCancelacion = fechaCancelacion ? new Date(fechaCancelacion) : null;
  if (montoCancelado !== undefined) data.montoCancelado = montoCancelado ?? null;
  if (motivoCancelacion !== undefined) data.motivoCancelacion = motivoCancelacion || null;
  if (formaPago !== undefined) data.formaPago = formaPago;
  if (fechaInicioVigencia !== undefined) data.fechaInicioVigencia = fechaInicioVigencia ? new Date(fechaInicioVigencia) : null;
  if (fechaFinVigencia !== undefined) data.fechaFinVigencia = fechaFinVigencia ? new Date(fechaFinVigencia) : null;
  if (fechaProximoPago !== undefined) data.fechaProximoPago = fechaProximoPago ? new Date(fechaProximoPago) : null;
  if (diaPago !== undefined) data.diaPago = diaPago ?? null;
  if (montoPago !== undefined) data.montoPago = montoPago ?? null;
  if (sumaAsegurada !== undefined) data.sumaAsegurada = sumaAsegurada ?? null;
  if (plazo !== undefined) data.plazo = plazo || null;
  if (deducible !== undefined) data.deducible = deducible ?? null;
  if (coaseguro !== undefined) data.coaseguro = coaseguro || null;
  if (coberturas !== undefined) data.coberturas = limpiarCoberturas(coberturas);
  if (beneficiarios !== undefined) data.beneficiarios = limpiarBeneficiarios(beneficiarios);
  if (estado) {
    data.estado = estado;
    if (estado === 'APROBADA' || estado === 'RECHAZADA') {
      data.validadoPor = req.user.id;
      data.fechaValidacion = new Date();
    }
  }
  if (notas !== undefined) data.notas = notas || null;
  const venta = await prisma.venta.update({ where: { id }, data });
  // Sincroniza recordatorio si cambió fechaProximoPago, formaPago o la
  // domiciliación (domiciliar una póliza debe borrar su recordatorio abierto).
  if (fechaProximoPago !== undefined || formaPago !== undefined || domiciliada !== undefined) {
    const ventaConCliente = await prisma.venta.findUnique({ where: { id }, include: { cliente: { select: { nombre: true, apellidoP: true } } } });
    await sincronizarRecordatorioPago(ventaConCliente);
  }
  res.json(venta);
}));

// Confirma el pago del período actual: registra el cobro en el historial
// (PagoPoliza), marca la nota RECORDATORIO_PAGO como completada y genera
// automáticamente la siguiente, sumando un periodo a fechaProximoPago.
// Body opcional: { montoPagado, justificacion } — permite registrar que el
// cliente pagó un monto distinto al esperado, con su razón.
router.post('/:id/cobroconfirmado', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const venta = await prisma.venta.findUnique({ where: { id } });
  if (!venta) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = venta.asesorId === req.user.id;
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });

  const { montoPagado, justificacion } = req.body || {};
  const montoEsperado = venta.montoPago ?? montoEsperadoDePoliza(venta);
  const pagado = montoPagado === undefined || montoPagado === null || montoPagado === ''
    ? montoEsperado
    : +montoPagado;
  if (pagado != null && (Number.isNaN(pagado) || pagado < 0)) {
    return res.status(400).json({ error: 'Monto pagado inválido' });
  }

  // Historial de cobros: fuente del semáforo de pagos por cliente.
  await prisma.pagoPoliza.create({
    data: {
      ventaId: id,
      periodo: venta.fechaProximoPago ? new Date(venta.fechaProximoPago) : new Date(),
      estado: 'PAGADO',
      montoEsperado: montoEsperado ?? null,
      montoPagado: pagado ?? null,
      justificacion: String(justificacion || '').trim().slice(0, 300) || null,
      registradoPor: req.user.id,
    },
  });

  // Marca como completadas las notas RECORDATORIO_PAGO vencidas o pendientes para esta venta
  await prisma.nota.updateMany({
    where: { ventaId: id, tipo: 'RECORDATORIO_PAGO', completada: false },
    data: { completada: true, notificacionEnviada: true, avisoPrevioEnviado: true },
  });

  // Calcula la próxima fecha según formaPago
  const fp = venta.formaPago;
  const base = venta.fechaProximoPago ? new Date(venta.fechaProximoPago) : new Date();
  const proxima = new Date(base);
  if (fp === 'MENSUAL') proxima.setMonth(proxima.getMonth() + 1);
  else if (fp === 'TRIMESTRAL') proxima.setMonth(proxima.getMonth() + 3);
  else if (fp === 'SEMESTRAL') proxima.setMonth(proxima.getMonth() + 6);
  else if (fp === 'ANUAL') proxima.setFullYear(proxima.getFullYear() + 1);
  else if (fp === 'UNICO') {
    // Pago único: no hay siguiente; solo actualizamos estado a PAGADA.
    await prisma.venta.update({ where: { id }, data: { fechaPago: new Date(), estado: 'PAGADA' } });
    return res.json({ ok: true, siguienteFecha: null });
  }

  // Si la fecha fin de vigencia ya está definida y la próxima date > fin, no crear nuevo recordatorio
  if (venta.fechaFinVigencia && proxima > new Date(venta.fechaFinVigencia)) {
    await prisma.venta.update({ where: { id }, data: { fechaProximoPago: null } });
    return res.json({ ok: true, siguienteFecha: null });
  }

  await prisma.venta.update({ where: { id }, data: { fechaProximoPago: proxima } });
  const ventaConCliente = await prisma.venta.findUnique({ where: { id }, include: { cliente: { select: { nombre: true, apellidoP: true } } } });
  await sincronizarRecordatorioPago(ventaConCliente);
  await registrarActividad(venta.asesorId, 'PAGO_CONFIRMADO', {
    ventaId: venta.id,
    clienteId: venta.clienteId,
    cliente: ventaConCliente?.cliente ? `${ventaConCliente.cliente.nombre} ${ventaConCliente.cliente.apellidoP}` : null,
    producto: venta.producto,
    proximoCobro: proxima.toISOString().slice(0, 10),
  });
  res.json({ ok: true, siguienteFecha: proxima });
}));

// El asesor dueño de la póliza también puede eliminarla (además de los admins)
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const venta = await prisma.venta.findUnique({ where: { id } });
  if (!venta) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = venta.asesorId === req.user.id;
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });
  await prisma.venta.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
