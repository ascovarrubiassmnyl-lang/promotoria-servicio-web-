import jwt from 'jsonwebtoken';

export function signToken(usuario) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol, email: usuario.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

export function validarRfc(rfc) {
  if (!rfc) return true;
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc.toUpperCase());
}
