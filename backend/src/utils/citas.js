// Qué cita cuenta como TRABAJO del asesor en las métricas (dashboard, proceso
// de ventas, ranking, Metas, "citas por cerrar" de Hoy). Única definición:
// no se cuentan los eventos personales (bloqueos de agenda) ni las reuniones
// de equipo de la promotoría (juntas de arranque, capacitaciones) — esas
// últimas no son una cita conseguida con un prospecto, y la promotora las crea
// a su nombre, así que inflarían las cifras de la promotoría.
export const CITA_DE_TRABAJO = {
  clasificacion: { not: 'PERSONAL' },
  modalidad: { not: 'REUNION_EQUIPO' },
};
