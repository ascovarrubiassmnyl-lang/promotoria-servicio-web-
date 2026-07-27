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

router.get('/dashboard', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const asesorIdFiltro = esAsesor ? req.user.id : req.query.asesorId;
  const ahora = new Date();
  const mes = parseInt(req.query.mes) || (ahora.getMonth() + 1);
  const anio = parseInt(req.query.anio) || ahora.getFullYear();
  const ini = inicioMes(mes, anio);
  const fin = finMes(mes, anio);

  const whereAsesor = esAsesor ? { asesorId: req.user.id } : (asesorIdFiltro ? { asesorId: asesorIdFiltro } : {});
  const wherePeriodo = { creadoEn: { gte: ini, lte: fin } };

  const [totalClientes, clientesMes, citasPeriodo, ventasAprobadas, ventasPendientes, primaAnualTotal] = await Promise.all([
    prisma.cliente.count({ where: { ...whereAsesor, archivadoEn: null } }),
    prisma.cliente.count({ where: { ...whereAsesor, archivadoEn: null, creadoEn: wherePeriodo.creadoEn } }),
    prisma.cita.count({ where: { ...whereAsesor, fechaHoraInicio: { gte: ini, lte: fin } } }),
    prisma.venta.count({ where: { ...whereAsesor, estado: { in: ['APROBADA', 'PAGADA'] }, ...wherePeriodo } }),
    prisma.venta.count({ where: { ...whereAsesor, estado: 'PENDIENTE_PAGAR' } }),
    prisma.venta.aggregate({ where: { ...whereAsesor, estado: { in: ['APROBADA', 'PAGADA'] }, ...wherePeriodo }, _sum: { primaAnual: true, comisionMonto: true } }),
  ]);

  let resultado = { mes, anio, totalClientes, clientesMes, citasPeriodo, ventasAprobadas, ventasPendientes, primaAnualTotal: primaAnualTotal._sum.primaAnual || 0, comisionTotal: primaAnualTotal._sum.comisionMonto || 0 };

  if (!esAsesor) {
    const asesores = await prisma.usuario.findMany({
      where: { rol: 'ASESOR', activo: true },
      select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true },
    });
    const ranking = await Promise.all(asesores.map(async (a) => {
      const [ventas, prima, clientes, citas] = await Promise.all([
        prisma.venta.count({ where: { asesorId: a.id, estado: { in: ['APROBADA', 'PAGADA'] }, ...wherePeriodo } }),
        prisma.venta.aggregate({ where: { asesorId: a.id, estado: { in: ['APROBADA', 'PAGADA'] }, ...wherePeriodo }, _sum: { primaAnual: true } }),
        prisma.cliente.count({ where: { asesorId: a.id, archivadoEn: null } }),
        prisma.cita.count({ where: { asesorId: a.id, fechaHoraInicio: { gte: ini, lte: fin } } }),
      ]);
      return { id: a.id, nombre: `${a.nombre} ${a.apellidoP}`, email: a.email, ventas, prima: prima._sum.primaAnual || 0, clientes, citas };
    }));
    ranking.sort((x, y) => y.prima - x.prima);
    resultado.ranking = ranking;
    resultado.totalAsesores = asesores.length;
  }

  res.json(resultado);
}));

router.get('/ventas-por-ramo', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const where = { estado: { in: ['APROBADA', 'PAGADA'] } };
  if (esAsesor) where.asesorId = req.user.id;
  else if (req.query.asesorId) where.asesorId = req.query.asesorId;

  const agrupado = await prisma.venta.groupBy({
    by: ['ramo'],
    where,
    _count: { _all: true },
    _sum: { primaAnual: true },
  });
  res.json(agrupado);
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

// KPIs completos del pipeline para vista asesor/admin
router.get('/pipeline', asyncHandler(async (req, res) => {
  const esAsesor = req.user.rol === 'ASESOR';
  const whereV = esAsesor ? { asesorId: req.user.id } : (req.query.asesorId ? { asesorId: req.query.asesorId } : {});
  const whereC = esAsesor ? { asesorId: req.user.id } : (req.query.asesorId ? { asesorId: req.query.asesorId } : {});

  const [
    firmadas, pagadas, canceladas, pendientesPagar, rechazadas,
    primaTotal, comisionTotal,
    lstadosCliente, citasTotales, referidosTotal, referidosConvertidos,
    llamadasMes, bonosCobrados, bonosPorGanar,
  ] = await Promise.all([
    prisma.venta.count({ where: { ...whereV, estado: 'FIRMADA' } }),
    prisma.venta.count({ where: { ...whereV, estado: 'PAGADA' } }),
    prisma.venta.count({ where: { ...whereV, estado: 'CANCELADA' } }),
    prisma.venta.count({ where: { ...whereV, estado: 'PENDIENTE_PAGAR' } }),
    prisma.venta.count({ where: { ...whereV, estado: 'RECHAZADA' } }),
    prisma.venta.aggregate({ where: { ...whereV, estado: { in: ['APROBADA', 'PAGADA'] } }, _sum: { primaAnual: true } }),
    prisma.venta.aggregate({ where: { ...whereV, estado: { in: ['APROBADA', 'PAGADA'] } }, _sum: { comisionMonto: true } }),
    prisma.cliente.groupBy({ by: ['estado'], where: { ...whereC, archivadoEn: null }, _count: { _all: true } }),
    prisma.cita.count({ where: whereC }),
    prisma.referido.count({ where: whereC }),
    prisma.referido.count({ where: { ...whereC, estado: 'CONVERTIDO' } }),
    prisma.actividad.count({ where: { ...whereC, tipo: 'LLAMADA' } }),
    prisma.bono.aggregate({ where: { ...whereC, estado: 'COBRADO' }, _sum: { monto: true }, _count: { _all: true } }),
    prisma.bono.aggregate({ where: { ...whereC, estado: 'PENDIENTE' }, _sum: { monto: true }, _count: { _all: true } }),
  ]);

  // Conteos por estado de cliente
  const porEstado = {};
  for (const e of lstadosCliente) porEstado[e.estado] = e._count._all;
  const prospecciones = porEstado.PROSPECTO || 0;
  const enCita = porEstado.CITA || 0;
  const enPropuesta = porEstado.PROPUESTA || 0;
  const enCierre = porEstado.CIERRE_FIRMA || 0;
  const enEntrega = porEstado.ENTREGA_POLIZA || 0;

  // Conversiones: requieren un período. Tomamos ventas APROBADA/PAGADA vs citas completadas (todo el histórico).
  const citasCompletadas = await prisma.cita.count({ where: { ...whereC, estado: 'COMPLETADA' } });
  const ventasGanadas = await prisma.venta.count({ where: { ...whereV, estado: { in: ['APROBADA', 'PAGADA'] } } });
  const conversionCitaVenta = citasCompletadas > 0 ? +((ventasGanadas / citasCompletadas) * 100).toFixed(1) : 0;
  // Conversión prospecto->cita: de cuántos prospectos han generado al menos una cita agendada.
  // Lo estimamos con clientes en estado >= CITA / total de prospectos creados.
  const totalProspecciones = prospecciones + enCita + enPropuesta + enCierre + enEntrega;
  const avanzaronAPropuesta = enPropuesta + enCierre + enEntrega;
  const conversionProspectoPropuesta = totalProspecciones > 0 ? +((avanzaronAPropuesta / totalProspecciones) * 100).toFixed(1) : 0;

  res.json({
    ventas: { firmadas, pagadas, canceladas, pendientesPagar, rechazadas },
    primaTotal: primaTotal._sum.primaAnual || 0,
    comisionTotal: comisionTotal._sum.comisionMonto || 0,
    clientesPorEstado: porEstado,
    citas: { total: citasTotales, completadas: citasCompletadas },
    conversiones: {
      prospectoPropuesta: conversionProspectoPropuesta,
      citaVenta: conversionCitaVenta,
    },
    referidos: { total: referidosTotal, convertidos: referidosConvertidos },
    llamadas: { total: llamadasMes },
    bonos: {
      cobrados: { monto: bonosCobrados._sum.monto || 0, count: bonosCobrados._count._all },
      porGanar: { monto: bonosPorGanar._sum.monto || 0, count: bonosPorGanar._count._all },
    },
  });
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
