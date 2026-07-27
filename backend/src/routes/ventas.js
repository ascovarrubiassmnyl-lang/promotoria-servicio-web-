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
  const texto = `Pago de póliza: ${venta.producto} (${venta.formaPago.toLowerCase()}) · ${venta.cliente?.nombre ?? ''} ${venta.cliente?.apellidoP ?? ''}`.trim();
  const existente = await prisma.nota.findFirst({
    where: { ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', completada: false },
  });
  if (existente) {
    return prisma.nota.update({
      where: { id: existente.id },
      data: { fechaAviso: new Date(venta.fechaProximoPago), texto, notificacionEnviada: false },
    });
  }
  return prisma.nota.create({
    data: {
      clienteId: venta.clienteId,
      asesorId: venta.asesorId,
      ventaId: venta.id,
      tipo: 'RECORDATORIO_PAGO',
      texto,
      fechaAviso: new Date(venta.fechaProximoPago),
    },
  });
}

// Normaliza el array de coberturas de la ficha técnica: [{ nombre, detalle?, monto? }]
function limpiarCoberturas(v) {
  if (!Array.isArray(v)) return null;
  const limpio = v
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      nombre: String(c.nombre || '').trim().slice(0, 140),
      detalle: String(c.detalle || '').trim().slice(0, 140) || null,
      monto: String(c.monto || '').trim().slice(0, 60) || null,
    }))
    .filter((c) => c.nombre);
  return limpio.length ? limpio : null;
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
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(ventas);
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
    },
  });
  if (!venta) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = venta.asesorId === req.user.id;
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });
  res.json(venta);
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    clienteId, ramo, producto, primaAnual, comisionPct, estado, notas,
    productoCatalogoId, fechaFirma, fechaPago, fechaEntregaPoliza,
    formaPago, fechaInicioVigencia, fechaFinVigencia, fechaProximoPago, diaPago, montoPago,
    sumaAsegurada, plazo, deducible, coaseguro, coberturas, beneficiarios,
  } = req.body || {};
  if (!clienteId || !ramo || !producto || primaAnual == null) return res.status(400).json({ error: 'clienteId, ramo, producto y primaAnual son requeridos' });
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || cliente.asesorId);
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'El cliente pertenece a otro asesor' });

  const pct = comisionPct ?? (req.body.productoCatalogoId ? 10 : 10);
  const comisionMonto = +(primaAnual * pct / 100).toFixed(2);

  // Si viene productoCatalogoId, pero no producto/comisionPct, pre-puebla desde el catálogo
  let catalogo = null;
  if (productoCatalogoId) {
    catalogo = await prisma.productoCatalogo.findUnique({ where: { id: productoCatalogoId } });
  }
  const pctFinal = comisionPct ?? (catalogo?.comisionPct ?? 10);
  const comisionMontoFinal = +(primaAnual * pctFinal / 100).toFixed(2);

  const venta = await prisma.venta.create({
    data: {
      asesorId, clienteId, ramo, producto,
      primaAnual: +primaAnual, comisionPct: pctFinal, comisionMonto: comisionMontoFinal,
      estado: estado || 'PENDIENTE_PAGAR',
      notas: notas || null,
      productoCatalogoId: productoCatalogoId || null,
      fechaFirma: fechaFirma ? new Date(fechaFirma) : null,
      fechaPago: fechaPago ? new Date(fechaPago) : null,
      fechaEntregaPoliza: fechaEntregaPoliza ? new Date(fechaEntregaPoliza) : null,
      formaPago: formaPago || 'ANUAL',
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
    producto, ramo, prima: +primaAnual,
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
    productoCatalogoId, fechaFirma, fechaPago, fechaEntregaPoliza,
    fechaCancelacion, montoCancelado, motivoCancelacion,
    formaPago, fechaInicioVigencia, fechaFinVigencia, fechaProximoPago, diaPago, montoPago,
    sumaAsegurada, plazo, deducible, coaseguro, coberturas, beneficiarios,
  } = req.body || {};
  const data = {};
  if (ramo) data.ramo = ramo;
  if (producto) data.producto = producto;
  if (productoCatalogoId !== undefined) data.productoCatalogoId = productoCatalogoId || null;
  if (primaAnual != null) {
    data.primaAnual = +primaAnual;
    const pct = comisionPct ?? existente.comisionPct;
    data.comisionPct = pct;
    data.comisionMonto = +(primaAnual * pct / 100).toFixed(2);
  } else if (comisionPct != null) {
    data.comisionPct = comisionPct;
    data.comisionMonto = +(existente.primaAnual * comisionPct / 100).toFixed(2);
  }
  if (fechaFirma !== undefined) data.fechaFirma = fechaFirma ? new Date(fechaFirma) : null;
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
  // Sincroniza recordatorio si cambió fechaProximoPago o formaPago
  if (fechaProximoPago !== undefined || formaPago !== undefined) {
    const ventaConCliente = await prisma.venta.findUnique({ where: { id }, include: { cliente: { select: { nombre: true, apellidoP: true } } } });
    await sincronizarRecordatorioPago(ventaConCliente);
  }
  res.json(venta);
}));

// Confirma el pago del período actual: marca la nota RECORDATORIO_PAGO como completada
// y genera automáticamente la siguiente, sumando un periodo a fechaProximoPago.
router.post('/:id/cobroconfirmado', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const venta = await prisma.venta.findUnique({ where: { id } });
  if (!venta) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = venta.asesorId === req.user.id;
  const isAdmin = req.user.rol === 'ADMIN' || req.user.rol === 'SUPERADMIN';
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });

  // Marca como completadas las notas RECORDATORIO_PAGO vencidas o pendientes para esta venta
  await prisma.nota.updateMany({
    where: { ventaId: id, tipo: 'RECORDATORIO_PAGO', completada: false },
    data: { completada: true, notificacionEnviada: true },
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
