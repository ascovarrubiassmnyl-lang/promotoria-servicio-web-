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
      select: { id: true, nombre: true, apellidoP: true, email: true, rol: true, activo: true, permisos: true },
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

export const esAdmin = authorize('SUPERADMIN', 'ADMIN');
export const esSuperadmin = authorize('SUPERADMIN');
