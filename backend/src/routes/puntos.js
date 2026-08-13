import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';

// Sistema de 25 puntos (formato semanal SMNYL): registro diario por asesor.
// El puntaje se calcula SIEMPRE aquí con el mapa único PUNTOS; el frontend lo
// recibe en GET /semana y no re-declara valores.
const router = Router();
router.use(authenticate);
router.use(permiteSeccion('puntos'));

// Valores del formato oficial: solo estos conceptos puntúan.
export const PUNTOS = {
  referidosObtenidos: 3,
  llamadasRealizadas: 1,
  citasObtenidas: 2,
  cuestionariosRealizados: 2,
  cierresRealizados: 3,
  solicitudes: 5,
};
export const META_PUNTOS_DIARIA = 25;

// Campos numéricos capturables del registro diario (además de `comision`).
const CAMPOS = [
  'referidosObtenidos', 'referidosContactados', 'llamadasRealizadas', 'citasObtenidas',
  'citasPlaneadas', 'citasNuevas', 'cuestionariosPlaneados', 'cuestionariosRealizados',
  'cierresPlaneados', 'cierresRealizados', 'solicitudes',
];

export const puntosDe = (reg) =>
  Object.entries(PUNTOS).reduce((acc, [campo, valor]) => acc + (reg[campo] || 0) * valor, 0);

// 'YYYY-MM-DD' → Date UTC-medianoche (así se guardan las columnas @db.Date).
const fechaDia = (str) => {
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Alcance por rol para LECTURA: el asesor solo se ve a sí mismo (el
// parámetro se ignora); el promotor puede consultar cualquier asesor.
const asesorScope = (req, explicito) =>
  req.user.rol === 'ASESOR' ? req.user.id : (explicito || req.user.id);

// 'YYYY-MM-DD' del día actual en la zona horaria de la promotoría (single
// country: México). Es la referencia del candado anti-falsificación: nunca
// se calcula "hoy" con el reloj/zona del navegador.
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

// Semana del formato: 7 días a partir de `inicio` (lunes, como el resto del
// sistema). Devuelve registros existentes, plan de la semana y el puntaje.
router.get('/semana', asyncHandler(async (req, res) => {
  const inicio = fechaDia(req.query.inicio);
  if (!inicio) return res.status(400).json({ error: 'inicio (YYYY-MM-DD) es requerido' });
  const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
  const asesorId = asesorScope(req, req.query.asesorId);

  const [registros, plan] = await Promise.all([
    prisma.registroPuntos.findMany({
      where: { asesorId, fecha: { gte: inicio, lt: fin } },
      orderBy: { fecha: 'asc' },
    }),
    prisma.planSemanal.findUnique({ where: { asesorId_semanaInicio: { asesorId, semanaInicio: inicio } } }),
  ]);

  const conPuntos = registros.map((r) => ({ ...r, puntos: puntosDe(r) }));
  res.json({
    asesorId,
    registros: conPuntos,
    plan,
    valores: PUNTOS,
    metaDiaria: META_PUNTOS_DIARIA,
    totalSemana: conPuntos.reduce((acc, r) => acc + r.puntos, 0),
    hoy: hoyISO(),
    soloLectura: asesorId !== req.user.id, // viendo el formato de otro asesor: nunca editable
  });
}));

// Captura/edición del día (upsert). Solo campos conocidos, enteros >= 0.
// Candado anti-falsificación (acordado 2026-08-05): cada quien captura
// ÚNICAMENTE su propio registro (el promotor ya no puede editar por otro,
// solo consultar en GET /semana) y solo el día de hoy — en cuanto el día
// cierra, ni el asesor ni el promotor pueden tocarlo nunca más, sin
// excepciones de rol. Evita "maquillar" el histórico de productividad.
router.put('/dia', asyncHandler(async (req, res) => {
  const { fecha } = req.body || {};
  const dia = fechaDia(fecha);
  if (!dia) return res.status(400).json({ error: 'fecha (YYYY-MM-DD) es requerida' });
  const asesorId = req.user.id;
  const hoy = hoyISO();
  if (String(fecha).slice(0, 10) < hoy) {
    return res.status(409).json({ error: 'Ese día ya cerró y no se puede modificar (candado anti-falsificación de productividad).' });
  }

  const data = {};
  for (const campo of CAMPOS) {
    if (req.body[campo] === undefined) continue;
    const n = Number(req.body[campo]);
    if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: `${campo} debe ser un entero >= 0` });
    data[campo] = n;
  }
  if (req.body.comision !== undefined) {
    const c = Number(req.body.comision);
    if (Number.isNaN(c) || c < 0) return res.status(400).json({ error: 'comision debe ser un número >= 0' });
    data.comision = c;
  }

  const registro = await prisma.registroPuntos.upsert({
    where: { asesorId_fecha: { asesorId, fecha: dia } },
    update: data,
    create: { asesorId, fecha: dia, ...data },
  });
  res.json({ ...registro, puntos: puntosDe(registro) });
}));

// Listas de planeación de la semana (5 mejores prospectos, desarrollo
// personal, oportunidades de venta y de servicio). Upsert por semana.
// Mismo candado de autoría que /dia: cada quien edita solo lo suyo.
router.put('/plan', asyncHandler(async (req, res) => {
  const inicio = fechaDia(req.body?.semanaInicio);
  if (!inicio) return res.status(400).json({ error: 'semanaInicio (YYYY-MM-DD) es requerida' });
  const asesorId = req.user.id;

  const lista = (v) => (Array.isArray(v) ? v.slice(0, 5).map((s) => String(s).slice(0, 200)) : undefined);
  const data = {};
  for (const campo of ['mejoresProspectos', 'desarrolloPersonal', 'oportunidadesVenta', 'oportunidadesServicio']) {
    const v = lista(req.body[campo]);
    if (v !== undefined) data[campo] = v;
  }

  const plan = await prisma.planSemanal.upsert({
    where: { asesorId_semanaInicio: { asesorId, semanaInicio: inicio } },
    update: data,
    create: { asesorId, semanaInicio: inicio, ...data },
  });
  res.json(plan);
}));

// Resumen de la semana por asesor (solo promotores): totales y puntos para el
// panel de seguimiento de la promotoría. Un asesor no ve datos de otros.
router.get('/resumen', asyncHandler(async (req, res) => {
  if (req.user.rol === 'ASESOR') return res.status(403).json({ error: 'Solo promotores' });
  const inicio = fechaDia(req.query.inicio);
  if (!inicio) return res.status(400).json({ error: 'inicio (YYYY-MM-DD) es requerido' });
  const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [asesores, registros] = await Promise.all([
    prisma.usuario.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, apellidoP: true, rol: true },
      orderBy: [{ nombre: 'asc' }],
    }),
    prisma.registroPuntos.findMany({ where: { fecha: { gte: inicio, lt: fin } } }),
  ]);

  const porAsesor = new Map();
  for (const r of registros) {
    const acc = porAsesor.get(r.asesorId) || { puntos: 0, dias: 0, llamadas: 0, citasObtenidas: 0, solicitudes: 0 };
    acc.puntos += puntosDe(r);
    acc.dias += 1;
    acc.llamadas += r.llamadasRealizadas;
    acc.citasObtenidas += r.citasObtenidas;
    acc.solicitudes += r.solicitudes;
    porAsesor.set(r.asesorId, acc);
  }

  res.json({
    metaDiaria: META_PUNTOS_DIARIA,
    filas: asesores
      .filter((a) => a.rol === 'ASESOR' || porAsesor.has(a.id))
      .map((a) => ({ asesor: a, ...(porAsesor.get(a.id) || { puntos: 0, dias: 0, llamadas: 0, citasObtenidas: 0, solicitudes: 0 }) })),
  });
}));

// Resumen histórico (tendencia) del sistema de 25 puntos, semana a semana,
// sobre un rango dado. Devuelve KPIs agregados del rango (puntos totales,
// promedio semanal, mejor semana, totales por concepto) y un array de
// semanas — cada una con puntos, días activos, mejor día (mayor puntaje) y
// fecha de inicio — listo para pintar como gráfica de tendencia + drill-down.
// El asesor solo se ve a sí mismo; el promotor con selector.
router.get('/historico', asyncHandler(async (req, res) => {
  const asesorId = asesorScope(req, req.query.asesorId);

  // Rango: por defecto las últimas 12 semanas hasta hoy; soporta `inicio` y
  // `fin` (YYYY-MM-DD) opcionales. `fin` se ajusta al final del día. Si llega
  // solo `inicio`, el rango es [inicio, hoy].
  const ahora = new Date();
  const hoyFin = new Date(ahora); hoyFin.setUTCHours(23, 59, 59, 999);
  let desde = req.query.inicio ? fechaDia(req.query.inicio) : null;
  let hasta = req.query.fin ? fechaDia(req.query.fin) : hoyFin;
  if (hasta) hasta = new Date(hasta.getTime() + 24 * 60 * 60 * 1000 - 1); // fin del día UTC
  if (!desde) {
    // 12 semanas atrás desde `hasta`: lunes más cercano.
    desde = new Date(hasta);
    desde.setUTCDate(desde.getUTCDate() - 6); // subimos al lunes más cercano hacia atrás
    desde.setUTCDate(desde.getUTCDate() - ((desde.getUTCDay() + 6) % 7));
    desde.setUTCDate(desde.getUTCDate() - 11 * 7); // 12 semanas total
  }
  if (desde > hasta) return res.status(400).json({ error: 'inicio debe ser anterior a fin' });

  const registros = await prisma.registroPuntos.findMany({
    where: { asesorId, fecha: { gte: desde, lte: hasta } },
    orderBy: { fecha: 'asc' },
  });

  // Acumula por semana (clave = lunes ISO YYYY-MM-DD). Recolecta por concepto.
  const porSemana = new Map();
  const CONCEPTOS = ['referidosObtenidos', 'llamadasRealizadas', 'citasObtenidas',
    'cuestionariosPlaneados', 'cuestionariosRealizados', 'cierresRealizados', 'solicitudes'];
  for (const r of registros) {
    // Lunes de la semana del registro (UTC, @db.Date guardado UTC-medianoche).
    const d = new Date(r.fecha.getTime());
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
    d.setUTCHours(0, 0, 0, 0);
    const clave = d.toISOString().slice(0, 10);
    const acc = porSemana.get(clave) || { semanaInicio: clave, puntos: 0, dias: 0,
      mejorDiaFecha: null, mejorDiaPuntos: 0, porConcepto: Object.fromEntries(CONCEPTOS.map((c) => [c, 0])) };
    const pts = puntosDe(r);
    acc.puntos += pts;
    acc.dias += 1;
    if (pts > acc.mejorDiaPuntos) { acc.mejorDiaPuntos = pts; acc.mejorDiaFecha = r.fecha; }
    for (const c of CONCEPTOS) acc.porConcepto[c] += r[c] || 0;
    porSemana.set(clave, acc);
  }

  // Rellena semanas vacías entre [desde, hasta] para que la gráfica no tenga huecos.
  const semanas = [];
  let todosTotal = 0, diasActivosTotal = 0, mejorSemana = null;
  {
    const cursor = new Date(desde); cursor.setUTCHours(0, 0, 0, 0);
    const finLunes = new Date(hasta);
    while (cursor <= finLunes) {
      const clave = cursor.toISOString().slice(0, 10);
      const acc = porSemana.get(clave) || { semanaInicio: clave, puntos: 0, dias: 0,
        mejorDiaFecha: null, mejorDiaPuntos: 0, porConcepto: Object.fromEntries(CONCEPTOS.map((c) => [c, 0])) };
      semanas.push(acc);
      todosTotal += acc.puntos;
      diasActivosTotal += acc.dias;
      if (!mejorSemana || acc.puntos > mejorSemana.puntos) mejorSemana = { semanaInicio: clave, puntos: acc.puntos };
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  const totalSemanas = semanas.length || 1;
  const promedioSemanal = Math.round(todosTotal / totalSemanas);
  const totalPorConcepto = Object.fromEntries(CONCEPTOS.map((c) => [c,
    semanas.reduce((acc, s) => acc + s.porConcepto[c], 0)]));

  res.json({
    asesorId,
    rango: { inicio: desde.toISOString().slice(0, 10), fin: hasta.toISOString().slice(0, 10) },
    valores: PUNTOS,
    metaDiaria: META_PUNTOS_DIARIA,
    resumen: {
      puntosTotales: todosTotal,
      promedioSemanal,
      diasActivos: diasActivosTotal,
      mejorSemana,
      totalPorConcepto,
      totalSemanas: semanas.length,
    },
    semanas,
  });
}));

export default router;
