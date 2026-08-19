import { prisma } from '../prisma.js';
import { ROLES_ADMIN } from './auth.js';

// Roles que se pueden asignar desde la app (alta y edición de usuarios, y la
// matriz de Configuración). SUPERADMIN queda fuera a propósito: es un solo rol
// reservado para quien desarrolla el servicio, sembrado por variables de
// entorno. Fuente única: no repetir la lista en cada ruta.
export const ROLES_ASIGNABLES = ['ADMIN', 'ASISTENTE', 'ASESOR'];

// Secciones controlables. Debe coincidir con el catálogo del frontend
// (components/configuracion/secciones.js) y con las claves de PoliticaRol.accesos.
export const SECCIONES = ['dashboard', 'clientes', 'citas', 'ventas', 'actividad', 'metas', 'puntos', 'clinica', 'candidatos', 'asesores', 'configuracion'];

// Secciones de administración: además del permiso, exigen rol ADMIN/SUPERADMIN
// (piso de rol). No se conceden a un ASESOR ni activando su toggle de rol,
// porque sus rutas no tienen scoping por asesor (vería/editaría a todo el equipo).
export const SECCIONES_SOLO_ADMIN = ['candidatos', 'asesores', 'configuracion'];

// Caché en memoria de PoliticaRol (proceso único de nodemon). Se invalida al
// escribir una política desde /api/configuracion.
let cachePoliticas = null;
export function invalidarPoliticas() { cachePoliticas = null; }

export async function getPoliticas() {
  if (!cachePoliticas) {
    const filas = await prisma.politicaRol.findMany();
    cachePoliticas = Object.fromEntries(
      filas.map((f) => [f.rol, f.accesos && typeof f.accesos === 'object' && !Array.isArray(f.accesos) ? f.accesos : {}])
    );
  }
  return cachePoliticas;
}

// Acceso efectivo de un usuario a una sección, fallando cerrado:
//   SUPERADMIN → siempre true (anti-lockout, su política no es editable);
//   piso de rol para secciones de administración;
//   política del rol; si no hay política registrada → denegar.
// El acceso es POR ROL: no hay excepciones por usuario (se eliminaron por
// redundantes con la matriz de roles; Usuario.permisos quedó legacy y no se lee).
export async function accesoEfectivo(user, seccion) {
  if (user.rol === 'SUPERADMIN') return true;
  if (SECCIONES_SOLO_ADMIN.includes(seccion) && !ROLES_ADMIN.includes(user.rol)) return false;
  const politicas = await getPoliticas();
  return politicas[user.rol]?.[seccion] === true;
}

// Mapa {seccion: boolean} con el acceso efectivo completo (para /auth/me y login).
export async function accesosDe(user) {
  const out = {};
  for (const s of SECCIONES) out[s] = await accesoEfectivo(user, s);
  return out;
}

// Middleware por grupo de rutas: 403 si el usuario no tiene la sección.
export const permiteSeccion = (seccion) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (await accesoEfectivo(req.user, seccion)) return next();
    return res.status(403).json({ error: 'Sin acceso a esta sección' });
  } catch (err) { next(err); }
};

// Variante para rutas compartidas por varias secciones (ej. /metricas la usan
// Dashboard y Asesores): pasa si el usuario tiene acceso a alguna.
export const permiteAlguna = (...secciones) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    for (const s of secciones) {
      if (await accesoEfectivo(req.user, s)) return next();
    }
    return res.status(403).json({ error: 'Sin acceso a esta sección' });
  } catch (err) { next(err); }
};

// Bitácora de control de acceso. actor = req.user; nunca lanza (la operación
// principal no debe fallar por no poder registrarse).
export async function logPermiso(actor, accion, detalle) {
  try {
    await prisma.permisoLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorNombre: actor ? `${actor.nombre} ${actor.apellidoP || ''}`.trim() : 'Sistema',
        accion,
        detalle,
      },
    });
  } catch (err) {
    console.error('No se pudo registrar en la bitácora de permisos:', err.message);
  }
}
