import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin, esSuperadmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(authenticate);

router.get('/', esAdmin, asyncHandler(async (req, res) => {
  const { rol, activo, q } = req.query;
  const where = {};
  if (rol) where.rol = rol;
  if (activo !== undefined) where.activo = activo === 'true';
  if (q) where.OR = [
    { nombre: { contains: q, mode: 'insensitive' } },
    { apellidoP: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
  ];
  const usuarios = await prisma.usuario.findMany({
    where,
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, rol: true, activo: true, permisos: true, creadoEn: true },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(usuarios);
}));

router.get('/asesores', esAdmin, asyncHandler(async (_req, res) => {
  const asesores = await prisma.usuario.findMany({
    where: { rol: 'ASESOR', activo: true },
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(asesores);
}));

// Promotores (admin/superadmin) — accesible para todo autenticado.
// Lo usa el asesor al agendar una cita de acompañamiento.
router.get('/promotores', asyncHandler(async (_req, res) => {
  const promotores = await prisma.usuario.findMany({
    where: { rol: { in: ['ADMIN', 'SUPERADMIN'] }, activo: true },
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(promotores);
}));

router.post('/', esAdmin, asyncHandler(async (req, res) => {
  const { nombre, apellidoP, apellidoM, email, password, telefono, rol, permisos } = req.body || {};
  if (!nombre || !apellidoP || !email || !password) return res.status(400).json({ error: 'nombre, apellidoP, email y password son requeridos' });
  const rolFinal = rol || 'ASESOR';
  if (!['SUPERADMIN', 'ADMIN', 'ASESOR'].includes(rolFinal)) return res.status(400).json({ error: 'Rol inválido' });
  if (rolFinal === 'SUPERADMIN' && req.user.rol !== 'SUPERADMIN') return res.status(403).json({ error: 'Solo SUPERADMIN puede crear SUPERADMIN' });
  if (password.length < 6) return res.status(400).json({ error: 'Password mínimo 6 caracteres' });

  const existe = await prisma.usuario.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existe) return res.status(409).json({ error: 'Email ya registrado' });

  const hash = await bcrypt.hash(password, 10);
  const data = { nombre, apellidoP, apellidoM, email: String(email).toLowerCase(), password: hash, telefono, rol: rolFinal };
  if (permisos && typeof permisos === 'object' && !Array.isArray(permisos)) {
    const permitidas = ['dashboard', 'clientes', 'citas', 'ventas', 'actividad', 'asesores', 'configuracion', 'metas'];
    data.permisos = Object.fromEntries(Object.entries(permisos).filter(([k, v]) => permitidas.includes(k) && typeof v === 'boolean'));
  }
  const usuario = await prisma.usuario.create({
    data,
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, rol: true, activo: true, permisos: true, creadoEn: true },
  });
  res.status(201).json(usuario);
}));

router.patch('/:id', esAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, apellidoP, apellidoM, telefono, rol, activo, password, permisos } = req.body || {};
  const data = {};
  if (nombre) data.nombre = nombre;
  if (apellidoP) data.apellidoP = apellidoP;
  if (apellidoM !== undefined) data.apellidoM = apellidoM;
  if (telefono !== undefined) data.telefono = telefono;
  if (rol) {
    if (!['SUPERADMIN', 'ADMIN', 'ASESOR'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    if (rol === 'SUPERADMIN' && req.user.rol !== 'SUPERADMIN') return res.status(403).json({ error: 'Solo SUPERADMIN puede asignar SUPERADMIN' });
    data.rol = rol;
  }
  if (activo !== undefined) data.activo = activo === true || activo === 'true';
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password mínimo 6 caracteres' });
    data.password = await bcrypt.hash(password, 10);
  }
  if (permisos !== undefined) {
    // Valida que permisos sea un objeto plano con valores boolean por sección
    if (permisos === null) {
      data.permisos = null;
    } else if (typeof permisos === 'object' && !Array.isArray(permisos)) {
      const permitidas = ['dashboard', 'clientes', 'citas', 'ventas', 'actividad', 'asesores', 'configuracion', 'metas'];
      const limpio = {};
      for (const [k, v] of Object.entries(permisos)) {
        if (!permitidas.includes(k)) continue;
        if (typeof v === 'boolean') limpio[k] = v;
      }
      data.permisos = limpio;
    } else {
      return res.status(400).json({ error: 'permisos debe ser un objeto o null' });
    }
  }
  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, rol: true, activo: true, permisos: true },
  });
  res.json(usuario);
}));

router.delete('/:id', esSuperadmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  await prisma.usuario.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
