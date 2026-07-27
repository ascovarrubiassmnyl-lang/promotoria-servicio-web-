import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esSuperadmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import {
  SECCIONES, SECCIONES_SOLO_ADMIN, getPoliticas, invalidarPoliticas, permiteSeccion, logPermiso,
} from '../middleware/permisos.js';

const router = Router();
router.use(authenticate);
// Toda la ruta exige la sección "configuracion" (fail closed). Lectura para
// quien puede ver la pantalla; escritura SOLO SUPERADMIN (decisión confirmada).
router.use(permiteSeccion('configuracion'));

// Matriz rol × sección. SUPERADMIN se sintetiza con acceso total y bloqueado.
router.get('/politicas', asyncHandler(async (_req, res) => {
  const politicas = await getPoliticas();
  res.json({
    secciones: SECCIONES,
    seccionesSoloAdmin: SECCIONES_SOLO_ADMIN,
    politicas: {
      ASESOR: politicas.ASESOR || {},
      ADMIN: politicas.ADMIN || {},
      SUPERADMIN: Object.fromEntries(SECCIONES.map((s) => [s, true])),
    },
  });
}));

// Cambia el acceso base de un rol a una sección.
router.patch('/politicas/:rol', esSuperadmin, asyncHandler(async (req, res) => {
  const { rol } = req.params;
  const { seccion, permitido } = req.body || {};
  if (rol === 'SUPERADMIN') return res.status(400).json({ error: 'El rol Súper Admin no es editable: siempre tiene acceso total' });
  if (!['ASESOR', 'ADMIN'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  if (!SECCIONES.includes(seccion)) return res.status(400).json({ error: 'Sección inválida' });
  if (typeof permitido !== 'boolean') return res.status(400).json({ error: 'permitido debe ser boolean' });
  // Piso de rol: las secciones de administración no se conceden al rol ASESOR
  // (sus rutas no tienen scoping por asesor); el middleware también lo niega.
  if (permitido && rol === 'ASESOR' && SECCIONES_SOLO_ADMIN.includes(seccion)) {
    return res.status(400).json({ error: 'Esta sección de administración requiere rol Admin' });
  }

  const politicas = await getPoliticas();
  const antes = politicas[rol]?.[seccion] === true;
  const accesos = { ...(politicas[rol] || {}), [seccion]: permitido };
  await prisma.politicaRol.upsert({
    where: { rol },
    update: { accesos },
    create: { rol, accesos },
  });
  invalidarPoliticas();
  await logPermiso(req.user, 'ROL_POLITICA', { rol, seccion, antes, ahora: permitido });
  res.json({ rol, accesos });
}));

// Usuarios (conteo por rol en la matriz). El acceso es por rol: no hay
// excepciones por usuario.
router.get('/usuarios', asyncHandler(async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, apellidoP: true, email: true, rol: true, activo: true },
    orderBy: [{ rol: 'desc' }, { nombre: 'asc' }],
  });
  res.json(usuarios);
}));

// Bitácora: quién cambió qué permiso/rol, cuándo y sobre quién.
router.get('/bitacora', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const logs = await prisma.permisoLog.findMany({ orderBy: { creadoEn: 'desc' }, take: limit });
  res.json(logs);
}));

export default router;
