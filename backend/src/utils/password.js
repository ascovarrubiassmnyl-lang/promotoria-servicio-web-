// Regla única de contraseña nueva (invitación y cambio de contraseña). Las
// contraseñas ya guardadas no se tocan: esto solo aplica al crear una.
export const MIN_PASSWORD = 8;
// bcrypt ignora todo lo que pase de 72 bytes: más largo daría una falsa
// sensación de seguridad (y un cuerpo enorme solo gasta CPU).
const MAX_BYTES_PASSWORD = 72;

// Devuelve el mensaje de error, o null si la contraseña es aceptable.
export function errorPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES_PASSWORD) {
    return 'La contraseña es demasiado larga (máximo 72 caracteres)';
  }
  return null;
}
