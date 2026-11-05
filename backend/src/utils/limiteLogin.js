// Freno de fuerza bruta para el login, en memoria (un solo servicio en
// Railway, mismo criterio que el rate limit de routes/captura.js).
//
// Dos contadores de intentos FALLIDOS en una ventana de 15 min:
//  - por correo + IP: 5 fallos bloquean ese par (adivinar la contraseña de
//    una persona desde un equipo);
//  - por IP: 30 fallos bloquean la IP (probar muchas cuentas desde un equipo).
// Un login correcto limpia el contador de ese correo, así quien solo se
// equivocó un par de veces no arrastra los fallos.
export const VENTANA_MS = 15 * 60_000;
export const MAX_FALLOS_CUENTA = 5;
export const MAX_FALLOS_IP = 30;

const fallos = new Map(); // clave → [timestamps]

const vigentes = (clave, ahora) => (fallos.get(clave) || []).filter((t) => t > ahora - VENTANA_MS);
const claveCuenta = (email, ip) => `c:${email}|${ip}`;
const claveIp = (ip) => `i:${ip}`;

// Segundos que faltan para poder reintentar, o 0 si no está bloqueado.
export function bloqueoLogin(email, ip, ahora = Date.now()) {
  const espera = (lista, max) => (lista.length >= max ? Math.ceil((lista[lista.length - max] + VENTANA_MS - ahora) / 1000) : 0);
  return Math.max(
    espera(vigentes(claveCuenta(email, ip), ahora), MAX_FALLOS_CUENTA),
    espera(vigentes(claveIp(ip), ahora), MAX_FALLOS_IP),
  );
}

export function registrarFalloLogin(email, ip, ahora = Date.now()) {
  for (const clave of [claveCuenta(email, ip), claveIp(ip)]) {
    const lista = vigentes(clave, ahora);
    lista.push(ahora);
    fallos.set(clave, lista);
  }
}

export function limpiarFallosLogin(email, ip) {
  fallos.delete(claveCuenta(email, ip));
}

// Limpieza periódica para que el Map no crezca sin tope.
setInterval(() => {
  const ahora = Date.now();
  for (const [clave] of fallos) {
    if (!vigentes(clave, ahora).length) fallos.delete(clave);
  }
}, 5 * 60_000).unref();

export const _reiniciarLimiteLogin = () => fallos.clear(); // solo tests
