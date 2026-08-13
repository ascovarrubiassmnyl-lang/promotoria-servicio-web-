import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';

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

// Actuales del periodo agrupados por asesor:
//  ventas/prima  → ventas APROBADA/PAGADA creadas en el mes (= Pólizas),
//  citas         → citas COMPLETADA cuyo inicio cae en el mes,
//  prospectos    → clientes creados en el mes (excluye archivados),
//  referidos     → referidos registrados en el mes,
//  llamadas      → actividades tipo LLAMADA del mes.
async function actualesPorAsesor(ini, fin) {
  const rango = { gte: ini, lte: fin };
  const [ventas, citas, prospectos, referidos, llamadas] = await Promise.all([
    prisma.venta.groupBy({ by: ['asesorId'], where: { ...GANADA, creadoEn: rango }, _count: { _all: true }, _sum: { primaAnual: true } }),
    prisma.cita.groupBy({ by: ['asesorId'], where: { estado: 'COMPLETADA', clasificacion: { not: 'PERSONAL' }, fechaHoraInicio: rango }, _count: { _all: true } }),
    prisma.cliente.groupBy({ by: ['asesorId'], where: { creadoEn: rango, archivadoEn: null }, _count: { _all: true } }),
    prisma.referido.groupBy({ by: ['asesorId'], where: { creadoEn: rango }, _count: { _all: true } }),
    prisma.actividad.groupBy({ by: ['asesorId'], where: { tipo: 'LLAMADA', creadoEn: rango }, _count: { _all: true } }),
  ]);
  const mapa = {};
  const fila = (id) => (mapa[id] ??= { ventas: 0, prima: 0, citas: 0, prospectos: 0, referidos: 0, llamadas: 0 });
  ventas.forEach((v) => { const f = fila(v.asesorId); f.ventas = v._count._all; f.prima = v._sum.primaAnual || 0; });
  citas.forEach((c) => { fila(c.asesorId).citas = c._count._all; });
  prospectos.forEach((p) => { fila(p.asesorId).prospectos = p._count._all; });
  referidos.forEach((r) => { fila(r.asesorId).referidos = r._count._all; });
  llamadas.forEach((l) => { fila(l.asesorId).llamadas = l._count._all; });
  return mapa;
}

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
        actual: actuales[a.id] || { ventas: 0, prima: 0, citas: 0, prospectos: 0, referidos: 0, llamadas: 0 },
        promedioComisionPoliza: promedio,
        polizasParaMeta,
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
  const actual = Object.values(actuales).reduce(
    (acc, f) => { Object.keys(acc).forEach((k) => { acc[k] += f[k]; }); return acc; },
    { ventas: 0, prima: 0, citas: 0, prospectos: 0, referidos: 0, llamadas: 0 },
  );
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
