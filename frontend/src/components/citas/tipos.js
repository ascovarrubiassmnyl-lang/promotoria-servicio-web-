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

// Tipo de cita (Cita.modalidad): quién participa / propósito.
export const TIPOS_CITA = {
  CITA_UNICA: { value: 'CITA_UNICA', label: 'Cita de asesor' },
  ACOMPANAMIENTO: { value: 'ACOMPANAMIENTO', label: 'Acompañamiento con promotor' },
  ENTREGA_POLIZA: { value: 'ENTREGA_POLIZA', label: 'Entrega de póliza' },
  // Agenda propia de reclutamiento del promotor: sin asesor ni cliente.
  PRP: { value: 'PRP', label: 'PRP' },
  ENTREVISTA_INICIAL: { value: 'ENTREVISTA_INICIAL', label: 'Entrevista inicial' },
  ENTREVISTA_SELECCION: { value: 'ENTREVISTA_SELECCION', label: 'Entrevista de selección' },
  ENTREVISTA_CARRERA: { value: 'ENTREVISTA_CARRERA', label: 'Entrevista de carrera' },
};

// Solo el promotor las ve/usa (reclutamiento propio, sin asesor ni cliente).
export const MODALIDADES_PROMOTOR = ['PRP', 'ENTREVISTA_INICIAL', 'ENTREVISTA_SELECCION', 'ENTREVISTA_CARRERA'];

export const infoTipoCita = (modalidad) =>
  TIPOS_CITA[modalidad] || { value: modalidad, label: modalidad || '—' };

// Clasificación (Cita.clasificacion): qué aporta al negocio. ES EL COLOR del
// evento en el calendario (metodología de la promotoría: rojo = personal,
// amarillo = no genera dinero directo, verde = genera dinero); el canal queda
// como etiqueta secundaria.
export const CLASIFICACIONES = {
  PRODUCTIVA: {
    value: 'PRODUCTIVA',
    label: 'Genera dinero',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    borde: 'border-emerald-500',
  },
  GESTION: {
    value: 'GESTION',
    label: 'Gestión / seguimiento',
    dot: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    borde: 'border-amber-400',
  },
  PERSONAL: {
    value: 'PERSONAL',
    label: 'Personal',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    chip: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    borde: 'border-red-500',
  },
};

export const infoClasificacion = (v) =>
  CLASIFICACIONES[v] || CLASIFICACIONES.PRODUCTIVA;

// Colores de un evento del calendario: manda la clasificación. Único punto de
// decisión — no elegir colores de cita en los componentes.
export const colorCita = (c) => infoClasificacion(c?.clasificacion);

// Sin cliente: evento personal (bloqueo de agenda) o agenda propia del
// promotor (MODALIDADES_PROMOTOR) — los únicos que pueden vivir sin uno.
export const esEventoPersonal = (c) => !c?.clienteId;

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

// Recurrencia al agendar (2026-08): el backend materializa TODAS las
// instancias como citas normales que comparten `serieId` — cada una se
// edita/cancela/reagenda de forma independiente, sin lógica de cascada.
// Mapa único de labels: no duplicar en el modal ni en el detalle.
export const RECURRENCIAS = {
  NO_REPITE: { value: 'NO_REPITE', label: 'No se repite' },
  DIARIO: { value: 'DIARIO', label: 'Todos los días' },
  DIAS_HABILES: { value: 'DIAS_HABILES', label: 'Días hábiles (lunes a viernes)' },
  SEMANAL: { value: 'SEMANAL', label: 'Cada semana' },
  ANUAL: { value: 'ANUAL', label: 'Cada año' },
  PERSONALIZADO: { value: 'PERSONALIZADO', label: 'Personalizado' },
};

export const infoRecurrencia = (v) => RECURRENCIAS[v] || RECURRENCIAS.NO_REPITE;

export const DIAS_SEMANA_LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Invitación al promotor en citas de acompañamiento (2026-08). Mientras esté
// PENDIENTE o SUGERIDA la cita no ocupa la agenda del promotor: se le muestra
// punteada ("por confirmar") hasta que quede ACEPTADA. Mapa único de labels/estilos.
export const INVITACIONES = {
  PENDIENTE: { value: 'PENDIENTE', label: 'Invitación por confirmar', badge: 'amber', icono: '⏳' },
  ACEPTADA: { value: 'ACEPTADA', label: 'Acompañamiento confirmado', badge: 'green', icono: '✓' },
  RECHAZADA: { value: 'RECHAZADA', label: 'Invitación rechazada', badge: 'red', icono: '✕' },
  SUGERIDA: { value: 'SUGERIDA', label: 'Otro horario propuesto', badge: 'amber', icono: '↻' },
};

export const infoInvitacion = (v) => INVITACIONES[v] || null;

// Bloque de disponibilidad ajena: la agenda ocupada de un promotor vista por un
// asesor (para saber cuándo invitarlo a un acompañamiento). Nunca usa los
// colores de CLASIFICACIONES —- no es una cita propia y no debe insinuar de qué
// se trata, solo que ese rango está tomado. Mapa único: no duplicar las clases
// en CalendarioView.jsx ni CalendarioMovil.jsx.
export const DISPONIBILIDAD_ESTILO = {
  bloque: 'bg-slate-400/30 dark:bg-slate-500/30 border border-dashed border-slate-400 dark:border-slate-500',
  texto: 'text-slate-600 dark:text-slate-300',
  label: 'Ocupado',
};
