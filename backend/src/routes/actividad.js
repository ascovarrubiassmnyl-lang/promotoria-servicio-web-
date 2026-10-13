import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('actividad'));

router.get('/', asyncHandler(async (req, res) => {
  const { asesorId, desde, hasta, limit, tipo, clienteId } = req.query;
  const where = {};
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (tipo) where.tipo = tipo;
  // Actividad de un cliente concreto (expediente): filtra por metadata.clienteId
  if (clienteId) where.metadata = { path: ['clienteId'], equals: clienteId };
  if (desde || hasta) {
    where.creadoEn = {};
    if (desde) where.creadoEn.gte = new Date(desde);
    if (hasta) where.creadoEn.lte = new Date(hasta);
  }
  const actividades = await prisma.actividad.findMany({
    where,
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
    orderBy: { creadoEn: 'desc' },
    take: Math.min(parseInt(limit) || 50, 200),
  });
  res.json(actividades);
}));

// Registrar una llamada vive en POST /clientes/:id/llamada (sección clientes,
// con la propagación completa en utils/seguimiento.js).

export default router;
