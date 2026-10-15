import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { UPLOADS_DIR, persistir, existe } from '../services/almacenamiento.js';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { authenticate, tieneRolAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';
import { analizarPolizaPdf, extraccionDisponible } from '../services/extraccionPoliza.js';
import { tiposDeCambioVigentes } from '../services/tipoCambio.js';
import { MONEDAS, resolverPrima } from '../utils/prima.js';
import {
  esquemaParaPoliza, registrarPagoConComision, registrarPrimerPagoSiAplica,
  resumenComisionPoliza, proyeccionPoliza, siguientePeriodo, montoEsperadoDeRecibo,
  comisionAutomatica, recibosFaltantes,
} from '../utils/comisionesPoliza.js';
import { pctDelAnio, isrResicoMensual, TOPE_RESICO_ANUAL, PAGOS_POR_ANIO as RECIBOS_POR_ANIO, anioDePoliza } from '../utils/comisiones.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('ventas'));

// Mismo /uploads que documentos.js (incluso mismo nombre de archivo físico
// aleatorio) para que el PDF de la póliza sea un DocumentoCliente normal,
// servible por GET /documentos/:id/ver y /descargar sin lógica aparte.
// El destino definitivo (bucket o disco) lo resuelve services/almacenamiento.js.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const uploadPoliza = multer({ storage, limits: { fileSize: 35 * 1024 * 1024 } }); // 35 MB máx

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

// Normaliza cualquier valor de moneda que llegue del cliente a un valor válido
// del enum MonedaPoliza. Fail closed hacia MXN: un valor basura no puede
// convertir una cifra en pesos en una cifra en dólares.
const moneda = (v) => (MONEDAS.includes(v) ? v : 'MXN');

// Normaliza el array de coberturas de la ficha técnica:
// [{ nombre, detalle?, monto?, costo?, costoMoneda? }]. `monto` es la suma
// asegurada de esa cobertura (texto libre: "$800,000", "Incluida", "10%");
// `costo` es el costo extra numérico de contratarla — null significa que va
// incluida — y `costoMoneda` la denominación de ese costo.
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
      // Denominación del costo extra. Las coberturas guardadas antes de
      // multi-moneda no la traen y se leen como MXN (default de `moneda()`).
      costoMoneda: moneda(c.costoMoneda),
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

const METODOS_PAGO = ['TARJETA_CREDITO', 'TARJETA_CREDITO_MSI', 'TARJETA_DEBITO', 'TRANSFERENCIA', 'EFECTIVO', 'CARGO_NOMINA'];

// `resolverPrima` (prima en MXN a partir del monto en la moneda original) vive
// en utils/prima.js: la comparte el job que reconcilia las primas que se
// guardaron sin tipo de cambio disponible.

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

// Normaliza el array de asegurados de la ficha técnica:
// [{ nombre, parentesco?, fechaNacimiento? }]. Son las personas CUBIERTAS por
// la póliza (en GMM familiar, varias); no confundir con `beneficiarios`, que
// son quienes cobran el siniestro.
function limpiarAsegurados(v) {
  if (!Array.isArray(v)) return null;
  const limpio = v
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      nombre: String(a.nombre || '').trim().slice(0, 140),
      parentesco: String(a.parentesco || '').trim().slice(0, 60) || null,
      // Se guarda como el string 'YYYY-MM-DD' que captura el DatePicker: es un
      // dato de la carátula, no una fecha con la que se calcule nada.
      fechaNacimiento: String(a.fechaNacimiento || '').trim().slice(0, 10) || null,
    }))
    .filter((a) => a.nombre);
  return limpio.length ? limpio : null;
}

// Situación operativa de la póliza emitida (enum SituacionPoliza). Fail closed
// hacia null: un valor basura no se guarda. NO decide comisiones ni métricas
// — eso sigue siendo `estado` (EstadoVenta).
const SITUACIONES = ['ACTIVA', 'POR_RENOVAR', 'EN_RESCATE'];
const situacionValida = (v) => (SITUACIONES.includes(v) ? v : null);

// Texto corto de la ficha (número de póliza, contratante, plan, red médica).
const texto = (v, max = 140) => (v == null ? null : (String(v).trim().slice(0, max) || null));

// Resumen de cartera por asesor para la vista de promotor (roster de Equipo).
// SOLO promotores (ADMIN/SUPERADMIN): un asesor no puede ver agregados de otros.
router.get('/equipo/resumen', asyncHandler(async (req, res) => {
  const isAdmin = tieneRolAdmin(req.user);
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
      asesor: { select: { id: true, nombre: true, apellidoP: true, claveAgente: true } },
      validador: { select: { id: true, nombre: true } },
      productoCatalogo: { select: { id: true, nombre: true, ramo: true, comisionPct: true, descripcion: true } },
      recordatoriosPago: { orderBy: { fechaAviso: 'asc' }, take: 5 },
      pagos: { orderBy: { periodo: 'desc' } },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(ventas.map((v) => ({ ...v, montoEsperado: montoEsperadoDePoliza(v) })));
}));

// Rutas de literal fijo ANTES de '/:id' — Express matchea en orden de
// declaración, así que si '/:id' fuera primero capturaría "analisis-disponible"
// como si fuera un id de póliza (bug real, encontrado al probar el endpoint).
//
// El frontend consulta esto para mostrar el botón "Analizar con IA" habilitado
// o no, sin tener que intentar subir un archivo primero para descubrirlo.
router.get('/analisis-disponible', asyncHandler(async (_req, res) => {
  res.json({ disponible: extraccionDisponible() });
}));

// Cuántos documentos se pueden mandar en un mismo análisis. La información de
// una póliza real casi nunca cabe en la carátula sola (viene repartida entre
// carátula, tabla de primas y anexos), así que se analizan JUNTOS en una sola
// llamada al modelo — no uno por uno: solo viéndolos a la vez puede cruzar,
// por ejemplo, la prima de la tabla con el producto de la carátula.
const MAX_DOCUMENTOS_ANALISIS = 6;

// Sube los PDF de la póliza y los analiza con IA. NO crea la Venta ni los
// DocumentoCliente aún — solo guarda los archivos temporalmente en /uploads y
// devuelve los datos extraídos para que el frontend prellene el formulario;
// los archivos se vinculan a la póliza real (y los DocumentoCliente se crean)
// hasta que el asesor confirma con POST /ventas normal (ver `documentosTmp`
// más abajo). Si el asesor cancela sin guardar, los archivos quedan huérfanos
// en disco — mismo trade-off que cualquier upload abandonado; se puede limpiar
// con un barrido periódico si llega a pesar, no es prioridad ahora.
router.post('/analizar-documento', uploadPoliza.array('archivos', MAX_DOCUMENTOS_ANALISIS), asyncHandler(async (req, res) => {
  const archivos = req.files || [];
  const limpiarTodo = () => archivos.forEach((f) => fs.unlink(f.path, () => {}));
  if (!archivos.length) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  if (!extraccionDisponible()) {
    limpiarTodo();
    return res.status(503).json({ error: 'El análisis automático no está disponible (falta configurar GEMINI_API_KEY). Puedes seguir capturando la póliza manualmente.' });
  }
  try {
    const { datos, modelo } = await analizarPolizaPdf(
      archivos.map((f) => ({ ruta: f.path, mime: f.mimetype })),
    );
    // Ya analizados desde el disco local, se mandan a su destino definitivo
    // ANTES de responder: el POST /ventas que los vincula puede llegar después
    // de un deploy, y en disco efímero ya no estarían.
    await Promise.all(archivos.map((f) => persistir(f.filename, f.mimetype)));
    res.json({
      datos,
      modelo,
      // El PRIMER archivo es el principal (la carátula): es el que queda como
      // "Documento de la póliza". Los demás se adjuntan igual a la póliza.
      documentosTmp: archivos.map((f) => ({
        archivo: f.filename,
        nombre: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        mime: f.mimetype || null,
        tamano: f.size || 0,
      })),
    });
  } catch (e) {
    limpiarTodo();
    // El detalle SÍ va al log completo (status incluido): un 404 de modelo
    // retirado y un 429 de cuota agotada se veían idénticos desde el frontend
    // y no había forma de diagnosticar el fallo sin reproducirlo a mano.
    console.error(`[ventas] análisis de póliza falló (${e.codigo || e.status || 's/status'}): ${e.message}`);
    res.status(502).json({ error: motivoAnalisisFallido(e) });
  }
}));

// Traduce el fallo técnico a algo que el asesor pueda accionar (reintentar,
// capturar a mano, o avisar a quien administra el CRM). Sin esto, un problema
// de configuración parecía un PDF ilegible.
function motivoAnalisisFallido(e) {
  const manual = 'Puedes capturar la póliza manualmente.';
  if (e.codigo === 'TIMEOUT') return `El análisis tardó demasiado y se canceló. Intenta de nuevo o captura la póliza manualmente.`;
  if (e.status === 404) return `El modelo de IA configurado ya no está disponible. Avisa a quien administra el CRM para actualizarlo. ${manual}`;
  if (e.status === 429) return `Se agotó por ahora la cuota de análisis automático. Intenta más tarde o captura la póliza manualmente.`;
  if (e.status === 401 || e.status === 403) return `La llave del servicio de análisis no es válida. Avisa a quien administra el CRM. ${manual}`;
  if (e.status === 500 || e.status === 503) return `El servicio de análisis está saturado en este momento. Intenta de nuevo en unos minutos o captura la póliza manualmente.`;
  if (e.codigo === 'SIN_RESPUESTA' || e.codigo === 'JSON_INVALIDO') return `No se pudo leer este documento (¿es la carátula de la póliza en PDF?). ${manual}`;
  return `No se pudo analizar el documento. ${manual}`;
}

// Tipo de cambio oficial del día (Banxico) para USD y UDI. También va antes
// de '/:id' por la misma razón que las dos rutas de arriba.
//
// Responde SIEMPRE 200, incluso sin BANXICO_TOKEN o con Banxico caído: el
// formulario usa esto para prellenar y para mostrar el equivalente en pesos,
// pero la captura manual del tipo de cambio sigue siendo el camino válido —
// no se bloquea el registro de una póliza porque una API externa falle.
// Comisiones por mes del año (cobradas, esperadas e ISR RESICO estimado).
// Declarada antes de /:id. Alcance: un ASESOR solo lo suyo; un promotor el
// equipo o un asesor con ?asesorId.
//  - cobrada: comisión de los recibos pagados en ese mes (PagoPoliza).
//  - esperada: comisión de los recibos que VENCEN ese mes en pólizas activas,
//    según el esquema de cada una (proyección, en pesos al TC del día).
//  - ISR RESICO: estimado sobre lo cobrado (utils/comisiones.js).
router.get('/comisiones/resumen', asyncHandler(async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const whereVenta = {};
  if (req.user.rol === 'ASESOR') whereVenta.asesorId = req.user.id;
  else if (req.query.asesorId) whereVenta.asesorId = String(req.query.asesorId);
  const desde = new Date(anio, 0, 1);
  const hasta = new Date(anio + 1, 0, 1);

  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, cobrada: 0, esperada: 0, recibosCobrados: 0, recibosEsperados: 0, pendientesDeConvertir: 0 }));

  const pagos = await prisma.pagoPoliza.findMany({
    where: { estado: 'PAGADO', fechaPago: { gte: desde, lt: hasta }, venta: whereVenta },
    select: { fechaPago: true, comisionMonto: true },
  });
  for (const p of pagos) {
    const m = meses[new Date(p.fechaPago).getMonth()];
    m.recibosCobrados += 1;
    if (p.comisionMonto == null) m.pendientesDeConvertir += 1;
    else m.cobrada += p.comisionMonto;
  }

  const vigentes = await tiposDeCambioVigentes().catch(() => ({}));
  const tcs = { USD: vigentes?.USD?.valor || null, UDI: vigentes?.UDI?.valor || null };
  const activas = await prisma.venta.findMany({
    where: { ...whereVenta, estado: { in: ['PAGADA', 'FIRMADA', 'APROBADA'] } },
    select: {
      moneda: true, primaAnual: true, primaMoneda: true, tipoCambio: true, formaPago: true, comisionPct: true,
      esquemaComision: true, fechaInicioVigencia: true, fechaEmision: true, creadoEn: true, fechaFinVigencia: true,
    },
  });
  for (const v of activas) {
    const inicio = v.fechaInicioVigencia || v.fechaEmision || v.creadoEn;
    const divisa = v.moneda && v.moneda !== 'MXN';
    const prima = divisa ? v.primaMoneda : v.primaAnual;
    const tc = divisa ? (tcs[v.moneda] || v.tipoCambio) : 1;
    if (prima == null || !tc) continue;
    const n = RECIBOS_POR_ANIO[v.formaPago] || 1;
    const tramos = v.esquemaComision?.tramos || [{ desde: 1, hasta: 1, pct: v.comisionPct || 0 }];
    // Recibos desde el inicio, avanzando por la forma de pago, hasta el fin del año consultado.
    let r = new Date(inicio);
    for (let i = 0; i < 12 * 60 && r < hasta; i += 1) {
      if (v.fechaFinVigencia && r > new Date(v.fechaFinVigencia)) break;
      if (r >= desde) {
        const pct = pctDelAnio(tramos, anioDePoliza(inicio, r));
        const m = meses[r.getMonth()];
        m.recibosEsperados += 1;
        m.esperada += (prima / n) * (pct / 100) * tc;
      }
      if (v.formaPago === 'UNICO') break;
      r = siguientePeriodo(r, v.formaPago);
    }
  }

  let acumulado = 0;
  const filas = meses.map((m) => {
    acumulado += m.cobrada;
    const isr = isrResicoMensual(m.cobrada);
    return { ...m, cobrada: +m.cobrada.toFixed(2), esperada: +m.esperada.toFixed(2), isrResico: isr.isr, tasaResico: isr.tasa };
  });
  res.json({
    anio,
    meses: filas,
    totales: {
      cobrada: +acumulado.toFixed(2),
      esperada: +filas.reduce((s, m) => s + m.esperada, 0).toFixed(2),
      isrResico: +filas.reduce((s, m) => s + m.isrResico, 0).toFixed(2),
    },
    topeResico: TOPE_RESICO_ANUAL,
    excedeTopeResico: acumulado > TOPE_RESICO_ANUAL,
  });
}));

// Vista previa del esquema de comisión mientras se captura la póliza (el
// formulario no re-declara la tabla: la pide aquí). No guarda nada.
router.post('/comisiones/preview', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const catalogo = b.productoCatalogoId
    ? await prisma.productoCatalogo.findUnique({ where: { id: b.productoCatalogoId }, select: { nombre: true } })
    : null;
  const cliente = b.clienteId
    ? await prisma.cliente.findUnique({ where: { id: b.clienteId }, select: { fechaNacimiento: true, asesorId: true } })
    : null;
  if (cliente && req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  const ventaLike = {
    producto: b.producto,
    moneda: moneda(b.moneda),
    primaAnual: b.primaAnual != null && b.primaAnual !== '' ? +b.primaAnual : null,
    primaMoneda: b.primaMoneda != null && b.primaMoneda !== '' ? +b.primaMoneda : null,
    tipoCambio: null,
    formaPago: Object.keys(RECIBOS_POR_ANIO).includes(b.formaPago) ? b.formaPago : 'ANUAL',
    comisionPct: b.comisionPct != null && b.comisionPct !== '' ? +b.comisionPct : null,
    sumaAsegurada: b.sumaAsegurada != null && b.sumaAsegurada !== '' ? +b.sumaAsegurada : null,
    sumaAseguradaMoneda: moneda(b.sumaAseguradaMoneda || b.moneda),
    asegurados: limpiarAsegurados(b.asegurados),
    fechaInicioVigencia: b.fechaInicioVigencia ? new Date(b.fechaInicioVigencia) : null,
    fechaFinVigencia: b.fechaFinVigencia ? new Date(b.fechaFinVigencia) : null,
  };
  ventaLike.esquemaComision = esquemaParaPoliza(ventaLike, { nombreProducto: catalogo?.nombre, cliente });
  if (ventaLike.esquemaComision) ventaLike.comisionPct = pctDelAnio(ventaLike.esquemaComision.tramos, 1);
  res.json(await proyeccionPoliza(ventaLike, cliente));
}));

router.get('/tipo-cambio', asyncHandler(async (_req, res) => {
  res.json(await tiposDeCambioVigentes());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const venta = await prisma.venta.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true, apellidoM: true, telefono: true, email: true, rfc: true, direccion: true, fechaNacimiento: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true, email: true, telefono: true, claveAgente: true } },
      validador: { select: { id: true, nombre: true } },
      productoCatalogo: true,
      recordatoriosPago: { orderBy: { fechaAviso: 'asc' } },
      pagos: { orderBy: { periodo: 'desc' }, include: { registrador: { select: { id: true, nombre: true, apellidoP: true } } } },
      documentoPoliza: { select: { id: true, nombre: true, mime: true, tamano: true, creadoEn: true } },
      // Todos los documentos adjuntos a la póliza (incluido el principal): una
      // póliza real llega repartida en varios PDFs y todos quedan guardados.
      documentos: {
        select: { id: true, nombre: true, mime: true, tamano: true, creadoEn: true },
        orderBy: { creadoEn: 'asc' },
      },
    },
  });
  if (!venta) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = venta.asesorId === req.user.id;
  const isAdmin = tieneRolAdmin(req.user);
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });
  res.json({ ...venta, montoEsperado: montoEsperadoDePoliza(venta) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    clienteId, ramo, producto, primaAnual, comisionPct, estado, notas,
    productoCatalogoId, fechaFirma, fechaEmision, fechaPago, fechaEntregaPoliza,
    formaPago, fechaInicioVigencia, fechaFinVigencia, fechaProximoPago, diaPago, montoPago,
    montoPagoMoneda,
    sumaAsegurada, sumaAseguradaMoneda, sumaAseguradaTC, plazo, deducible, deducibleMoneda,
    coaseguro, coberturas, beneficiarios,
    contratante, numeroPoliza, situacion, plan, redMedica, asegurados,
    moneda: monedaBody, primaMoneda, tipoCambio, domiciliada, metodoPago,
    documentosTmp,
  } = req.body || {};
  // Archivos ya subidos por POST /ventas/analizar-documento (uno o varios).
  // El primero es el principal (la carátula) y queda además como
  // `documentoPolizaId`; el resto se adjunta igual a la póliza.
  const documentos = (Array.isArray(documentosTmp) ? documentosTmp : [])
    .filter((d) => d && d.archivo)
    .slice(0, MAX_DOCUMENTOS_ANALISIS);
  const modeloExtraccion = documentos.find((d) => d.modelo)?.modelo || null;
  // Con moneda extranjera la prima viaja en `primaMoneda` (su denominación
  // original) y `primaAnual` en MXN la calcula resolverPrima más abajo — por
  // eso aquí basta con que venga alguna de las dos.
  const primaCapturada = primaAnual != null ? primaAnual : primaMoneda;
  if (!clienteId || !ramo || !producto || primaCapturada == null) return res.status(400).json({ error: 'clienteId, ramo, producto y prima anual son requeridos' });
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(400).json({ error: 'Cliente no encontrado' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || cliente.asesorId);
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'El cliente pertenece a otro asesor' });

  // Si viene productoCatalogoId, pero no producto/comisionPct, pre-puebla desde el catálogo
  let catalogo = null;
  if (productoCatalogoId) {
    catalogo = await prisma.productoCatalogo.findUnique({ where: { id: productoCatalogoId } });
  }
  const divisa = await resolverPrima({ moneda: monedaBody, primaAnual, primaMoneda, tipoCambio });
  if (divisa.error) return res.status(400).json({ error: divisa.error });
  // Esquema de comisión de toda la vida de la póliza (utils/comisiones.js).
  // Si el producto tiene tabla, el % del año 1 sale de ahí (variante por
  // moneda, suma asegurada y edad) y manda sobre lo que mande el formulario;
  // sin tabla (GMM, SeguBeca, personalizado) se usa el % capturado.
  const esquema = esquemaParaPoliza({
    producto, moneda: divisa.moneda, sumaAsegurada, sumaAseguradaMoneda: moneda(sumaAseguradaMoneda),
    asegurados: limpiarAsegurados(asegurados),
    fechaInicioVigencia: fechaInicioVigencia ? new Date(fechaInicioVigencia) : null,
  }, { nombreProducto: catalogo?.nombre, cliente });
  const pctFinal = esquema ? pctDelAnio(esquema.tramos, 1) : (comisionPct ?? (catalogo?.comisionPct ?? 10));
  const comisionMontoFinal = +(divisa.primaAnual * pctFinal / 100).toFixed(2);

  // Los documentos vienen de POST /ventas/analizar-documento: los archivos ya
  // están en /uploads pero los DocumentoCliente aún no existen. Se crean aquí,
  // dentro de la misma transacción que la Venta, para que un fallo a medio
  // camino no deje documentos huérfanos sin póliza ni una póliza sin sus PDF.
  //
  // Orden: primero la Venta, luego los documentos con `ventaId` (necesitan el
  // id de la póliza), y al final se marca el primero como el principal
  // (`documentoPolizaId`, la tarjeta "Documento de la póliza" de siempre).
  const venta = await prisma.$transaction(async (tx) => {
    const creada = await tx.venta.create({
      data: {
        asesorId, clienteId, ramo, producto,
        // La ficha lo prellena con el nombre del cliente y se guarda tal cual
        // (es el nombre que quedó en el contrato, no un espejo vivo de la
        // ficha). Null = pólizas anteriores a este campo: ahí se muestra el
        // nombre del cliente como respaldo.
        contratante: texto(contratante),
        numeroPoliza: texto(numeroPoliza, 60),
        situacion: situacionValida(situacion),
        primaAnual: divisa.primaAnual,
        moneda: divisa.moneda, primaMoneda: divisa.primaMoneda, tipoCambio: divisa.tipoCambio,
        comisionPct: pctFinal, comisionMonto: comisionMontoFinal,
        esquemaComision: esquema || undefined,
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
        montoPagoMoneda: moneda(montoPagoMoneda),
        sumaAsegurada: sumaAsegurada ?? null,
        sumaAseguradaMoneda: moneda(sumaAseguradaMoneda),
        sumaAseguradaTC: sumaAseguradaTC != null && +sumaAseguradaTC > 0 ? +sumaAseguradaTC : null,
        plazo: plazo || null,
        plan: texto(plan, 80),
        // Red médica: dato exclusivo de GMM; en otros ramos no se guarda
        // aunque el cliente mande el campo.
        redMedica: ramo === 'GMM' ? texto(redMedica, 120) : null,
        deducible: deducible ?? null,
        deducibleMoneda: moneda(deducibleMoneda),
        coaseguro: coaseguro || null,
        coberturas: limpiarCoberturas(coberturas),
        asegurados: limpiarAsegurados(asegurados),
        beneficiarios: limpiarBeneficiarios(beneficiarios),
        extraccionEn: modeloExtraccion ? new Date() : null,
        extraccionModelo: modeloExtraccion,
        extraccionConfirmada: Boolean(modeloExtraccion),
      },
      include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } },
    });

    let principalId = null;
    for (const d of documentos) {
      // Un archivo que ya no está en disco (subida abandonada y limpiada) se
      // salta en silencio: la póliza se guarda igual, sin ese adjunto.
      if (!(await existe(d.archivo))) continue;
      const doc = await tx.documentoCliente.create({
        data: {
          clienteId, asesorId: req.user.id, ventaId: creada.id,
          nombre: String(d.nombre || 'Póliza.pdf').slice(0, 200),
          archivo: path.basename(d.archivo),
          mime: d.mime || null,
          tamano: d.tamano || 0,
        },
      });
      if (!principalId) principalId = doc.id;
    }
    if (!principalId) return creada;
    return tx.venta.update({
      where: { id: creada.id },
      data: { documentoPolizaId: principalId },
      include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } },
    });
  });
  // Dada de alta ya pagada: el primer recibo queda registrado con su comisión
  // (y fija el siguiente recibo si no se capturó).
  await registrarPrimerPagoSiAplica(venta, { registradoPor: req.user.id });
  // Sincroniza recordatorio de pago
  const ventaFinal = await prisma.venta.findUnique({ where: { id: venta.id }, include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } } });
  await sincronizarRecordatorioPago(ventaFinal);
  await registrarActividad(asesorId, 'POLIZA_CREADA', {
    ventaId: venta.id,
    clienteId: venta.cliente?.id || clienteId,
    cliente: venta.cliente ? `${venta.cliente.nombre} ${venta.cliente.apellidoP}` : null,
    producto, ramo, prima: divisa.primaAnual,
  });
  res.status(201).json(ventaFinal);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.venta.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Póliza no encontrada' });
  const esDueno = existente.asesorId === req.user.id;
  const isAdmin = tieneRolAdmin(req.user);
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });

  const {
    ramo, producto, primaAnual, comisionPct, estado, notas,
    productoCatalogoId, fechaFirma, fechaEmision, fechaPago, fechaEntregaPoliza,
    fechaCancelacion, montoCancelado, motivoCancelacion,
    formaPago, fechaInicioVigencia, fechaFinVigencia, fechaProximoPago, diaPago, montoPago,
    montoPagoMoneda,
    sumaAsegurada, sumaAseguradaMoneda, sumaAseguradaTC, plazo, deducible, deducibleMoneda,
    coaseguro, coberturas, beneficiarios,
    contratante, numeroPoliza, situacion, plan, redMedica, asegurados,
    moneda: monedaBody, primaMoneda, tipoCambio, domiciliada, metodoPago,
  } = req.body || {};
  const data = {};
  if (ramo) data.ramo = ramo;
  if (producto) data.producto = producto;
  if (productoCatalogoId !== undefined) data.productoCatalogoId = productoCatalogoId || null;
  // La moneda y la prima se resuelven juntas: cambiar el monto original o la
  // moneda debe recalcular la prima en pesos. OJO: el formulario reenvía
  // `moneda`/`primaMoneda` en CADA guardado aunque el asesor no haya tocado
  // esos campos (son parte fija del payload) — si eso disparara siempre un
  // nuevo `resolverPrima()`, cada edición trivial (solo cambiar el estado, por
  // ejemplo) volvería a consultar el tipo de cambio del día y movería
  // `primaAnual` sin que el asesor lo pidiera. Por eso solo se recalcula
  // cuando el monto/moneda originales REALMENTE cambiaron, o cuando llega un
  // `tipoCambio` explícito (ajuste manual de una paridad histórica).
  const monedaCambio = monedaBody !== undefined && monedaBody !== existente.moneda;
  const primaMonedaCambio = primaMoneda !== undefined && Number(primaMoneda) !== Number(existente.primaMoneda);
  const primaAnualCambio = primaAnual != null && Number(primaAnual) !== Number(existente.primaAnual);
  if (monedaCambio || primaMonedaCambio || primaAnualCambio || tipoCambio !== undefined) {
    const divisa = await resolverPrima({
      moneda: monedaBody !== undefined ? monedaBody : existente.moneda,
      primaAnual: primaAnual != null ? primaAnual : existente.primaAnual,
      primaMoneda: primaMoneda !== undefined ? primaMoneda : existente.primaMoneda,
      tipoCambio: tipoCambio !== undefined ? tipoCambio : (monedaCambio || primaMonedaCambio ? undefined : existente.tipoCambio),
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
  if (montoPagoMoneda !== undefined) data.montoPagoMoneda = moneda(montoPagoMoneda);
  if (sumaAsegurada !== undefined) data.sumaAsegurada = sumaAsegurada ?? null;
  if (sumaAseguradaMoneda !== undefined) data.sumaAseguradaMoneda = moneda(sumaAseguradaMoneda);
  if (sumaAseguradaTC !== undefined) data.sumaAseguradaTC = sumaAseguradaTC != null && +sumaAseguradaTC > 0 ? +sumaAseguradaTC : null;
  if (plazo !== undefined) data.plazo = plazo || null;
  if (deducible !== undefined) data.deducible = deducible ?? null;
  if (deducibleMoneda !== undefined) data.deducibleMoneda = moneda(deducibleMoneda);
  if (coaseguro !== undefined) data.coaseguro = coaseguro || null;
  if (coberturas !== undefined) data.coberturas = limpiarCoberturas(coberturas);
  if (asegurados !== undefined) data.asegurados = limpiarAsegurados(asegurados);
  if (beneficiarios !== undefined) data.beneficiarios = limpiarBeneficiarios(beneficiarios);
  if (contratante !== undefined) data.contratante = texto(contratante);
  if (numeroPoliza !== undefined) data.numeroPoliza = texto(numeroPoliza, 60);
  if (situacion !== undefined) data.situacion = situacionValida(situacion);
  if (plan !== undefined) data.plan = texto(plan, 80);
  // Red médica: dato exclusivo de GMM. Se limpia en cuanto el ramo deja de
  // ser GMM aunque el cliente no mande el campo — dejarla colgando describiría
  // un plan que esa póliza ya no tiene.
  const ramoFinal = ramo || existente.ramo;
  if (ramoFinal !== 'GMM') data.redMedica = null;
  else if (redMedica !== undefined) data.redMedica = texto(redMedica, 120);
  if (estado) {
    data.estado = estado;
    if (estado === 'APROBADA' || estado === 'RECHAZADA') {
      data.validadoPor = req.user.id;
      data.fechaValidacion = new Date();
    }
  }
  if (notas !== undefined) data.notas = notas || null;
  let venta = await prisma.venta.update({ where: { id }, data, include: { productoCatalogo: { select: { nombre: true } }, cliente: { select: { fechaNacimiento: true } } } });
  // El esquema de comisión se recalcula con los datos ya guardados (cambiar
  // moneda, suma asegurada, producto o asegurados puede cambiar la variante).
  // Con tabla, el % del año 1 sale del esquema; sin tabla, se respeta el
  // capturado.
  const esquema = esquemaParaPoliza(venta, { nombreProducto: venta.productoCatalogo?.nombre, cliente: venta.cliente });
  const pctAnio1 = esquema ? pctDelAnio(esquema.tramos, 1) : venta.comisionPct;
  venta = await prisma.venta.update({
    where: { id },
    data: {
      esquemaComision: esquema || Prisma.DbNull,
      comisionPct: pctAnio1,
      comisionMonto: +(venta.primaAnual * pctAnio1 / 100).toFixed(2),
    },
  });
  // Pasó a pagada/aprobada sin ningún recibo registrado: el primero ya se cobró.
  const primerPago = await registrarPrimerPagoSiAplica(venta, { registradoPor: req.user.id });
  // Sincroniza recordatorio si cambió fechaProximoPago, formaPago o la
  // domiciliación (domiciliar una póliza debe borrar su recordatorio abierto).
  if (primerPago || fechaProximoPago !== undefined || formaPago !== undefined || domiciliada !== undefined) {
    const ventaConCliente = await prisma.venta.findUnique({ where: { id }, include: { cliente: { select: { nombre: true, apellidoP: true } } } });
    await sincronizarRecordatorioPago(ventaConCliente);
  }
  res.json(venta);
}));

// Adjunta un PDF a una póliza ya existente — para pólizas creadas a mano que
// luego reciben el documento de la compañía, o para sumar un anexo a las que
// ya tienen carátula. Sin análisis con IA: es solo el archivo, igual que
// POST /documentos pero vinculado a la póliza en vez de suelto en la ficha
// del cliente.
router.post('/:id/documento', uploadPoliza.single('archivo'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const existente = await prisma.venta.findUnique({ where: { id } });
  if (!existente) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Póliza no encontrada' });
  }
  const esDueno = existente.asesorId === req.user.id;
  const isAdmin = tieneRolAdmin(req.user);
  if (!esDueno && !isAdmin) {
    fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Sin acceso a esta póliza' });
  }
  const nombreOriginal = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  await persistir(req.file.filename, req.file.mimetype);
  const venta = await prisma.$transaction(async (tx) => {
    const doc = await tx.documentoCliente.create({
      data: {
        clienteId: existente.clienteId, asesorId: req.user.id, ventaId: id,
        nombre: nombreOriginal, archivo: req.file.filename,
        mime: req.file.mimetype || null, tamano: req.file.size || 0,
      },
    });
    // Solo se vuelve el documento PRINCIPAL si la póliza no tenía uno: si ya
    // hay carátula, esto es un anexo más y no debe desplazarla de la tarjeta.
    // El documento anterior nunca se borra solo — mismo criterio conservador
    // que el resto del sistema con archivos (se borra desde el menú ⋯).
    if (existente.documentoPolizaId) return tx.venta.findUnique({ where: { id } });
    return tx.venta.update({ where: { id }, data: { documentoPolizaId: doc.id } });
  });
  res.status(201).json(venta);
}));

// Acceso dueño-o-admin a una póliza (mismo criterio que el resto del router).
async function polizaConAcceso(req, res) {
  const venta = await prisma.venta.findUnique({ where: { id: req.params.id }, include: { cliente: { select: { fechaNacimiento: true } } } });
  if (!venta) { res.status(404).json({ error: 'Póliza no encontrada' }); return null; }
  if (venta.asesorId !== req.user.id && !tieneRolAdmin(req.user)) { res.status(403).json({ error: 'Sin acceso a esta póliza' }); return null; }
  return venta;
}

// Comisión de la póliza en toda su vida: esquema, proyección año por año
// (anual y por recibo según la forma de pago), lo cobrado y el historial de
// recibos pagados.
router.get('/:id/comisiones', asyncHandler(async (req, res) => {
  const venta = await polizaConAcceso(req, res);
  if (!venta) return;
  const resumen = await resumenComisionPoliza(venta, venta.cliente);
  const pagos = await prisma.pagoPoliza.findMany({
    where: { ventaId: venta.id },
    orderBy: { periodo: 'desc' },
    include: { registrador: { select: { nombre: true, apellidoP: true } } },
  });
  res.json({ ...resumen, pagos, montoEsperado: montoEsperadoDeRecibo(venta) });
}));

// Registrar un pago HISTÓRICO (o cualquier recibo puntual): para pólizas que
// ya llevaban tiempo cuando se capturaron. No mueve fechaProximoPago — eso lo
// hace "Confirmar cobro" con el recibo en curso.
router.post('/:id/pagos', asyncHandler(async (req, res) => {
  const venta = await polizaConAcceso(req, res);
  if (!venta) return;
  const { periodo, fechaPago, montoPagado, justificacion } = req.body || {};
  const p = periodo ? new Date(periodo) : null;
  if (!p || Number.isNaN(p.getTime())) return res.status(400).json({ error: 'Indica el periodo (fecha del recibo)' });
  const f = fechaPago ? new Date(fechaPago) : p;
  if (Number.isNaN(f.getTime()) || f > new Date(Date.now() + 86400000)) return res.status(400).json({ error: 'La fecha de pago no puede ser futura' });
  const monto = montoPagado === undefined || montoPagado === null || montoPagado === '' ? null : +montoPagado;
  if (monto != null && (Number.isNaN(monto) || monto < 0)) return res.status(400).json({ error: 'Monto pagado inválido' });
  const { pago, duplicado } = await registrarPagoConComision(venta, {
    periodo: p, fechaPago: f, montoPagado: monto, justificacion, registradoPor: req.user.id,
  });
  if (duplicado) return res.status(409).json({ error: 'Ese recibo ya estaba registrado como pagado' });
  res.status(201).json(pago);
}));

// Corregir un recibo ya registrado: periodo, fecha, monto, nota y su
// comisión. `comisionManual: true` + `comisionMonto` (MXN) fija la comisión a
// mano (el asesor la conoce por su estado de cuenta) y nadie la recalcula
// después; `comisionManual: false` la regresa al cálculo de la tabla.
router.patch('/:id/pagos/:pagoId', asyncHandler(async (req, res) => {
  const venta = await polizaConAcceso(req, res);
  if (!venta) return;
  const pago = await prisma.pagoPoliza.findFirst({ where: { id: req.params.pagoId, ventaId: venta.id } });
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  const b = req.body || {};
  const data = {};

  if (b.periodo !== undefined) {
    const p = new Date(b.periodo);
    if (Number.isNaN(p.getTime())) return res.status(400).json({ error: 'Periodo inválido' });
    data.periodo = p;
  }
  if (b.fechaPago !== undefined) {
    const f = new Date(b.fechaPago);
    if (Number.isNaN(f.getTime()) || f > new Date(Date.now() + 86400000)) return res.status(400).json({ error: 'La fecha de pago no puede ser futura' });
    data.fechaPago = f;
  }
  if (b.montoPagado !== undefined) {
    const m = b.montoPagado === null || b.montoPagado === '' ? null : +b.montoPagado;
    if (m != null && (Number.isNaN(m) || m < 0)) return res.status(400).json({ error: 'Monto pagado inválido' });
    data.montoPagado = m;
  }
  if (b.justificacion !== undefined) data.justificacion = String(b.justificacion || '').trim().slice(0, 300) || null;

  const periodo = data.periodo || pago.periodo;
  const montoPagado = data.montoPagado !== undefined ? data.montoPagado : pago.montoPagado;
  const manual = b.comisionManual !== undefined ? Boolean(b.comisionManual) : pago.comisionManual;

  if (manual) {
    // Si llega monto nuevo se usa; si no, solo se conserva el de un recibo que
    // ya era manual (pasar de automática a manual exige capturarlo).
    const monto = b.comisionMonto !== undefined && b.comisionMonto !== null && b.comisionMonto !== ''
      ? +b.comisionMonto
      : (pago.comisionManual ? pago.comisionMonto : null);
    if (monto == null || Number.isNaN(monto) || monto < 0) return res.status(400).json({ error: 'Captura la comisión de este recibo' });
    const pct = b.comisionPct !== undefined && b.comisionPct !== null && b.comisionPct !== '' ? +b.comisionPct : (b.comisionPct === undefined ? pago.comisionPct : null);
    if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) return res.status(400).json({ error: 'Porcentaje inválido' });
    Object.assign(data, {
      comisionManual: true,
      comisionMonto: +monto.toFixed(2),
      comisionPct: pct,
      anioPoliza: anioDePoliza(venta.fechaInicioVigencia || venta.fechaEmision || venta.creadoEn, periodo),
      tipoCambio: null,
    });
  } else {
    Object.assign(data, { comisionManual: false }, await comisionAutomatica(venta, {
      periodo, montoEsperado: pago.montoEsperado, montoPagado,
    }));
  }

  const actualizado = await prisma.pagoPoliza.update({ where: { id: pago.id }, data });
  res.json(actualizado);
}));

// Recibos vencidos desde la emisión que todavía no están registrados como
// pagados (para pólizas capturadas tarde). Solo lectura: la UI los enseña
// antes de confirmarlos.
router.get('/:id/pagos/faltantes', asyncHandler(async (req, res) => {
  const venta = await polizaConAcceso(req, res);
  if (!venta) return;
  const faltan = await recibosFaltantes(venta);
  res.json({ periodos: faltan, montoEsperado: montoEsperadoDeRecibo(venta) });
}));

// Registra como pagados los recibos vencidos que falten (todos, o los
// `periodos` que mande la UI tras desmarcar alguno). Cada uno con su comisión
// del año de póliza que le toca. Deja el próximo pago en el primer recibo que
// aún no vence, si estaba atrasado.
router.post('/:id/pagos/completar', asyncHandler(async (req, res) => {
  const venta = await polizaConAcceso(req, res);
  if (!venta) return;
  const faltan = await recibosFaltantes(venta);
  const elegidos = Array.isArray(req.body?.periodos)
    ? faltan.filter((f) => req.body.periodos.some((x) => new Date(x).getTime() === f.getTime()))
    : faltan;
  const creados = [];
  for (const periodo of elegidos) {
    const { pago } = await registrarPagoConComision(venta, {
      periodo,
      fechaPago: periodo,
      registradoPor: req.user.id,
      justificacion: 'Recibo anterior (completado desde la emisión)',
    });
    if (pago) creados.push(pago);
  }

  // Próximo pago: el primer recibo después del último pagado, si el que había
  // ya quedó cubierto o no existía.
  if (creados.length && venta.formaPago !== 'UNICO') {
    const ultimo = await prisma.pagoPoliza.findFirst({
      where: { ventaId: venta.id, estado: 'PAGADO' }, orderBy: { periodo: 'desc' },
    });
    const actual = venta.fechaProximoPago ? new Date(venta.fechaProximoPago) : null;
    if (ultimo && (!actual || actual <= new Date(ultimo.periodo))) {
      const sig = siguientePeriodo(ultimo.periodo, venta.formaPago);
      const fin = venta.fechaFinVigencia ? new Date(venta.fechaFinVigencia) : null;
      const proxima = sig && (!fin || sig <= fin) ? sig : null;
      // Los avisos de cobro de recibos que ya quedaron pagados se cierran.
      await prisma.nota.updateMany({
        where: { ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', completada: false },
        data: { completada: true, notificacionEnviada: true, avisoPrevioEnviado: true },
      });
      await prisma.venta.update({ where: { id: venta.id }, data: { fechaProximoPago: proxima } });
      if (proxima) {
        const v = await prisma.venta.findUnique({ where: { id: venta.id }, include: { cliente: { select: { nombre: true, apellidoP: true } } } });
        await sincronizarRecordatorioPago(v);
      }
    }
  }
  res.status(201).json({ registrados: creados.length });
}));

// Borrar un recibo capturado por error (dueño o admin). Físico: es un
// registro de cobro mal hecho, no historia que conservar.
router.delete('/:id/pagos/:pagoId', asyncHandler(async (req, res) => {
  const venta = await polizaConAcceso(req, res);
  if (!venta) return;
  const r = await prisma.pagoPoliza.deleteMany({ where: { id: req.params.pagoId, ventaId: venta.id } });
  if (!r.count) return res.status(404).json({ error: 'Pago no encontrado' });
  res.json({ ok: true });
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
  const isAdmin = tieneRolAdmin(req.user);
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });

  const { montoPagado, justificacion } = req.body || {};
  const pagado = montoPagado === undefined || montoPagado === null || montoPagado === ''
    ? null
    : +montoPagado;
  if (pagado != null && (Number.isNaN(pagado) || pagado < 0)) {
    return res.status(400).json({ error: 'Monto pagado inválido' });
  }

  // Historial de cobros (fuente del semáforo de pagos) con la comisión que
  // generó este recibo según el año de póliza (utils/comisionesPoliza.js).
  const { duplicado } = await registrarPagoConComision(venta, {
    periodo: venta.fechaProximoPago ? new Date(venta.fechaProximoPago) : new Date(),
    montoPagado: pagado,
    justificacion,
    registradoPor: req.user.id,
  });
  if (duplicado) return res.status(409).json({ error: 'Ese recibo ya estaba registrado como pagado' });

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
  const isAdmin = tieneRolAdmin(req.user);
  if (!esDueno && !isAdmin) return res.status(403).json({ error: 'Sin acceso a esta póliza' });
  await prisma.venta.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
