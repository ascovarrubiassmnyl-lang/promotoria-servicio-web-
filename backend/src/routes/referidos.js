import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('clientes'));

router.get('/', asyncHandler(async (req, res) => {
  const { estado, clienteOrigenId, asesorId } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (estado) where.estado = estado;
  if (clienteOrigenId) where.clienteOrigenId = clienteOrigenId;
  const referidos = await prisma.referido.findMany({
    where,
    include: {
      clienteOrigen: { select: { id: true, nombre: true, apellidoP: true } },
      clienteReferido: { select: { id: true, nombre: true, apellidoP: true, estado: true } },
    },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(referidos);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { clienteOrigenId, clienteReferidoId, nombreReferido, telefonoReferido, emailReferido, estado, notas } = req.body || {};
  if (!clienteOrigenId) return res.status(400).json({ error: 'clienteOrigenId es requerido' });
  const origen = await prisma.cliente.findUnique({ where: { id: clienteOrigenId } });
  if (!origen) return res.status(400).json({ error: 'Cliente origen no encontrado' });
  if (req.user.rol === 'ASESOR' && origen.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a ese cliente origen' });
  const asesorId = req.user.rol === 'ASESOR' ? req.user.id : (origen.asesorId || req.user.id);
  const referido = await prisma.referido.create({
    data: {
      asesorId,
      clienteOrigenId,
      clienteReferidoId: clienteReferidoId || null,
      nombreReferido: nombreReferido || null,
      telefonoReferido: telefonoReferido || null,
      emailReferido: emailReferido || null,
      estado: estado || 'PENDIENTE',
      notas: notas || null,
    },
  });
  await registrarActividad(asesorId, 'REFERIDO_CREADO', {
    referidoId: referido.id,
    clienteOrigenId,
    clienteOrigen: `${origen.nombre} ${origen.apellidoP}`,
    referido: nombreReferido || null,
  });
  res.status(201).json(referido);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.referido.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Referido no encontrado' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este referido' });
  const { clienteReferidoId, nombreReferido, telefonoReferido, emailReferido, estado, notas } = req.body || {};
  const data = {};
  if (clienteReferidoId !== undefined) data.clienteReferidoId = clienteReferidoId || null;
  if (nombreReferido !== undefined) data.nombreReferido = nombreReferido || null;
  if (telefonoReferido !== undefined) data.telefonoReferido = telefonoReferido || null;
  if (emailReferido !== undefined) data.emailReferido = emailReferido || null;
  if (estado) data.estado = estado;
  if (notas !== undefined) data.notas = notas || null;
  const actualizado = await prisma.referido.update({ where: { id }, data });
  res.json(actualizado);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.referido.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Referido no encontrado' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este referido' });
  await prisma.referido.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
