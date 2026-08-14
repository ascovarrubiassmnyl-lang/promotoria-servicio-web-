import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteAlguna } from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteAlguna('dashboard', 'asesores'));

function inicioMes(mes, anio) {
  return new Date(anio, mes - 1, 1);
}
function finMes(mes, anio) {
  return new Date(anio, mes, 0, 23, 59, 59, 999);
}

// Definiciones únicas del dashboard (mismas fuentes que Pólizas/Metas):
//  - Venta "ganada" = APROBADA/PAGADA creada en el periodo (= Pólizas y Metas).
//  - "Comisión ganada" = comisionMonto de esas ventas. "Comisión en pipeline" =
//    comisionMonto de PENDIENTE_PAGAR/FIRMADA vigentes. Nunca se suman.
//  - La única "tasa de conversión" es la del embudo (entre etapas, en /funnel);
//    la de referidos se llama "tasa de referidos" y vive solo en su tarjeta.
const GANADA = ['APROBADA', 'PAGADA'];
const PIPELINE = ['PENDIENTE_PAGAR', 'FIRMADA'];

router.get('/dashboard', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const asesorIdFiltro = esAsesor ? req.user.id : req.query.asesorId;
  const ahora = new Date();
  const mes = parseInt(req.query.mes) || (ahora.getMonth() + 1);
  const anio = parseInt(req.query.anio) || ahora.getFullYear();
  const ini = inicioMes(mes, anio);
  const fin = finMes(mes, anio);
  const hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const hoyFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);

  const whereAsesor = esAsesor ? { asesorId: req.user.id } : (asesorIdFiltro ? { asesorId: asesorIdFiltro } : {});
  const wherePeriodo = { creadoEn: { gte: ini, lte: fin } };

  const [
    totalClientes, clientesMes, citasPeriodo, citasCompletadasMes,
    ventasAprobadas, ventasPendientes, primaAnualTotal, comisionPipeline,
    pendientesPagoPrima, citasHoy, seguimiento, polizasMesPorEstado,
    referidosMes, referidosConvertidosMes, bonosCobrados, bonosPorGanar,
  ] = await Promise.all([
    prisma.cliente.count({ where: { ...whereAsesor, archivadoEn: null } }),
    prisma.cliente.count({ where: { ...whereAsesor, archivadoEn: null, creadoEn: wherePeriodo.creadoEn } }),
    // Los eventos personales (clasificacion PERSONAL, sin cliente) no cuentan
    // como citas de trabajo en ninguna métrica.
    prisma.cita.count({ where: { ...whereAsesor, clasificacion: { not: 'PERSONAL' }, fechaHoraInicio: { gte: ini, lte: fin } } }),
    prisma.cita.count({ where: { ...whereAsesor, clasificacion: { not: 'PERSONAL' }, estado: 'COMPLETADA', fechaHoraInicio: { gte: ini, lte: fin } } }),
    prisma.venta.count({ where: { ...whereAsesor, estado: { in: GANADA }, ...wherePeriodo } }),
    prisma.venta.count({ where: { ...whereAsesor, estado: 'PENDIENTE_PAGAR' } }),
    prisma.venta.aggregate({ where: { ...whereAsesor, estado: { in: GANADA }, ...wherePeriodo }, _sum: { primaAnual: true, comisionMonto: true } }),
    prisma.venta.aggregate({ where: { ...whereAsesor, estado: { in: PIPELINE } }, _sum: { comisionMonto: true } }),
    prisma.venta.aggregate({ where: { ...whereAsesor, estado: 'PENDIENTE_PAGAR' }, _sum: { primaAnual: true } }),
    prisma.cita.count({ where: { ...whereAsesor, clasificacion: { not: 'PERSONAL' }, estado: { in: ['PROGRAMADA', 'CONFIRMADA'] }, fechaHoraInicio: { gte: hoyIni, lte: hoyFin } } }),
    prisma.cliente.count({ where: { ...whereAsesor, archivadoEn: null, necesitaSeguimiento: true } }),
    prisma.venta.groupBy({ by: ['estado'], where: { ...whereAsesor, ...wherePeriodo }, _count: { _all: true } }),
    prisma.referido.count({ where: { ...whereAsesor, creadoEn: wherePeriodo.creadoEn } }),
    prisma.referido.count({ where: { ...whereAsesor, estado: 'CONVERTIDO', creadoEn: wherePeriodo.creadoEn } }),
    prisma.bono.aggregate({ where: { ...whereAsesor, mes, anio, estado: 'COBRADO' }, _sum: { monto: true }, _count: { _all: true } }),
    prisma.bono.aggregate({ where: { ...whereAsesor, mes, anio, estado: 'PENDIENTE' }, _sum: { monto: true }, _count: { _all: true } }),
  ]);

  // Meta del periodo: el asesor recibe SOLO su Target; el promotor la meta de
  // promotoría (TargetEquipo). Un asesor nunca recibe metas ni datos ajenos.
  const meta = esAsesor
    ? await prisma.target.findUnique({ where: { asesorId_mes_anio: { asesorId: req.user.id, mes, anio } } })
    : await prisma.targetEquipo.findUnique({ where: { mes_anio: { mes, anio } } });

  const resultado = {
    mes, anio, totalClientes, clientesMes, citasPeriodo, citasCompletadasMes,
    ventasAprobadas, ventasPendientes,
    primaAnualTotal: primaAnualTotal._sum.primaAnual || 0,
    comisionTotal: primaAnualTotal._sum.comisionMonto || 0,
    comisionPipeline: comisionPipeline._sum.comisionMonto || 0,
    meta: meta ? { prima: meta.metaPrimaMonto, ventas: meta.metaVentasNum } : null,
    atencion: {
      pendientesPago: { count: ventasPendientes, prima: pendientesPagoPrima._sum.primaAnual || 0 },
      citasHoy,
      seguimiento,
      bonosPorGanar: { monto: bonosPorGanar._sum.monto || 0, count: bonosPorGanar._count._all },
    },
    polizasMes: Object.fromEntries(polizasMesPorEstado.map((e) => [e.estado, e._count._all])),
    referidosMes: { total: referidosMes, convertidos: referidosConvertidosMes },
    bonosMes: {
      cobrados: { monto: bonosCobrados._sum.monto || 0, count: bonosCobrados._count._all },
      porGanar: { monto: bonosPorGanar._sum.monto || 0, count: bonosPorGanar._count._all },
    },
  };

  if (!esAsesor) {
    const [asesores, targetsMes] = await Promise.all([
      prisma.usuario.findMany({
        where: { rol: 'ASESOR', activo: true },
        select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true },
      }),
      prisma.target.findMany({ where: { mes, anio } }),
    ]);
    const metaPor = Object.fromEntries(targetsMes.map((t) => [t.asesorId, t.metaPrimaMonto]));
    const ranking = await Promise.all(asesores.map(async (a) => {
      const [ventas, prima, clientes, citas] = await Promise.all([
        prisma.venta.count({ where: { asesorId: a.id, estado: { in: GANADA }, ...wherePeriodo } }),
        prisma.venta.aggregate({ where: { asesorId: a.id, estado: { in: GANADA }, ...wherePeriodo }, _sum: { primaAnual: true } }),
        prisma.cliente.count({ where: { asesorId: a.id, archivadoEn: null } }),
        prisma.cita.count({ where: { asesorId: a.id, clasificacion: { not: 'PERSONAL' }, fechaHoraInicio: { gte: ini, lte: fin } } }),
      ]);
      return { id: a.id, nombre: `${a.nombre} ${a.apellidoP}`, email: a.email, ventas, prima: prima._sum.primaAnual || 0, clientes, citas, metaPrima: metaPor[a.id] ?? null };
    }));
    ranking.sort((x, y) => y.prima - x.prima);
    resultado.ranking = ranking;
    resultado.totalAsesores = asesores.length;
  }

  res.json(resultado);
}));

router.get('/tendencia', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const where = { estado: { in: ['APROBADA', 'PAGADA'] }, AND: [{ creadoEn: { gte: new Date(anio, 0, 1) } }, { creadoEn: { lte: new Date(anio, 11, 31, 23, 59, 59) } }] };
  if (esAsesor) where.asesorId = req.user.id;
  else if (req.query.asesorId) where.asesorId = req.query.asesorId;

  const ventas = await prisma.venta.findMany({ where, select: { primaAnual: true, creadoEn: true } });
  const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, prima: 0, numero: 0 }));
  for (const v of ventas) {
    const m = v.creadoEn.getMonth();
    porMes[m].prima += v.primaAnual;
    porMes[m].numero += 1;
  }
  res.json(porMes);
}));

router.get('/funnel', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const whereC = esAsesor ? { asesorId: req.user.id } : (req.query.asesorId ? { asesorId: req.query.asesorId } : {});
  const porEstado = await prisma.cliente.groupBy({ by: ['estado'], where: { ...whereC, archivadoEn: null }, _count: { _all: true } });
  // Solo etapas reales del embudo: "necesita seguimiento" es una bandera aparte
  const orden = ['PROSPECTO', 'CITA', 'PROPUESTA', 'CIERRE_FIRMA', 'ENTREGA_POLIZA', 'REFERIDOS', 'POST_VENTA_SEGUIMIENTO'];
  const mapa = Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all]));
  res.json(orden.map((k) => ({ etapa: k, count: mapa[k] || 0 })));
}));

// Embudo de ACTIVIDAD del periodo (distinto de /funnel, que fotografía en qué
// etapa está parado cada cliente hoy): cuenta lo que realmente pasó en el mes
// —prospectos abordados, llamadas, citas agendadas, citas asistidas,
// propuestas, firmas y pagos— para medir la tasa de cierre por el embudo
// completo y no solo por el dinero que entró.
//
// Cada nivel usa la MISMA definición que su módulo dueño: llamadas =
// actividad LLAMADA (igual que Metas), citas = Cita excluyendo PERSONAL
// (igual que Metas y Dashboard), firmas/pagos = estados de Venta (igual que
// Pólizas). No se inventa ningún conteo nuevo.
router.get('/funnel-actividad', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const asesorId = esAsesor ? req.user.id : (req.query.asesorId || null);
  const scope = asesorId ? { asesorId } : {};

  const ahora = new Date();
  const mes = parseInt(req.query.mes) || (ahora.getMonth() + 1);
  const anio = parseInt(req.query.anio) || ahora.getFullYear();
  const ini = new Date(anio, mes - 1, 1);
  const fin = new Date(anio, mes, 0, 23, 59, 59, 999);
  const rango = { gte: ini, lte: fin };

  const sinPersonal = { clasificacion: { not: 'PERSONAL' } };
  const [prospectos, llamadas, citasAgendadas, citasAsistidas, propuestas, firmas, pagos] = await Promise.all([
    prisma.cliente.count({ where: { ...scope, creadoEn: rango, archivadoEn: null } }),
    prisma.actividad.count({ where: { ...scope, tipo: 'LLAMADA', creadoEn: rango } }),
    prisma.cita.count({ where: { ...scope, ...sinPersonal, creadoEn: rango } }),
    prisma.cita.count({ where: { ...scope, ...sinPersonal, estado: 'COMPLETADA', fechaHoraInicio: rango } }),
    // Propuesta = póliza registrada en el mes, en cualquier estado: es el
    // momento en que el asesor le puso números a la conversación.
    prisma.venta.count({ where: { ...scope, creadoEn: rango } }),
    prisma.venta.count({ where: { ...scope, creadoEn: rango, estado: { in: ['FIRMADA', 'APROBADA', 'PAGADA'] } } }),
    prisma.venta.count({ where: { ...scope, creadoEn: rango, estado: { in: ['APROBADA', 'PAGADA'] } } }),
  ]);

  const niveles = [
    { clave: 'PROSPECTOS', label: 'Prospectos abordados', count: prospectos },
    { clave: 'LLAMADAS', label: 'Llamadas', count: llamadas },
    { clave: 'CITAS_AGENDADAS', label: 'Citas agendadas', count: citasAgendadas },
    { clave: 'CITAS_ASISTIDAS', label: 'Citas asistidas', count: citasAsistidas },
    { clave: 'PROPUESTAS', label: 'Propuestas', count: propuestas },
    { clave: 'FIRMAS', label: 'Firmas', count: firmas },
    { clave: 'PAGOS', label: 'Pagos', count: pagos },
  ];

  // Conversión de cada nivel respecto al anterior (el primero no tiene).
  const conConversion = niveles.map((n, i) => ({
    ...n,
    conversionPct: i === 0 || !niveles[i - 1].count
      ? null
      : Math.round((n.count / niveles[i - 1].count) * 100),
  }));

  res.json({
    mes,
    anio,
    niveles: conConversion,
    // Tasa de cierre del embudo completo: del primer contacto al pago.
    tasaCierrePct: prospectos ? Math.round((pagos / prospectos) * 100) : null,
  });
}));

router.get('/bonos', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const where = esAsesor ? { asesorId: req.user.id } : (req.query.asesorId ? { asesorId: req.query.asesorId } : {});
  const bonos = await prisma.bono.findMany({
    where,
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });
  res.json(bonos);
}));

export default router;
