import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion, logPermiso, ROLES_ASIGNABLES } from '../middleware/permisos.js';
import { enviarInvitacion } from '../services/mailer.js';

const router = Router();
router.use(authenticate);

const HORAS_INVITACION = 72;
const nuevaInvitacion = () => ({
  token: crypto.randomBytes(32).toString('base64url'),
  expiraEn: new Date(Date.now() + HORAS_INVITACION * 60 * 60 * 1000),
});

// Mismo origen que sirve la SPA y la API (single service en Railway); en
// desarrollo cae al puerto de Vite. Se usa para armar el link del correo.
const origenApp = (req) => process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;

// Devuelve la invitación vigente de un usuario inactivo, o crea una nueva (y
// manda el correo) si no había una, venció o ya se usó. `forzarNueva` es para
// la acción explícita "Invitar": ahí siempre se reemplaza, aunque la vigente
// siga viva. correoEnviado: true/false si se intentó mandar un correo nuevo,
// null si se reusó una invitación vigente (para no espamear en cada edición
// menor de un usuario que sigue pendiente de activar).
async function obtenerOCrearInvitacion(usuario, req, { forzarNueva = false } = {}) {
  const actual = forzarNueva ? null : await prisma.invitacionUsuario.findUnique({ where: { usuarioId: usuario.id } });
  const vigente = actual && !actual.usadaEn && actual.expiraEn > new Date();
  if (vigente) return { token: actual.token, expiraEn: actual.expiraEn, correoEnviado: null };

  const { token, expiraEn } = nuevaInvitacion();
  await prisma.invitacionUsuario.upsert({
    where: { usuarioId: usuario.id },
    update: { token, expiraEn, usadaEn: null, creadoPorId: req.user.id },
    create: { usuarioId: usuario.id, token, expiraEn, creadoPorId: req.user.id },
  });
  await logPermiso(req.user, 'INVITACION_CREADA', {
    usuarioId: usuario.id,
    usuarioNombre: `${usuario.nombre} ${usuario.apellidoP || ''}`.trim(),
  });

  let correoEnviado = false;
  try {
    correoEnviado = await enviarInvitacion({ email: usuario.email, nombre: usuario.nombre, link: `${origenApp(req)}/invitacion/${token}`, expiraEn });
  } catch (e) {
    console.error('[mailer] no se pudo enviar la invitación:', e.message);
  }
  return { token, expiraEn, correoEnviado };
}

// El CRUD de usuarios pertenece a la sección "Asesores" (permiso enforced en
// servidor, además del rol). /asesores y /promotores quedan fuera: son
// selectores transversales que usan otras secciones (filtros, acompañamiento).
router.get('/', esAdmin, permiteSeccion('asesores'), asyncHandler(async (req, res) => {
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
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, rol: true, activo: true, claveAgente: true, creadoEn: true },
    orderBy: { creadoEn: 'desc' },
  });
  res.json(usuarios);
}));

router.get('/asesores', esAdmin, asyncHandler(async (_req, res) => {
  const asesores = await prisma.usuario.findMany({
    where: { rol: 'ASESOR', activo: true },
    // claveAgente: la usa la ficha de póliza cuando un promotor captura sobre
    // la cartera de un asesor (la clave que va en la póliza es la del dueño).
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, claveAgente: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(asesores);
}));

// Promotores del negocio — accesible para todo autenticado. Lo usan el alta de
// citas de acompañamiento, la capa de disponibilidad del calendario y el
// selector de reclutador de candidatos.
// Solo ADMIN: el SUPERADMIN es la cuenta de quien desarrolla el servicio, no
// una promotora real, así que no debe ofrecerse como persona con quien agendar
// (sí sigue visible en Asesores → Equipo y Configuración, que son pantallas de
// administración de cuentas).
router.get('/promotores', asyncHandler(async (_req, res) => {
  const promotores = await prisma.usuario.findMany({
    where: { rol: 'ADMIN', activo: true },
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(promotores);
}));

// Toda alta nace inactiva: no hay password que fije el promotor (ni registro
// abierto). La cuenta solo entra cuando se redime el link de invitación
// (routes/invitaciones.js) — ahí la persona crea su propia contraseña y
// confirma con la cuenta de Google del correo exacto de aquí.
router.post('/', esAdmin, permiteSeccion('asesores'), asyncHandler(async (req, res) => {
  const { nombre, apellidoP, apellidoM, email, telefono, rol, claveAgente } = req.body || {};
  if (!nombre || !apellidoP || !email) return res.status(400).json({ error: 'nombre, apellidoP y email son requeridos' });
  const rolFinal = rol || 'ASESOR';
  // SUPERADMIN no se crea desde la app (ni el propio superadmin): es un solo
  // rol reservado para quien desarrolla el servicio, se siembra por env/seed.
  if (!ROLES_ASIGNABLES.includes(rolFinal)) return res.status(400).json({ error: 'Rol inválido' });

  const existe = await prisma.usuario.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existe) return res.status(409).json({ error: 'Email ya registrado' });

  // Hash aleatorio irrecuperable: la cuenta solo se activa por invitación,
  // donde la persona fija su propia contraseña.
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const data = {
    nombre, apellidoP, apellidoM, email: String(email).toLowerCase(), password: hash, telefono, rol: rolFinal,
    claveAgente: claveAgente ? String(claveAgente).trim().slice(0, 40) : null,
    activo: false,
  };
  const usuario = await prisma.usuario.create({
    data,
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, rol: true, activo: true, claveAgente: true, creadoEn: true },
  });
  await logPermiso(req.user, 'USUARIO_CREADO', {
    usuarioId: usuario.id,
    usuarioNombre: `${usuario.nombre} ${usuario.apellidoP || ''}`.trim(),
    rol: rolFinal,
  });

  // El correo es "mejor esfuerzo": si falla o no hay SMTP configurado, el
  // recuadro con el link para copiar/compartir a mano sigue apareciendo igual
  // (no bloquea la respuesta ni la creación del usuario) — pero sí se espera
  // el intento para poder informar en el panel si realmente se envió.
  const invitacion = await obtenerOCrearInvitacion(usuario, req, { forzarNueva: true });

  res.status(201).json({ ...usuario, invitacion });
}));

// Genera (o reemplaza, si el anterior venció o no llegó a compartirse) el
// link de invitación de una cuenta inactiva. No aplica a cuentas ya activas.
router.post('/:id/invitacion', esAdmin, permiteSeccion('asesores'), asyncHandler(async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (usuario.activo) return res.status(400).json({ error: 'El usuario ya está activo' });

  const invitacion = await obtenerOCrearInvitacion(usuario, req, { forzarNueva: true });
  res.json(invitacion);
}));

router.patch('/:id', esAdmin, permiteSeccion('asesores'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  // No existen excepciones de permisos por usuario (el acceso es por rol, ver
  // /api/configuracion); este PATCH ignora `permisos` si llega.
  const { nombre, apellidoP, apellidoM, telefono, rol, activo, password, claveAgente } = req.body || {};
  const data = {};
  if (nombre) data.nombre = nombre;
  if (apellidoP) data.apellidoP = apellidoP;
  if (apellidoM !== undefined) data.apellidoM = apellidoM;
  if (telefono !== undefined) data.telefono = telefono;
  // Clave de agente de la compañía: la ficha de cada póliza la lee de aquí.
  if (claveAgente !== undefined) data.claveAgente = claveAgente ? String(claveAgente).trim().slice(0, 40) : null;
  let previo = null;
  if (rol) {
    previo = await prisma.usuario.findUnique({ where: { id }, select: { rol: true, nombre: true, apellidoP: true } });
    if (!previo) return res.status(404).json({ error: 'Usuario no encontrado' });
    // El formulario de edición reenvía el rol actual aunque no cambie (para no
    // romper ediciones de otros campos); solo se valida si es un cambio real.
    if (previo.rol !== rol) {
      // SUPERADMIN no se asigna ni se modifica desde la app (rol reservado,
      // sembrado por env; ver POST / y Configuración → "Roles y accesos").
      if (previo.rol === 'SUPERADMIN' || rol === 'SUPERADMIN') {
        return res.status(400).json({ error: 'El rol Súper Admin no se puede asignar ni modificar desde la app' });
      }
      if (!ROLES_ASIGNABLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
      // Anti-lockout: nadie cambia su propio rol (evita auto-degradarse o escalar).
      if (id === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
      data.rol = rol;
    }
  }
  if (activo !== undefined) data.activo = activo === true || activo === 'true';
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password mínimo 6 caracteres' });
    data.password = await bcrypt.hash(password, 10);
  }
  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, nombre: true, apellidoP: true, apellidoM: true, email: true, telefono: true, rol: true, activo: true, claveAgente: true },
  });
  if (previo && previo.rol !== usuario.rol) {
    await logPermiso(req.user, 'ROL_USUARIO', {
      usuarioId: usuario.id,
      usuarioNombre: `${usuario.nombre} ${usuario.apellidoP || ''}`.trim(),
      antes: previo.rol,
      ahora: usuario.rol,
    });
  }

  // Si tras guardar el usuario sigue (o queda) inactivo, siempre hay que
  // poder mostrar su invitación en el panel — no solo la primera vez que se
  // crea. Reusa la vigente si existe (no re-manda correo en cada edición
  // menor); si venció, se usó o nunca se creó, genera una nueva y sí manda
  // correo. Antes esto solo pasaba en POST /, así que editar un usuario
  // inactivo (p. ej. para corregir un dato) dejaba sin link/aviso visibles.
  const invitacion = usuario.activo ? null : await obtenerOCrearInvitacion(usuario, req);
  res.json({ ...usuario, invitacion });
}));

// Borrado permanente (no es el archivado/soft-delete de Cliente): la fila del
// usuario desaparece de la base de datos. Antes de borrar se verifica que no
// tenga datos de negocio asociados (clientes, pólizas, citas, actividad,
// metas, bonos, notas, referidos, documentos) — si los tiene, la mayoría de
// esas relaciones son onDelete: Cascade en el schema y un borrado directo se
// llevaría esos registros consigo sin avisar; en ese caso se rechaza y se
// sugiere desactivar la cuenta en su lugar (conserva el historial).
// Excepción: SUPERADMIN puede forzar el borrado (con `forzar: true` en el
// body) y llevarse en cascada toda esa cartera — pensado para dar de baja
// definitivamente a un asesor que ya no sigue en la promotora. ADMIN nunca
// puede forzarlo, solo SUPERADMIN.
router.delete('/:id', esAdmin, permiteSeccion('asesores'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (usuario.rol === 'SUPERADMIN') return res.status(400).json({ error: 'El Súper Admin no se puede eliminar' });

  const [clientes, ventas, citas, actividad, targets, bonos, notas, referidos, documentos] = await Promise.all([
    prisma.cliente.count({ where: { asesorId: id } }),
    prisma.venta.count({ where: { asesorId: id } }),
    prisma.cita.count({ where: { asesorId: id } }),
    prisma.actividad.count({ where: { asesorId: id } }),
    prisma.target.count({ where: { asesorId: id } }),
    prisma.bono.count({ where: { asesorId: id } }),
    prisma.nota.count({ where: { asesorId: id } }),
    prisma.referido.count({ where: { asesorId: id } }),
    prisma.documentoCliente.count({ where: { asesorId: id } }),
  ]);
  const conteos = { clientes, ventas, citas, actividad, targets, bonos, notas, referidos, documentos };
  const tieneDatos = Object.values(conteos).some((n) => n > 0);

  if (tieneDatos) {
    const puedeForzar = req.user.rol === 'SUPERADMIN';
    if (!puedeForzar || !req.body?.forzar) {
      return res.status(409).json({
        error: 'No se puede eliminar: el usuario ya tiene clientes, pólizas, citas u otra actividad registrada. Desactiva la cuenta en su lugar para conservar el historial.',
        conteos,
        puedeForzar,
      });
    }
  }

  await prisma.usuario.delete({ where: { id } });
  await logPermiso(req.user, 'USUARIO_ELIMINADO', {
    usuarioId: usuario.id,
    usuarioNombre: `${usuario.nombre} ${usuario.apellidoP || ''}`.trim(),
    ...(tieneDatos ? { forzado: true, conteos } : {}),
  });
  res.json({ ok: true });
}));

export default router;
