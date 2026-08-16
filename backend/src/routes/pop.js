import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { validarPreguntas, validarUmbrales, puntosPosibles } from '../utils/pop.js';

// POP propio de la promotoría: plantillas de cuestionario y envíos por
// candidato. Todo este router exige la sección `candidatos` (que tiene piso de
// rol ADMIN/SUPERADMIN) — el candidato NO entra por aquí, contesta en el
// router público `routes/popPublico.js` con su token de un solo uso.
const router = Router();
router.use(authenticate);
router.use(permiteSeccion('candidatos'));

// Vigencia del link que se le manda al candidato. 14 días: el POP se contesta
// en una sentada, pero la persona puede tardar días en abrirlo.
const DIAS_VIGENCIA = 14;

const seleccionEnvio = {
  id: true, candidatoId: true, plantillaId: true, token: true, expiraEn: true,
  estado: true, puntaje: true, puntosObtenidos: true, puntosPosibles: true,
  recomendacion: true, bloques: true, respondidoEn: true, abiertoEn: true,
  creadoEn: true,
  plantilla: { select: { id: true, nombre: true, umbralVerde: true, umbralAmarillo: true } },
  enviadoPor: { select: { id: true, nombre: true, apellidoP: true } },
};

// ─── Plantillas ────────────────────────────────────────────────────────────

router.get('/plantillas', asyncHandler(async (req, res) => {
  const plantillas = await prisma.popPlantilla.findMany({
    where: { archivadaEn: req.query.archivadas === '1' ? { not: null } : null },
    include: {
      creadoPor: { select: { id: true, nombre: true, apellidoP: true } },
      _count: { select: { envios: true } },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(plantillas.map((p) => ({ ...p, puntosPosibles: puntosPosibles(p.preguntas) })));
}));

router.get('/plantillas/:id', asyncHandler(async (req, res) => {
  const plantilla = await prisma.popPlantilla.findUnique({
    where: { id: req.params.id },
    include: { creadoPor: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  if (!plantilla) return res.status(404).json({ error: 'Cuestionario no encontrado' });
  res.json({ ...plantilla, puntosPosibles: puntosPosibles(plantilla.preguntas) });
}));

router.post('/plantillas', asyncHandler(async (req, res) => {
  const { nombre, descripcion, preguntas, umbralVerde, umbralAmarillo } = req.body || {};
  if (!nombre?.trim()) return res.status(400).json({ error: 'El cuestionario necesita un nombre' });

  const val = validarPreguntas(preguntas);
  if (val.error) return res.status(400).json({ error: val.error });
  const umbrales = validarUmbrales(umbralVerde ?? 70, umbralAmarillo ?? 40);
  if (umbrales.error) return res.status(400).json({ error: umbrales.error });

  const plantilla = await prisma.popPlantilla.create({
    data: {
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || null,
      preguntas: val.preguntas,
      umbralVerde: umbrales.umbralVerde,
      umbralAmarillo: umbrales.umbralAmarillo,
      creadoPorId: req.user.id,
    },
  });
  res.status(201).json(plantilla);
}));

router.patch('/plantillas/:id', asyncHandler(async (req, res) => {
  const existente = await prisma.popPlantilla.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'Cuestionario no encontrado' });

  const { nombre, descripcion, preguntas, umbralVerde, umbralAmarillo, archivada } = req.body || {};
  const data = {};
  if (nombre !== undefined) {
    if (!nombre?.trim()) return res.status(400).json({ error: 'El cuestionario necesita un nombre' });
    data.nombre = nombre.trim();
  }
  if (descripcion !== undefined) data.descripcion = descripcion?.trim() || null;
  if (preguntas !== undefined) {
    // Editar la plantilla NO altera los POP ya enviados: cada envío guardó su
    // copia congelada de las preguntas (mismo criterio que Venta.coberturas).
    const val = validarPreguntas(preguntas);
    if (val.error) return res.status(400).json({ error: val.error });
    data.preguntas = val.preguntas;
  }
  if (umbralVerde !== undefined || umbralAmarillo !== undefined) {
    const umbrales = validarUmbrales(
      umbralVerde ?? existente.umbralVerde,
      umbralAmarillo ?? existente.umbralAmarillo,
    );
    if (umbrales.error) return res.status(400).json({ error: umbrales.error });
    data.umbralVerde = umbrales.umbralVerde;
    data.umbralAmarillo = umbrales.umbralAmarillo;
  }
  if (archivada === true) data.archivadaEn = new Date();
  if (archivada === false) data.archivadaEn = null;

  const plantilla = await prisma.popPlantilla.update({ where: { id: req.params.id }, data });
  res.json(plantilla);
}));

// Borrado lógico (archivar), igual que Cliente/Candidato: los envíos y sus
// resultados se conservan. `PopEnvio.plantillaId` es onDelete: Restrict, así
// que un borrado físico con envíos fallaría de todas formas.
router.delete('/plantillas/:id', asyncHandler(async (req, res) => {
  const existente = await prisma.popPlantilla.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'Cuestionario no encontrado' });
  await prisma.popPlantilla.update({ where: { id: req.params.id }, data: { archivadaEn: new Date() } });
  res.json({ ok: true, archivada: true });
}));

// ─── Envíos ────────────────────────────────────────────────────────────────

// GET /pop/envios?candidatoId=… — historial de POP de un candidato.
router.get('/envios', asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.candidatoId) where.candidatoId = req.query.candidatoId;
  const envios = await prisma.popEnvio.findMany({
    where,
    select: {
      ...seleccionEnvio,
      candidato: { select: { id: true, nombre: true, apellidoP: true } },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(envios);
}));

// Detalle con respuestas y preguntas congeladas (la vista de resultados).
router.get('/envios/:id', asyncHandler(async (req, res) => {
  const envio = await prisma.popEnvio.findUnique({
    where: { id: req.params.id },
    select: {
      ...seleccionEnvio,
      preguntas: true,
      respuestas: true,
      candidato: { select: { id: true, nombre: true, apellidoP: true, email: true, telefono: true } },
    },
  });
  if (!envio) return res.status(404).json({ error: 'POP no encontrado' });
  res.json(envio);
}));

// Genera el link de un solo uso para un candidato. No manda correo ni
// WhatsApp: igual que la invitación de usuarios, el link se copia y se
// comparte a mano (es el respaldo que siempre funciona).
router.post('/envios', asyncHandler(async (req, res) => {
  const { candidatoId, plantillaId } = req.body || {};
  if (!candidatoId || !plantillaId) {
    return res.status(400).json({ error: 'candidatoId y plantillaId son requeridos' });
  }
  const candidato = await prisma.candidato.findUnique({ where: { id: candidatoId } });
  if (!candidato) return res.status(400).json({ error: 'Candidato no encontrado' });

  const plantilla = await prisma.popPlantilla.findUnique({ where: { id: plantillaId } });
  if (!plantilla) return res.status(400).json({ error: 'Cuestionario no encontrado' });
  if (plantilla.archivadaEn) return res.status(400).json({ error: 'Ese cuestionario está archivado' });

  // Revalida al enviar: una plantilla guardada podría haber quedado sin
  // preguntas calificables si se editó por otra vía.
  const val = validarPreguntas(plantilla.preguntas);
  if (val.error) return res.status(400).json({ error: `El cuestionario no es válido: ${val.error}` });

  const expiraEn = new Date(Date.now() + DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
  const envio = await prisma.popEnvio.create({
    data: {
      candidatoId,
      plantillaId,
      token: crypto.randomBytes(32).toString('base64url'),
      expiraEn,
      // Copia congelada: el candidato contestará exactamente esto aunque la
      // plantilla cambie después.
      preguntas: val.preguntas,
      enviadoPorId: req.user.id,
    },
    select: seleccionEnvio,
  });
  res.status(201).json(envio);
}));

// Invalidar un link (se mandó por error, o se quiere reenviar limpio).
router.patch('/envios/:id/cancelar', asyncHandler(async (req, res) => {
  const existente = await prisma.popEnvio.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'POP no encontrado' });
  if (existente.estado === 'RESPONDIDO') {
    return res.status(400).json({ error: 'Ese POP ya fue contestado; sus resultados no se cancelan' });
  }
  const envio = await prisma.popEnvio.update({
    where: { id: req.params.id },
    data: { estado: 'CANCELADO' },
    select: seleccionEnvio,
  });
  res.json(envio);
}));

// Borra el envío. Un POP contestado es evidencia de evaluación: se exige
// confirmación explícita en la UI, igual que el borrado físico de una póliza.
router.delete('/envios/:id', asyncHandler(async (req, res) => {
  const existente = await prisma.popEnvio.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ error: 'POP no encontrado' });
  await prisma.popEnvio.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
