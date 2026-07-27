// Mapa ÚNICO de presentación de citas — no duplicar labels/colores en otros
// componentes. Nombres en BD vs. UI (los campos NO se renombraron en Prisma):
//   Cita.tipo      (TipoCita)      = el CANAL de la cita (medio de contacto).
//   Cita.modalidad (ModalidadCita) = el TIPO de cita (quién participa).

// Canal: telefónica=blue, presencial=teal, videollamada=violet.
export const CANALES = {
  TELEFONICA: {
    value: 'TELEFONICA',
    label: 'Telefónica',
    ubicacionLabel: 'Teléfono (opcional)',
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    borde: 'border-blue-500',
  },
  PRESENCIAL: {
    value: 'PRESENCIAL',
    label: 'Presencial',
    ubicacionLabel: 'Dirección de la cita',
    dot: 'bg-teal-500',
    text: 'text-teal-600 dark:text-teal-400',
    chip: 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    borde: 'border-teal-500',
  },
  VIDEO: {
    value: 'VIDEO',
    label: 'Videollamada',
    ubicacionLabel: 'Link de videollamada',
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    chip: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    borde: 'border-violet-500',
  },
};

export const infoCanal = (tipo) =>
  CANALES[tipo] || {
    value: tipo, label: tipo || '—', ubicacionLabel: 'Ubicación',
    dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-300',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    borde: 'border-slate-400',
  };

// Tipo de cita (Cita.modalidad): quién participa.
export const TIPOS_CITA = {
  CITA_UNICA: { value: 'CITA_UNICA', label: 'Cita de asesor' },
  ACOMPANAMIENTO: { value: 'ACOMPANAMIENTO', label: 'Acompañamiento con promotor' },
};

// Ciclo de vida. Una cita nace PROGRAMADA (el alta nunca pide estado) y cambia
// con acciones: completar, cancelar (soft delete: conserva el registro), no asistió.
export const ESTADOS_CITA = {
  PROGRAMADA: { value: 'PROGRAMADA', label: 'Programada', badge: 'blue' },
  CONFIRMADA: { value: 'CONFIRMADA', label: 'Confirmada', badge: 'purple' },
  COMPLETADA: { value: 'COMPLETADA', label: 'Completada', badge: 'green' },
  CANCELADA: { value: 'CANCELADA', label: 'Cancelada', badge: 'slate' },
  NO_ASISTIO: { value: 'NO_ASISTIO', label: 'No asistió', badge: 'red' },
};

export const infoEstadoCita = (estado) =>
  ESTADOS_CITA[estado] || { value: estado, label: estado || '—', badge: 'slate' };

// Estados "vivos" para conteos/empalmes (los mismos que usa el backend).
export const CITA_VIVA = ['PROGRAMADA', 'CONFIRMADA'];
