import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteAlguna } from '../middleware/permisos.js';
import { referidosObtenidos } from '../utils/referidos.js';

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
//  - La única "tasa de conversión" es la del proceso de ventas (entre niveles,
//    en /proceso-ventas); la de referidos se llama "tasa de referidos" y vive
//    solo en su tarjeta.
//  - "Referido obtenido" = definición única de utils/referidos.js (la misma que
//    usa la métrica de Metas), no un count crudo del modelo Referido.
const GANADA = ['APROBADA', 'PAGADA'];
const PIPELINE = ['PENDIENTE_PAGAR', 'FIRMADA'];
// Misma definición de "póliza activa" que la ficha de cliente (activa ⇔
// estado ∈ {PAGADA, FIRMADA, APROBADA}) — no inventar otra aquí.
const ACTIVA = ['PAGADA', 'FIRMADA', 'APROBADA'];
const DIAS_ALERTA_VIGENCIA = 15;

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
  const limiteVigencia = new Date(hoyIni);
  limiteVigencia.setDate(limiteVigencia.getDate() + DIAS_ALERTA_VIGENCIA);
  limiteVigencia.setHours(23, 59, 59, 999);

  const whereAsesor = esAsesor ? { asesorId: req.user.id } : (asesorIdFiltro ? { asesorId: asesorIdFiltro } : {});
  const wherePeriodo = { creadoEn: { gte: ini, lte: fin } };

  const [
    totalClientes, clientesMes, citasPeriodo, citasCompletadasMes,
    ventasAprobadas, ventasPendientes, primaAnualTotal, comisionPipeline,
    pendientesPagoPrima, citasHoy, seguimiento, polizasMesPorEstado,
    referidosDelMes, bonosCobrados, bonosPorGanar, polizasActivas, polizasPorVencer,
    primaPorRamoRaw,
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
    referidosObtenidos(wherePeriodo.creadoEn, whereAsesor),
    prisma.bono.aggregate({ where: { ...whereAsesor, mes, anio, estado: 'COBRADO' }, _sum: { monto: true }, _count: { _all: true } }),
    prisma.bono.aggregate({ where: { ...whereAsesor, mes, anio, estado: 'PENDIENTE' }, _sum: { monto: true }, _count: { _all: true } }),
    // Snapshot actual (no acotado al mes en curso), igual que totalClientes.
    prisma.venta.count({ where: { ...whereAsesor, estado: { in: ACTIVA } } }),
    prisma.venta.count({ where: { ...whereAsesor, estado: { in: ACTIVA }, fechaFinVigencia: { gte: hoyIni, lte: limiteVigencia } } }),
    // Desglose de la misma prima ganada del periodo (GANADA + wherePeriodo,
    // idénticas a primaAnualTotal), agrupada por ramo — para la dona del
    // dashboard. No es una definición nueva, solo un groupBy más fino.
    prisma.venta.groupBy({
      by: ['ramo'],
      where: { ...whereAsesor, estado: { in: GANADA }, ...wherePeriodo },
      _sum: { primaAnual: true },
      _count: { _all: true },
    }),
  ]);

  const primaPorRamo = primaPorRamoRaw
    .map((r) => ({ ramo: r.ramo, prima: r._sum.primaAnual || 0, count: r._count._all }))
    .sort((a, b) => b.prima - a.prima);

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
    polizasActivas,
    polizasPorVencer: { count: polizasPorVencer, dias: DIAS_ALERTA_VIGENCIA },
    primaPorRamo,
    meta: meta ? { prima: meta.metaPrimaMonto, ventas: meta.metaVentasNum } : null,
    atencion: {
      pendientesPago: { count: ventasPendientes, prima: pendientesPagoPrima._sum.primaAnual || 0 },
      citasHoy,
      seguimiento,
      bonosPorGanar: { monto: bonosPorGanar._sum.monto || 0, count: bonosPorGanar._count._all },
    },
    polizasMes: Object.fromEntries(polizasMesPorEstado.map((e) => [e.estado, e._count._all])),
    // Mismo conteo que "Referidos obtenidos" de Metas (utils/referidos.js):
    // una sola definición de referido en todo el sistema.
    referidosMes: { total: referidosDelMes.length, convertidos: referidosDelMes.filter((r) => r.convertido).length },
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

// Proceso de ventas del periodo (2026-08-26, definido por el usuario): los 5
// pasos con los que la promotoría mide su trabajo del mes, del contacto frío
// a la póliza cobrada. Sustituye a los dos endpoints anteriores —/funnel (foto
// de en qué etapa está parado cada cliente hoy) y /funnel-actividad (7 niveles
// de actividad)—, que el usuario pidió consolidar por medir "casi las mismas
// métricas solo divididas": hoy hay UN solo proceso de ventas, no dos lecturas
// que el lector tenía que reconciliar. No reintroducir ninguno de los dos.
//
// Cada nivel usa la MISMA definición que su módulo dueño; aquí no se inventa
// ningún conteo nuevo:
//  1. Prospectos nuevos  = clientes creados en el mes (= métrica de Metas).
//  2. Llamadas           = actividad LLAMADA del mes (= métrica de Metas).
//  3. Citas obtenidas    = citas agendadas en el mes, sin PERSONAL (mismo
//     criterio de exclusión que el resto de métricas de citas).
//  4. Cierres            = pólizas del mes ya firmadas por el cliente
//     (FIRMADA/APROBADA/PAGADA) — el momento en que el prospecto dijo que sí.
//  5. Emitidas y pagadas = las de arriba que ya cobró la compañía
//     (APROBADA/PAGADA) = exactamente la "venta ganada" de Pólizas y Metas.
// (4) contiene a (5), así que el embudo siempre estrecha y las conversiones
// entre niveles son legibles.
router.get('/proceso-ventas', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const asesorId = esAsesor ? req.user.id : (req.query.asesorId || null);
  const scope = asesorId ? { asesorId } : {};

  const ahora = new Date();
  const mes = parseInt(req.query.mes) || (ahora.getMonth() + 1);
  const anio = parseInt(req.query.anio) || ahora.getFullYear();
  const rango = { gte: inicioMes(mes, anio), lte: finMes(mes, anio) };

  const sinPersonal = { clasificacion: { not: 'PERSONAL' } };
  const [prospectos, llamadas, citas, cierres, emitidas] = await Promise.all([
    prisma.cliente.count({ where: { ...scope, creadoEn: rango, archivadoEn: null } }),
    prisma.actividad.count({ where: { ...scope, tipo: 'LLAMADA', creadoEn: rango } }),
    prisma.cita.count({ where: { ...scope, ...sinPersonal, creadoEn: rango } }),
    prisma.venta.count({ where: { ...scope, creadoEn: rango, estado: { in: ['FIRMADA', ...GANADA] } } }),
    prisma.venta.count({ where: { ...scope, creadoEn: rango, estado: { in: GANADA } } }),
  ]);

  const niveles = [
    { clave: 'PROSPECTOS', label: 'Prospectos nuevos', count: prospectos },
    { clave: 'LLAMADAS', label: 'Llamadas realizadas', count: llamadas },
    { clave: 'CITAS', label: 'Citas obtenidas', count: citas },
    { clave: 'CIERRES', label: 'Cierres', count: cierres },
    { clave: 'EMITIDAS', label: 'Pólizas emitidas, pagadas y entregadas', count: emitidas },
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
    // Tasa de cierre del proceso completo: del prospecto nuevo a la póliza
    // emitida y pagada.
    tasaCierrePct: prospectos ? Math.round((emitidas / prospectos) * 100) : null,
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
