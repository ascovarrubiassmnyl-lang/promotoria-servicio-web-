import { prisma } from '../prisma.js';

// Conjunto canónico de tipos de evento de actividad. Única fuente de verdad
// del backend; el frontend tiene el espejo de presentación (label/color/icono)
// en frontend/src/components/actividad/tipos.jsx. No inventar tipos nuevos
// fuera de esta lista ni volver a guardar strings pre-renderizados.
export const TIPOS_ACTIVIDAD = [
  'POLIZA_CREADA',
  'CITA_CREADA',
  'CLIENTE_CREADO',
  'LLAMADA',
  'PAGO_CONFIRMADO',
  'PAGO_RECORDADO',
  'NOTA_CREADA',
  'RECORDATORIO_CREADO',
  'REFERIDO_CREADO',
];

// Registra un evento estructurado: tipo canónico + payload con los datos
// relevantes (clienteId, cliente, producto, ramo, prima, nota…). El texto
// visible se construye en el frontend a partir de estos campos.
export function registrarActividad(asesorId, tipo, payload = {}) {
  if (!TIPOS_ACTIVIDAD.includes(tipo)) {
    return Promise.reject(new Error(`Tipo de actividad no canónico: ${tipo}`));
  }
  return prisma.actividad.create({ data: { asesorId, tipo, metadata: payload } });
}
