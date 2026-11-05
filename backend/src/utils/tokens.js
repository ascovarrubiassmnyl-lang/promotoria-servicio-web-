import jwt from 'jsonwebtoken';

// Algoritmo fijo al firmar Y al verificar (middleware/auth.js): así nadie
// puede colar un token con otro algoritmo ("none", RS256 con la llave
// equivocada) aunque cambie la librería.
export const JWT_ALGORITMO = 'HS256';

// Con un secreto corto o el de ejemplo, cualquiera podría fabricar un token de
// Súper Admin. No se tumba el servidor (un deploy caído es peor), pero el log
// lo grita en cada arranque hasta que se cambie en Railway.
const SECRETOS_DE_EJEMPLO = ['cambia-este-secreto-en-produccion', 'secret', 'changeme'];
if (process.env.NODE_ENV === 'production') {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 32 || SECRETOS_DE_EJEMPLO.includes(s)) {
    console.error('[SEGURIDAD] JWT_SECRET es débil o es el de ejemplo: genera uno con `openssl rand -base64 48` y ponlo en Railway.');
  }
}

// Valor para `Usuario.sesionesDesde`, redondeado al segundo: `iat` del JWT va
// en segundos, así el token nuevo que se emite en ese mismo instante sigue
// valiendo y todos los anteriores (de segundos previos) quedan fuera.
export const marcaCierreSesiones = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export function signToken(usuario) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol, email: usuario.email }, process.env.JWT_SECRET, {
    algorithm: JWT_ALGORITMO,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

export function validarRfc(rfc) {
  if (!rfc) return true;
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc.toUpperCase());
}
