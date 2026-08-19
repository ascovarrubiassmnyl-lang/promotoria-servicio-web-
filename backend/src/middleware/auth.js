import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, nombre: true, apellidoP: true, email: true, rol: true, activo: true },
    });
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Usuario inválido o inactivo' });

    req.user = usuario;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permisos para esta acción' });
    next();
  };
}

// Roles con alcance de administración ("promotor" en el lenguaje del negocio).
// ASISTENTE es la secretaría: mismo acceso que ADMIN, pero no es promotora
// (ver GET /usuarios/promotores, que sigue filtrando solo ADMIN).
export const ROLES_ADMIN = ['SUPERADMIN', 'ADMIN', 'ASISTENTE'];

// Única definición de "es admin" para checks en línea dentro de una ruta
// (dueño o admin). No re-escribir la comparación de roles a mano.
export const tieneRolAdmin = (user) => ROLES_ADMIN.includes(user?.rol);

export const esAdmin = authorize(...ROLES_ADMIN);
export const esSuperadmin = authorize('SUPERADMIN');
