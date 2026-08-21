import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { referidosObtenidos } from '../utils/referidos.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('metas'));

function periodo(req) {
  const ahora = new Date();
  const mes = parseInt(req.query.mes) || (ahora.getMonth() + 1);
  const anio = parseInt(req.query.anio) || ahora.getFullYear();
  return { mes, anio, ini: new Date(anio, mes - 1, 1), fin: new Date(anio, mes, 0, 23, 59, 59, 999) };
}

// Ventas "ganadas" del periodo: misma definición que Pólizas (APROBADA/PAGADA).
const GANADA = { estado: { in: ['APROBADA', 'PAGADA'] } };

// Campos de meta compartidos por Target y TargetEquipo. Los actuales de cada
// métrica salen de los registros del propio CRM (ver actualesPorAsesor).
const CAMPOS_META = ['metaVentasNum', 'metaPrimaMonto', 'metaCitasNum', 'metaProspectosNum', 'metaReferidosNum', 'metaLlamadasNum'];
const camposMeta = (body = {}) => Object.fromEntries(CAMPOS_META.map((c) => [c, body[c] ?? null]));

// `metaIngresoMonto` (PRP, 2026-08-05) es exclusiva de Target: no existe
// columna en TargetEquipo, así que se maneja aparte de CAMPOS_META.
const metaIngreso = (body = {}) => (body.metaIngresoMonto !== undefined ? { metaIngresoMonto: body.metaIngresoMonto ?? null } : {});

// Comisión promedio histórica por póliza ganada de cada asesor (todo el
// histórico, sin acotar al mes en curso): es la base para traducir la meta
// de ingreso deseado en "pólizas necesarias" del resumen. `null` si el
// asesor aún no tiene ninguna venta ganada (no hay con qué proyectar).
async function promedioComisionPorAsesor() {
  const filas = await prisma.venta.groupBy({ by: ['asesorId'], where: GANADA, _avg: { comisionMonto: true } });
  return Object.fromEntries(filas.map((f) => [f.asesorId, f._avg.comisionMonto || null]));
}

// Actuales del periodo, agrupados por MES y por asesor:
//  ventas/prima  → ventas APROBADA/PAGADA creadas en el mes (= Pólizas),
//  citas         → citas COMPLETADA cuyo inicio cae en el mes,
//  prospectos    → clientes creados en el mes (excluye archivados),
//  referidos     → referidos obtenidos en el mes (definición única en
//                  utils/referidos.js: alta con fuente "Referido"/"Referido por"
//                  + filas Referido que aún no son cliente, sin doble conteo),
//  llamadas      → actividades tipo LLAMADA del mes.
//
// Se agrupa por mes en JS (y no con groupBy por asesor) porque el historial
// necesita varios meses de un jalón y la definición de cada métrica debe ser
// UNA sola: el resumen de un mes es esta misma función acotada a ese mes.
const claveMes = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;
const filaVacia = () => ({ ventas: 0, prima: 0, citas: 0, prospectos: 0, referidos: 0, llamadas: 0 });

async function actualesPorMes(ini, fin, whereBase = {}) {
  const rango = { gte: ini, lte: fin };
  const [ventas, citas, prospectos, llamadas, referidos] = await Promise.all([
    prisma.venta.findMany({ where: { ...whereBase, ...GANADA, creadoEn: rango }, select: { asesorId: true, creadoEn: true, primaAnual: true } }),
    prisma.cita.findMany({ where: { ...whereBase, estado: 'COMPLETADA', clasificacion: { not: 'PERSONAL' }, fechaHoraInicio: rango }, select: { asesorId: true, fechaHoraInicio: true } }),
    prisma.cliente.findMany({ where: { ...whereBase, creadoEn: rango, archivadoEn: null }, select: { asesorId: true, creadoEn: true } }),
    prisma.actividad.findMany({ where: { ...whereBase, tipo: 'LLAMADA', creadoEn: rango }, select: { asesorId: true, creadoEn: true } }),
    referidosObtenidos(rango, whereBase),
  ]);
  const meses = {};
  const fila = (fecha, asesorId) => {
    const mapa = (meses[claveMes(fecha)] ??= {});
    return (mapa[asesorId] ??= filaVacia());
  };
  ventas.forEach((v) => { const f = fila(v.creadoEn, v.asesorId); f.ventas += 1; f.prima += v.primaAnual || 0; });
  citas.forEach((c) => { fila(c.fechaHoraInicio, c.asesorId).citas += 1; });
  prospectos.forEach((p) => { fila(p.creadoEn, p.asesorId).prospectos += 1; });
  llamadas.forEach((l) => { fila(l.creadoEn, l.asesorId).llamadas += 1; });
  referidos.forEach((r) => { fila(r.fecha, r.asesorId).referidos += 1; });
  return meses;
}

// Un solo mes: { [asesorId]: fila }. Misma definición que el historial.
async function actualesPorAsesor(ini, fin, whereBase = {}) {
  const meses = await actualesPorMes(ini, fin, whereBase);
  return meses[claveMes(ini)] || {};
}

// Suma de las filas de todos los asesores (nivel promotoría).
const sumarFilas = (filas) => filas.reduce(
  (acc, f) => { Object.keys(acc).forEach((k) => { acc[k] += f[k]; }); return acc; },
  filaVacia(),
);

// Metas individuales (crudas). Un asesor solo recibe la suya (se fuerza asesorId).
router.get('/', asyncHandler(async (req, res) => {
  const { mes, anio, asesorId } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (mes) where.mes = parseInt(mes);
  if (anio) where.anio = parseInt(anio);
  const targets = await prisma.target.findMany({ where, include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } } });
  res.json(targets);
}));

// Resumen del periodo: cada asesor con su meta (o null) y sus actuales en las
// 6 métricas. El asesor recibe únicamente su propia fila (falla cerrado); el
// promotor recibe a todos los asesores activos.
router.get('/resumen', asyncHandler(async (req, res) => {
  const { mes, anio, ini, fin } = periodo(req);
  const soloYo = req.user.rol === 'ASESOR';
  const [asesores, targets, actuales, promedioComision] = await Promise.all([
    prisma.usuario.findMany({
      where: soloYo ? { id: req.user.id } : { rol: 'ASESOR', activo: true },
      select: { id: true, nombre: true, apellidoP: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.target.findMany({ where: { mes, anio, ...(soloYo ? { asesorId: req.user.id } : {}) } }),
    actualesPorAsesor(ini, fin),
    promedioComisionPorAsesor(),
  ]);
  const metaPor = Object.fromEntries(targets.map((t) => [t.asesorId, t]));
  res.json({
    mes, anio,
    asesores: asesores.map((a) => {
      const meta = metaPor[a.id] || null;
      const promedio = promedioComision[a.id] || null;
      // Pólizas necesarias para alcanzar la meta de ingreso, con la comisión
      // promedio histórica del propio asesor (redondeo hacia arriba: nunca
      // "casi alcanza"). Sin meta de ingreso o sin historial → null.
      const polizasParaMeta = meta?.metaIngresoMonto && promedio
        ? Math.ceil(meta.metaIngresoMonto / promedio)
        : null;
      return {
        id: a.id,
        nombre: `${a.nombre} ${a.apellidoP}`.trim(),
        meta,
        actual: actuales[a.id] || filaVacia(),
        promedioComisionPoliza: promedio,
        polizasParaMeta,
      };
    }),
  });
}));

// Historial de metas: los últimos `meses` periodos (terminando en el mes
// seleccionado), cada uno con la meta que se registró y el avance real.
//
// El historial NO se guarda como snapshot: `Target`/`TargetEquipo` ya son una
// fila por (mes, año) —por eso la meta "se reinicia" sola cada mes— y los
// actuales se recalculan de los registros con la MISMA definición que el
// resumen del mes en curso. Congelar una foto al cierre crearía una segunda
// verdad que se desincroniza en cuanto se corrige una póliza o se archiva un
// cliente (mismo criterio que el segmento prospecto/cliente o el contador de
// la clínica: derivar, no persistir).
//
// Alcance por rol, fallando cerrado: el ASESOR solo recibe su propio historial
// (se ignora `asesorId`); el promotor recibe el de la promotoría o el de un
// asesor si lo pide.
router.get('/historial', asyncHandler(async (req, res) => {
  const { mes, anio } = periodo(req);
  const meses = Math.min(Math.max(parseInt(req.query.meses) || 12, 1), 36);
  const soloYo = req.user.rol === 'ASESOR';
  const asesorId = soloYo ? req.user.id : (req.query.asesorId || null);

  const fin = new Date(anio, mes, 0, 23, 59, 59, 999);
  const ini = new Date(anio, mes - meses, 1);
  // Periodos del rango, del más reciente al más antiguo.
  const periodos = Array.from({ length: meses }, (_, i) => {
    const d = new Date(anio, mes - 1 - i, 1);
    return { mes: d.getMonth() + 1, anio: d.getFullYear(), clave: claveMes(d) };
  });
  const anios = [...new Set(periodos.map((p) => p.anio))];

  const whereBase = asesorId ? { asesorId } : {};
  const [actualesMes, metas] = await Promise.all([
    actualesPorMes(ini, fin, whereBase),
    asesorId
      ? prisma.target.findMany({ where: { asesorId, anio: { in: anios } } })
      : prisma.targetEquipo.findMany({ where: { anio: { in: anios } } }),
  ]);
  const metaPor = Object.fromEntries(metas.map((m) => [`${m.anio}-${m.mes}`, m]));

  res.json({
    nivel: asesorId ? 'ASESOR' : 'EQUIPO',
    asesorId,
    periodos: periodos.map((p) => {
      const delMes = actualesMes[p.clave] || {};
      return {
        mes: p.mes,
        anio: p.anio,
        meta: metaPor[p.clave] || null,
        actual: asesorId ? (delMes[asesorId] || filaVacia()) : sumarFilas(Object.values(delMes)),
      };
    }),
  });
}));

router.post('/', esAdmin, asyncHandler(async (req, res) => {
  const { asesorId, mes, anio } = req.body || {};
  if (!asesorId || !mes || !anio) return res.status(400).json({ error: 'asesorId, mes y anio son requeridos' });
  const m = parseInt(mes), a = parseInt(anio);
  if (m < 1 || m > 12) return res.status(400).json({ error: 'mes debe ser 1-12' });
  const metas = { ...camposMeta(req.body), ...metaIngreso(req.body) };
  const target = await prisma.target.upsert({
    where: { asesorId_mes_anio: { asesorId, mes: m, anio: a } },
    create: { asesorId, mes: m, anio: a, ...metas },
    update: metas,
  });
  res.status(201).json(target);
}));

// Meta de promotoría (equipo). Solo promotores: el asesor no gestiona ni
// consulta el objetivo agregado (falla cerrado con 403).
router.get('/equipo', esAdmin, asyncHandler(async (req, res) => {
  const { mes, anio, ini, fin } = periodo(req);
  const [meta, actuales, sumaInd] = await Promise.all([
    prisma.targetEquipo.findUnique({ where: { mes_anio: { mes, anio } } }),
    actualesPorAsesor(ini, fin),
    prisma.target.aggregate({ where: { mes, anio }, _sum: Object.fromEntries(CAMPOS_META.map((c) => [c, true])) }),
  ]);
  const actual = sumarFilas(Object.values(actuales));
  res.json({
    mes, anio,
    meta,
    actual,
    sumaIndividual: {
      ventas: sumaInd._sum.metaVentasNum || 0,
      prima: sumaInd._sum.metaPrimaMonto || 0,
      citas: sumaInd._sum.metaCitasNum || 0,
      prospectos: sumaInd._sum.metaProspectosNum || 0,
      referidos: sumaInd._sum.metaReferidosNum || 0,
      llamadas: sumaInd._sum.metaLlamadasNum || 0,
    },
  });
}));

router.post('/equipo', esAdmin, asyncHandler(async (req, res) => {
  const { mes, anio } = req.body || {};
  if (!mes || !anio) return res.status(400).json({ error: 'mes y anio son requeridos' });
  const m = parseInt(mes), a = parseInt(anio);
  if (m < 1 || m > 12) return res.status(400).json({ error: 'mes debe ser 1-12' });
  const metas = camposMeta(req.body);
  const meta = await prisma.targetEquipo.upsert({
    where: { mes_anio: { mes: m, anio: a } },
    create: { mes: m, anio: a, ...metas },
    update: metas,
  });
  res.status(201).json(meta);
}));

export default router;
