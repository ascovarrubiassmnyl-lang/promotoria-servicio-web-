import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { accesoEfectivo } from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);

// Recordatorio para el asesor (su propia gestión) vs. para el cliente (algo
// que hay que tratar con él). Ambos le llegan al asesor: el CRM no tiene canal
// hacia el asegurado, así que "para el cliente" = "el asesor debe contactarlo".
const DESTINATARIOS = ['ASESOR', 'CLIENTE'];

// Una nota cuelga de un cliente O de un candidato a asesor, nunca de ambos
// (excluyentes, igual que en Cita; la BD lo respalda con el CHECK
// `Nota_sujeto_unico`). El permiso de sección depende del sujeto: las notas de
// cartera son sección `clientes` y las de reclutamiento `candidatos` — por eso
// el router no lleva un `permiteSeccion` fijo y cada handler resuelve el suyo,
// fallando cerrado como el resto del sistema.
const seccionDe = (nota) => (nota.candidatoId ? 'candidatos' : 'clientes');

async function permite(req, seccion) {
  return accesoEfectivo(req.user, seccion);
}

// Resuelve el sujeto de una nota nueva: valida que exista, que el actor tenga
// la sección correspondiente y de quién es la nota. Devuelve { error, status }
// o { data } con los campos listos para el create.
async function resolverSujeto(req, { clienteId, candidatoId }) {
  if (clienteId && candidatoId) {
    return { status: 400, error: 'Una nota es de un cliente o de un candidato, no de ambos' };
  }

  if (candidatoId) {
    if (!(await permite(req, 'candidatos'))) return { status: 403, error: 'Sin acceso a candidatos' };
    const candidato = await prisma.candidato.findUnique({ where: { id: candidatoId } });
    if (!candidato) return { status: 400, error: 'Candidato no encontrado' };
    // El módulo de candidatos tiene piso de rol ADMIN/SUPERADMIN y no está
    // scopeado por asesor: el reclutador que la escribe es el dueño de la nota.
    return { data: { candidatoId, asesorId: req.user.id } };
  }

  if (!clienteId) return { status: 400, error: 'clienteId o candidatoId es requerido' };
  if (!(await permite(req, 'clientes'))) return { status: 403, error: 'Sin acceso a clientes' };
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return { status: 400, error: 'Cliente no encontrado' };
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) {
    return { status: 403, error: 'Sin acceso a este cliente' };
  }
  return {
    data: { clienteId, asesorId: req.user.rol === 'ASESOR' ? req.user.id : cliente.asesorId },
  };
}

// GET /notas?clienteId=…&candidatoId=…&tipo=…&destinatario=…&pendientes=true
router.get('/', asyncHandler(async (req, res) => {
  const { clienteId, candidatoId, tipo, destinatario, pendientes } = req.query;
  const seccion = candidatoId ? 'candidatos' : 'clientes';
  if (!(await permite(req, seccion))) return res.status(403).json({ error: 'Sin acceso a esta sección' });

  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  if (candidatoId) where.candidatoId = candidatoId;
  else if (clienteId) where.clienteId = clienteId;
  // Sin sujeto explícito la consulta es la bandeja de cartera de siempre: no
  // debe mezclar notas de reclutamiento, que son de otra sección.
  else where.candidatoId = null;
  if (tipo) where.tipo = tipo;
  if (DESTINATARIOS.includes(destinatario)) where.destinatario = destinatario;
  if (pendientes === 'true') where.completada = false;

  const notas = await prisma.nota.findMany({
    where,
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true } },
      candidato: { select: { id: true, nombre: true, apellidoP: true } },
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(notas);
}));

// POST /notas
router.post('/', asyncHandler(async (req, res) => {
  const { clienteId, candidatoId, tipo, texto, fechaAviso, destinatario } = req.body || {};
  if (!texto) return res.status(400).json({ error: 'texto es requerido' });

  const { error, status, data } = await resolverSujeto(req, { clienteId, candidatoId });
  if (error) return res.status(status).json({ error });

  const nota = await prisma.nota.create({
    data: {
      ...data,
      tipo: tipo || 'NOTA',
      destinatario: DESTINATARIOS.includes(destinatario) ? destinatario : 'ASESOR',
      texto,
      fechaAviso: fechaAviso ? new Date(fechaAviso) : null,
    },
    include: {
      cliente: { select: { id: true, nombre: true, apellidoP: true } },
      candidato: { select: { id: true, nombre: true, apellidoP: true } },
    },
  });
  res.status(201).json(nota);
}));

// Dueño de la nota o admin con la sección del sujeto. Devuelve la nota o null.
async function notaAccesible(req, id) {
  const nota = await prisma.nota.findUnique({ where: { id } });
  if (!nota) return { status: 404, error: 'Nota no encontrada' };
  if (!(await permite(req, seccionDe(nota)))) return { status: 403, error: 'Sin acceso a esta sección' };
  if (req.user.rol === 'ASESOR' && nota.asesorId !== req.user.id) {
    return { status: 403, error: 'Sin acceso a esta nota' };
  }
  return { nota };
}

// PATCH /notas/:id — actualizar texto, marcar completada, cambiar fechaAviso
router.patch('/:id', asyncHandler(async (req, res) => {
  const { error, status } = await notaAccesible(req, req.params.id);
  if (error) return res.status(status).json({ error });

  const { texto, completada, fechaAviso, tipo, destinatario } = req.body || {};
  const data = {};
  if (texto !== undefined) data.texto = texto;
  if (completada !== undefined) data.completada = completada;
  if (fechaAviso !== undefined) {
    data.fechaAviso = fechaAviso ? new Date(fechaAviso) : null;
    // Reabrir la ventana de avisos: mover la fecha debe volver a notificar.
    data.notificacionEnviada = false;
    data.avisoPrevioEnviado = false;
  }
  if (tipo) data.tipo = tipo;
  if (DESTINATARIOS.includes(destinatario)) data.destinatario = destinatario;
  const nota = await prisma.nota.update({ where: { id: req.params.id }, data });
  res.json(nota);
}));

// DELETE /notas/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { error, status } = await notaAccesible(req, req.params.id);
  if (error) return res.status(status).json({ error });
  await prisma.nota.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
