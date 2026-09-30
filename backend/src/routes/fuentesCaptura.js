import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, tieneRolAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { generarClave, normalizarDominio, etapaSeleccionable, recortar } from '../utils/captura.js';

// Autoservicio de "Leads de landing pages": cada usuario administra SUS
// fuentes (una por landing / formulario conectado, con el nombre que él elija).
// Solo `authenticate`, sin permiteSeccion — igual que /api/push: es
// configuración personal, cualquier rol puede tener sus landings.
//
// Alcance, fallando cerrado:
//  - Crear, editar, pausar, regenerar y borrar: SOLO el dueño (sin excepción
//    de admin — una clave ajena no se toca).
//  - Consultar: cada quien lo suyo; un promotor (tieneRolAdmin) puede pedir
//    `?todos=1` para ver las fuentes y leads de todo el equipo en lectura,
//    coherente con que ya ve la cartera de todos en el CRM.
const router = Router();
router.use(authenticate);

const MAX_FUENTES = 50;
const MAX_DOMINIOS = 10;
const USUARIO_SELECT = { select: { id: true, nombre: true, apellidoP: true } };

const verTodos = (req) => req.query.todos === '1' && tieneRolAdmin(req.user);

function limpiarDominios(lista) {
  if (lista === undefined) return undefined;
  const arr = Array.isArray(lista) ? lista : String(lista || '').split(/[\s,]+/);
  return [...new Set(arr.map(normalizarDominio).filter(Boolean))].slice(0, MAX_DOMINIOS);
}

async function fuentePropia(req, res) {
  const fuente = await prisma.fuenteCaptura.findUnique({ where: { id: req.params.id } });
  if (!fuente) { res.status(404).json({ error: 'Fuente no encontrada' }); return null; }
  if (fuente.usuarioId !== req.user.id) { res.status(403).json({ error: 'Solo el dueño puede modificar esta fuente' }); return null; }
  return fuente;
}

// GET /fuentes-captura — fuentes con sus contadores.
router.get('/', asyncHandler(async (req, res) => {
  const where = verTodos(req) ? {} : { usuarioId: req.user.id };
  const fuentes = await prisma.fuenteCaptura.findMany({
    where,
    orderBy: { creadoEn: 'desc' },
    include: { usuario: USUARIO_SELECT },
  });
  // "Nuevos sin ver" por fuente: clientes que llegaron por ella y el dueño
  // todavía no abre.
  const sinVer = await prisma.cliente.groupBy({
    by: ['fuenteCapturaId'],
    where: { fuenteCapturaId: { in: fuentes.map((f) => f.id) }, leadSinVer: true, archivadoEn: null },
    _count: { _all: true },
  });
  const mapa = Object.fromEntries(sinVer.map((s) => [s.fuenteCapturaId, s._count._all]));
  res.json(fuentes.map((f) => ({ ...f, sinVer: mapa[f.id] || 0, esMia: f.usuarioId === req.user.id })));
}));

// GET /fuentes-captura/sin-ver — conteo para el badge del menú (solo lo propio).
router.get('/sin-ver', asyncHandler(async (req, res) => {
  const total = await prisma.cliente.count({
    where: { asesorId: req.user.id, leadSinVer: true, archivadoEn: null },
  });
  res.json({ total });
}));

// PATCH /fuentes-captura/sin-ver — "marcar todos como vistos" (solo lo propio).
router.patch('/sin-ver', asyncHandler(async (req, res) => {
  const r = await prisma.cliente.updateMany({
    where: { asesorId: req.user.id, leadSinVer: true },
    data: { leadSinVer: false },
  });
  res.json({ actualizados: r.count });
}));

// GET /fuentes-captura/leads — bitácora de envíos recibidos, paginada.
// Filtros: fuenteId, resultado (CREADO|DUPLICADO|CITA_AGENDADA|SPAM; por defecto oculta SPAM).
router.get('/leads', asyncHandler(async (req, res) => {
  const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 25, 1), 100);
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const where = verTodos(req) ? {} : { fuente: { usuarioId: req.user.id } };
  if (req.query.fuenteId) where.fuenteId = String(req.query.fuenteId);
  if (['CREADO', 'DUPLICADO', 'CITA_AGENDADA', 'SPAM'].includes(req.query.resultado)) where.resultado = req.query.resultado;
  else where.resultado = { not: 'SPAM' };
  // Un asesor nunca debe ver capturas de fuentes ajenas aunque mande el
  // fuenteId de otro: el `fuente.usuarioId` de arriba sigue aplicando.

  const [total, leads] = await Promise.all([
    prisma.capturaLead.count({ where }),
    prisma.capturaLead.findMany({
      where,
      orderBy: { recibidoEn: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true, resultado: true, nombre: true, telefono: true, email: true, modalidad: true,
        origen: true, etapaOriginal: true, fechaEnvio: true, datosExtra: true, recibidoEn: true,
        fuente: { select: { id: true, nombre: true, usuario: USUARIO_SELECT } },
        cliente: { select: { id: true, nombre: true, apellidoP: true, estado: true, leadSinVer: true, archivadoEn: true } },
        cita: { select: { id: true, fechaHoraInicio: true, estado: true } },
      },
    }),
  ]);
  res.json({ total, pagina, paginas: Math.max(Math.ceil(total / porPagina), 1), leads });
}));

// POST /fuentes-captura — nueva fuente (una por landing).
router.post('/', asyncHandler(async (req, res) => {
  const nombre = recortar(req.body?.nombre, 80);
  if (!nombre) return res.status(400).json({ error: 'Ponle un nombre a la fuente (ej. "Landing tarjeta QR")' });
  const etapaInicial = req.body?.etapaInicial || 'PROSPECTO';
  if (!etapaSeleccionable(etapaInicial)) return res.status(400).json({ error: 'Etapa inicial no válida' });
  const total = await prisma.fuenteCaptura.count({ where: { usuarioId: req.user.id } });
  if (total >= MAX_FUENTES) return res.status(400).json({ error: `Máximo ${MAX_FUENTES} fuentes por usuario` });

  const fuente = await prisma.fuenteCaptura.create({
    data: {
      usuarioId: req.user.id,
      nombre,
      clave: generarClave(),
      etapaInicial,
      dominiosPermitidos: limpiarDominios(req.body?.dominiosPermitidos) || [],
    },
    include: { usuario: USUARIO_SELECT },
  });
  res.status(201).json({ ...fuente, sinVer: 0, esMia: true });
}));

// PATCH /fuentes-captura/:id — renombrar, pausar/activar, etapa, dominios.
router.patch('/:id', asyncHandler(async (req, res) => {
  const fuente = await fuentePropia(req, res);
  if (!fuente) return;
  const data = {};
  if (req.body?.nombre !== undefined) {
    const nombre = recortar(req.body.nombre, 80);
    if (!nombre) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
    data.nombre = nombre;
  }
  if (req.body?.activa !== undefined) data.activa = Boolean(req.body.activa);
  if (req.body?.etapaInicial !== undefined) {
    if (!etapaSeleccionable(req.body.etapaInicial)) return res.status(400).json({ error: 'Etapa inicial no válida' });
    data.etapaInicial = req.body.etapaInicial;
  }
  const dominios = limpiarDominios(req.body?.dominiosPermitidos);
  if (dominios !== undefined) data.dominiosPermitidos = dominios;
  const actualizada = await prisma.fuenteCaptura.update({ where: { id: fuente.id }, data, include: { usuario: USUARIO_SELECT } });
  res.json({ ...actualizada, esMia: true });
}));

// POST /fuentes-captura/:id/regenerar — nueva clave; la anterior deja de
// funcionar al instante (hay que actualizar la URL en la landing).
router.post('/:id/regenerar', asyncHandler(async (req, res) => {
  const fuente = await fuentePropia(req, res);
  if (!fuente) return;
  const actualizada = await prisma.fuenteCaptura.update({
    where: { id: fuente.id },
    data: { clave: generarClave() },
    include: { usuario: USUARIO_SELECT },
  });
  res.json({ ...actualizada, esMia: true });
}));

// DELETE /fuentes-captura/:id — borra la fuente. Los leads que ya entraron se
// quedan en el CRM (Cliente.fuenteCapturaId y CapturaLead.fuenteId → null).
router.delete('/:id', asyncHandler(async (req, res) => {
  const fuente = await fuentePropia(req, res);
  if (!fuente) return;
  // Las capturas sin cliente (spam) ya no le sirven a nadie sin su fuente:
  // se van con ella. Las ligadas a un cliente se quedan en su ficha.
  await prisma.$transaction([
    prisma.capturaLead.deleteMany({ where: { fuenteId: fuente.id, clienteId: null } }),
    prisma.fuenteCaptura.delete({ where: { id: fuente.id } }),
  ]);
  res.json({ ok: true });
}));

export default router;
