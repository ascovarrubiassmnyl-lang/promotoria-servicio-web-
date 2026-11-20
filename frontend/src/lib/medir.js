import { api } from '../api/client.js';

// Medición de uso de Inicio (2026-11-20): un evento por clic en cada
// bloque/acción → POST /api/eventos-inicio. Mejor esfuerzo y sin esperar: si
// falla (sin red, deploy en curso) el clic del usuario sigue igual y no se
// avisa nada. `detalle` solo lleva categorías (tipo y grupo de la fila, clave
// del KPI), NUNCA datos del cliente: el servidor rechaza cualquier otra cosa.
export function medir(bloque, accion, detalle) {
  api.post('/eventos-inicio', { bloque, accion, ...(detalle ? { detalle } : {}) }, { timeout: 5000 })
    .catch(() => {});
}
