import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';
import { calcularSemaforo, grupoCompleto, VITALES, VALORES } from '../utils/semaforoCandidato.js';

const router = Router();
router.use(authenticate);

// Pipeline ordenado de reclutamiento SMNYL. ENTREVISTA_ADICIONAL es opcional:
// desde CARRERA se puede saltar directo a PRECONTRATO_MC.
const ETAPAS = ['ENTREVISTA_INICIAL', 'SELECCION', 'CARRERA', 'ENTREVISTA_ADICIONAL', 'PRECONTRATO_MC', 'FIRMA_CONTRATO_FC'];
const SEMAFOROS = ['SIN_EVALUAR', 'VERDE', 'AMARILLO', 'ROJO'];

// Campos editables de texto/dato del candidato (mismos del formulario SMNYL).
const CAMPOS_TEXTO = [
  'apellidoM', 'ciudad', 'email', 'sexo', 'rfc', 'referidoPor', 'notas', 'oficina',
  'calle', 'colonia', 'codigoPostal', 'estadoDireccion', 'profesion',
  'gradoEstudios', 'antiguedadResidencia', 'estadoCivil',
];

async function validarReclutador(reclutadorId, res) {
  const reclutador = await prisma.usuario.findUnique({ where: { id: reclutadorId } });
  if (!reclutador) { res.status(400).json({ error: 'Reclutador no válido' }); return false; }
  return true;
}

// El alta está abierta a todos los roles autenticados (un asesor puede referir
// un candidato desde el selector "Cliente o Candidato"); el resto del módulo
// exige la sección `candidatos`, que tiene piso de rol ADMIN/SUPERADMIN.
router.post('/', asyncHandler(async (req, res) => {
  const { nombre, apellidoP, telefono, fuente, sexo, fechaNacimiento, reclutadorId, numeroHijos, ingresosAnuales } = req.body || {};
  if (!nombre || !apellidoP || !telefono || !fuente) {
    return res.status(400).json({ error: 'nombre, apellidoP, telefono y fuente son requeridos' });
  }
  if (sexo && !['M', 'F'].includes(sexo)) return res.status(400).json({ error: 'sexo inválido (M o F)' });
  if (reclutadorId && !(await validarReclutador(reclutadorId, res))) return;

  const data = {
    creadoPorId: req.user.id,
    nombre, apellidoP, telefono, fuente,
    reclutadorId: reclutadorId || null,
    fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
    numeroHijos: numeroHijos ?? null,
    ingresosAnuales: ingresosAnuales ?? null,
  };
  for (const campo of CAMPOS_TEXTO) data[campo] = req.body[campo] || null;

  const candidato = await prisma.candidato.create({
    data,
    include: { reclutador: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  await registrarActividad(req.user.id, 'CANDIDATO_CREADO', {
    candidatoId: candidato.id,
    candidato: `${nombre} ${apellidoP}`,
    fuente,
  });
  res.status(201).json(candidato);
}));

router.use(permiteSeccion('candidatos'));

router.get('/', asyncHandler(async (req, res) => {
  const { etapa, semaforo, q, archivados } = req.query;
  const where = { archivadoEn: archivados === '1' ? { not: null } : null };
  if (etapa && ETAPAS.includes(etapa)) where.etapa = etapa;
  if (semaforo && SEMAFOROS.includes(semaforo)) where.semaforo = semaforo;
  if (q) where.OR = [
    { nombre: { contains: q, mode: 'insensitive' } },
    { apellidoP: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { telefono: { contains: q, mode: 'insensitive' } },
    { fuente: { contains: q, mode: 'insensitive' } },
  ];
  const candidatos = await prisma.candidato.findMany({
    where,
    include: {
      reclutador: { select: { id: true, nombre: true, apellidoP: true } },
      creadoPor: { select: { id: true, nombre: true, apellidoP: true } },
      _count: { select: { citas: true } },
      // Próxima entrevista viva (para la columna "última/próxima cita").
      citas: {
        where: { estado: { in: ['PROGRAMADA', 'CONFIRMADA'] } },
        orderBy: { fechaHoraInicio: 'asc' },
        take: 1,
        select: { id: true, fechaHoraInicio: true, titulo: true, modalidad: true },
      },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(candidatos.map(({ citas, ...c }) => ({ ...c, proximaCita: citas[0] || null })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const candidato = await prisma.candidato.findUnique({
    where: { id: req.params.id },
    include: {
      reclutador: { select: { id: true, nombre: true, apellidoP: true } },
      creadoPor: { select: { id: true, nombre: true, apellidoP: true } },
      evaluacion: { include: { evaluador: { select: { id: true, nombre: true, apellidoP: true } } } },
      citas: {
        orderBy: { fechaHoraInicio: 'desc' },
        take: 20,
        include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
      },
    },
  });
  if (!candidato) return res.status(404).json({ error: 'Candidato no encontrado' });
  res.json(candidato);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const existente = await prisma.candidato.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'Candidato no encontrado' });
  const { nombre, apellidoP, telefono, fuente, sexo, fechaNacimiento, reclutadorId, numeroHijos, ingresosAnuales } = req.body || {};
  if (sexo && !['M', 'F'].includes(sexo)) return res.status(400).json({ error: 'sexo inválido (M o F)' });
  if (reclutadorId && !(await validarReclutador(reclutadorId, res))) return;

  const data = {};
  if (nombre) data.nombre = nombre;
  if (apellidoP) data.apellidoP = apellidoP;
  if (telefono) data.telefono = telefono;
  if (fuente) data.fuente = fuente;
  if (fechaNacimiento !== undefined) data.fechaNacimiento = fechaNacimiento ? new Date(fechaNacimiento) : null;
  if (reclutadorId !== undefined) data.reclutadorId = reclutadorId || null;
  if (numeroHijos !== undefined) data.numeroHijos = numeroHijos ?? null;
  if (ingresosAnuales !== undefined) data.ingresosAnuales = ingresosAnuales ?? null;
  for (const campo of CAMPOS_TEXTO) {
    if (req.body[campo] !== undefined) data[campo] = req.body[campo] || null;
  }
  // Restaurar / archivar por borrado lógico, mismo patrón que Cliente.
  if (req.body.archivado === false) data.archivadoEn = null;
  if (req.body.archivado === true) data.archivadoEn = new Date();

  const candidato = await prisma.candidato.update({ where: { id: req.params.id }, data });
  res.json(candidato);
}));

// La etapa solo avanza secuencialmente (con salto opcional de
// ENTREVISTA_ADICIONAL) y puede regresar libremente.
router.patch('/:id/etapa', asyncHandler(async (req, res) => {
  const { etapa } = req.body || {};
  if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'etapa inválida' });
  const existente = await prisma.candidato.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'Candidato no encontrado' });
  const desde = ETAPAS.indexOf(existente.etapa);
  const hacia = ETAPAS.indexOf(etapa);
  const saltoAdicional = hacia === desde + 2 && ETAPAS[desde + 1] === 'ENTREVISTA_ADICIONAL';
  if (hacia > desde + 1 && !saltoAdicional) {
    return res.status(400).json({ error: 'Solo se puede avanzar a la siguiente etapa (la Entrevista Adicional puede saltarse)' });
  }
  const candidato = await prisma.candidato.update({ where: { id: req.params.id }, data: { etapa } });
  await registrarActividad(req.user.id, 'CANDIDATO_ETAPA', {
    candidatoId: candidato.id,
    candidato: `${candidato.nombre} ${candidato.apellidoP}`,
    etapaAnterior: existente.etapa,
    etapa,
  });
  res.json(candidato);
}));

// Valida que las 6 dimensiones del grupo vengan como enteros 1–5.
function leerGrupo(body, campos) {
  const data = {};
  for (const campo of campos) {
    const v = body?.[campo];
    if (!Number.isInteger(v) || v < 1 || v > 5) return { error: `${campo} debe ser un entero entre 1 y 5` };
    data[campo] = v;
  }
  return { data };
}

// Paso 1 del wizard: los 6 vitales de golpe (el botón "Completar todos los
// vitales" del formato SMNYL). Crea la evaluación si no existe.
router.put('/:id/evaluacion/vitales', asyncHandler(async (req, res) => {
  const candidato = await prisma.candidato.findUnique({ where: { id: req.params.id }, include: { evaluacion: true } });
  if (!candidato) return res.status(404).json({ error: 'Candidato no encontrado' });
  const { error, data } = leerGrupo(req.body, VITALES);
  if (error) return res.status(400).json({ error });

  const evaluacion = await prisma.evaluacionCandidato.upsert({
    where: { candidatoId: candidato.id },
    create: { candidatoId: candidato.id, evaluadorId: req.user.id, ...data, vitalesCompletadosEn: new Date() },
    update: { ...data, evaluadorId: req.user.id, vitalesCompletadosEn: new Date() },
  });
  // Si los valores ya estaban completos (reevaluación), el semáforo se recalcula.
  const semaforo = calcularSemaforo(evaluacion);
  if (semaforo !== candidato.semaforo) {
    await prisma.candidato.update({ where: { id: candidato.id }, data: { semaforo } });
  }
  res.json({ evaluacion, semaforo });
}));

// Paso 2: los 6 valores. Exige vitales completos (flujo secuencial SMNYL);
// al guardar se calcula y persiste el semáforo del candidato.
router.put('/:id/evaluacion/valores', asyncHandler(async (req, res) => {
  const candidato = await prisma.candidato.findUnique({ where: { id: req.params.id }, include: { evaluacion: true } });
  if (!candidato) return res.status(404).json({ error: 'Candidato no encontrado' });
  if (!candidato.evaluacion || !grupoCompleto(candidato.evaluacion, VITALES)) {
    return res.status(400).json({ error: 'Primero completa los 6 vitales' });
  }
  const { error, data } = leerGrupo(req.body, VALORES);
  if (error) return res.status(400).json({ error });

  const evaluacion = await prisma.evaluacionCandidato.update({
    where: { candidatoId: candidato.id },
    data: { ...data, evaluadorId: req.user.id, valoresCompletadosEn: new Date() },
  });
  const semaforo = calcularSemaforo(evaluacion);
  await prisma.candidato.update({ where: { id: candidato.id }, data: { semaforo } });
  res.json({ evaluacion, semaforo });
}));

// Borrado lógico: archiva (mismo patrón que Cliente); restaurar con
// PATCH { archivado: false }. Las citas del candidato se conservan.
router.delete('/:id', asyncHandler(async (req, res) => {
  const existente = await prisma.candidato.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'Candidato no encontrado' });
  await prisma.candidato.update({ where: { id: req.params.id }, data: { archivadoEn: new Date() } });
  res.json({ ok: true, archivado: true });
}));

export default router;
