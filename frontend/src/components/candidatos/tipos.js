// Fuente de verdad ÚNICA del módulo de Candidatos (reclutamiento): etapas del
// pipeline SMNYL, semáforo de selección y catálogo de dimensiones de la
// evaluación (vitales/valores). No duplicar labels/colores en otros
// componentes. Clases estáticas para que Tailwind JIT las genere.

// Pipeline ordenado (espejo del enum EtapaCandidato del backend). El color
// encodea progreso, igual que las etapas de clientes. ENTREVISTA_ADICIONAL es
// opcional: al avanzar desde CARRERA se puede saltar (el backend lo valida).
export const ETAPAS_CANDIDATO = [
  {
    value: 'ENTREVISTA_INICIAL', label: 'Entrevista Inicial', corto: 'Inicial',
    dot: 'bg-slate-400', border: 'border-slate-400',
    pill: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    chipOn: 'ring-slate-400 dark:ring-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    badge: 'slate',
  },
  {
    value: 'SELECCION', label: 'Selección', corto: 'Selección',
    dot: 'bg-sky-500', border: 'border-sky-500',
    pill: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    chipOn: 'ring-sky-500 dark:ring-sky-400',
    text: 'text-sky-600 dark:text-sky-400',
    badge: 'blue',
  },
  {
    value: 'CARRERA', label: 'Carrera', corto: 'Carrera',
    dot: 'bg-blue-500', border: 'border-blue-500',
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    chipOn: 'ring-blue-500 dark:ring-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'blue',
  },
  {
    value: 'ENTREVISTA_ADICIONAL', label: 'Entrevista Adicional', corto: 'Adicional', opcional: true,
    dot: 'bg-violet-500', border: 'border-violet-500',
    pill: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    chipOn: 'ring-violet-500 dark:ring-violet-400',
    text: 'text-violet-600 dark:text-violet-400',
    badge: 'purple',
  },
  {
    value: 'PRECONTRATO_MC', label: 'Precontrato (MC)', corto: 'MC',
    dot: 'bg-teal-500', border: 'border-teal-500',
    pill: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    chipOn: 'ring-teal-500 dark:ring-teal-400',
    text: 'text-teal-600 dark:text-teal-400',
    badge: 'green',
  },
  {
    value: 'FIRMA_CONTRATO_FC', label: 'Firma de contrato (FC)', corto: 'FC',
    dot: 'bg-emerald-500', border: 'border-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    chipOn: 'ring-emerald-500 dark:ring-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'green',
  },
].map((e, orden) => ({ ...e, orden }));

export const infoEtapaCandidato = (value) =>
  ETAPAS_CANDIDATO.find((e) => e.value === value) ||
  { ...ETAPAS_CANDIDATO[0], value, orden: -1, label: value, badge: 'slate' };

// Siguientes etapas válidas desde la actual: la inmediata, más el salto de la
// Entrevista Adicional (misma regla que valida el backend).
export const siguientesEtapas = (value) => {
  const i = infoEtapaCandidato(value).orden;
  if (i < 0 || i >= ETAPAS_CANDIDATO.length - 1) return [];
  const out = [ETAPAS_CANDIDATO[i + 1]];
  if (ETAPAS_CANDIDATO[i + 1].value === 'ENTREVISTA_ADICIONAL' && ETAPAS_CANDIDATO[i + 2]) {
    out.push(ETAPAS_CANDIDATO[i + 2]);
  }
  return out;
};

// Semáforo de selección: lo calcula el servidor al completar la evaluación
// (utils/semaforoCandidato.js); aquí solo presentación.
export const SEMAFOROS = {
  SIN_EVALUAR: {
    value: 'SIN_EVALUAR', label: 'Sin evaluar',
    dot: 'bg-slate-300 dark:bg-slate-600',
    pill: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
    chipOn: 'ring-slate-400 dark:ring-slate-400',
  },
  VERDE: {
    value: 'VERDE', label: 'Verde',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    chipOn: 'ring-emerald-500 dark:ring-emerald-400',
  },
  AMARILLO: {
    value: 'AMARILLO', label: 'Amarillo',
    dot: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    chipOn: 'ring-amber-500 dark:ring-amber-400',
  },
  ROJO: {
    value: 'ROJO', label: 'Rojo',
    dot: 'bg-red-500',
    pill: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    chipOn: 'ring-red-500 dark:ring-red-400',
  },
};

export const infoSemaforo = (value) => SEMAFOROS[value] || SEMAFOROS.SIN_EVALUAR;

// Catálogo de dimensiones de la evaluación (espejo de los campos de
// EvaluacionCandidato en el backend). La escala es 1–5; 0 = sin contestar.
export const ESCALA = { 1: 'Pobre', 2: 'Promedio', 3: 'Bueno', 4: 'Muy bueno', 5: 'Excelente' };

export const VITALES = [
  { campo: 'caracterIntegridad', label: 'Carácter e integridad', desc: 'Honestidad, ética y congruencia entre lo que dice y lo que hace.' },
  { campo: 'agilidadMental', label: 'Agilidad mental', desc: 'Capacidad de aprender rápido y resolver situaciones nuevas.' },
  { campo: 'empuje', label: 'Empuje', desc: 'Iniciativa y determinación para conseguir resultados.' },
  { campo: 'nivelEnergia', label: 'Nivel de energía', desc: 'Vitalidad y ritmo de trabajo sostenido en el día a día.' },
  { campo: 'motivacionDinero', label: 'Motivación por el dinero', desc: 'Ambición económica como motor de la actividad comercial.' },
  { campo: 'posibilidadPermanencia', label: 'Posibilidad de permanencia', desc: 'Estabilidad y arraigo para quedarse en la carrera.' },
];

export const VALORES = [
  { campo: 'imagenProfesional', label: 'Imagen profesional', desc: 'Presentación y trato acordes a la asesoría financiera.' },
  { campo: 'enfoqueSocial', label: 'Enfoque social', desc: 'Facilidad para relacionarse y ampliar su círculo de contactos.' },
  { campo: 'autoGestionable', label: 'Autogestionable', desc: 'Disciplina para organizarse y trabajar sin supervisión.' },
  { campo: 'orientadoProcesos', label: 'Orientado a procesos', desc: 'Apego a métodos y sistemas de trabajo.' },
  { campo: 'claridadMetas', label: 'Claridad de metas', desc: 'Objetivos personales definidos y medibles.' },
  { campo: 'enfoqueActividad', label: 'Enfoque a la actividad', desc: 'Constancia en la prospección y la actividad diaria.' },
];

// Un grupo está completo cuando sus 6 dimensiones tienen calificación 1–5.
export const grupoCompleto = (ev, grupo) => grupo.every((d) => (ev?.[d.campo] ?? 0) >= 1);

// ─── POP propio de la promotoría ──────────────────────────────────────────
// Espejo de presentación de los enums RecomendacionPop / EstadoPopEnvio. El
// puntaje y la recomendación SIEMPRE los calcula el servidor (utils/pop.js):
// aquí solo se pintan. Mismo lenguaje de 3 niveles del reporte oficial de
// SMNYL (Proceder / Precaución / No proceder), reusando los colores del
// semáforo de candidatos para que un verde signifique lo mismo en toda la app.
export const RECOMENDACIONES_POP = {
  PROCEDER: {
    value: 'PROCEDER', label: 'Proceder',
    descripcion: 'El perfil cumple con lo que buscamos.',
    dot: 'bg-emerald-500', barra: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  PRECAUCION: {
    value: 'PRECAUCION', label: 'Precaución',
    descripcion: 'Perfil intermedio: conviene profundizar en la entrevista.',
    dot: 'bg-amber-500', barra: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  NO_PROCEDER: {
    value: 'NO_PROCEDER', label: 'No proceder',
    descripcion: 'El perfil queda por debajo del mínimo definido.',
    dot: 'bg-red-500', barra: 'bg-red-500',
    pill: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
};

export const infoRecomendacion = (value) =>
  RECOMENDACIONES_POP[value] || {
    value: value || null, label: 'Sin resultado', descripcion: '',
    dot: 'bg-slate-300 dark:bg-slate-600', barra: 'bg-slate-300 dark:bg-slate-600',
    pill: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  };

export const ESTADOS_POP = {
  PENDIENTE: {
    value: 'PENDIENTE', label: 'Pendiente',
    pill: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  RESPONDIDO: {
    value: 'RESPONDIDO', label: 'Contestado',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  CANCELADO: {
    value: 'CANCELADO', label: 'Cancelado',
    pill: 'bg-slate-100 text-slate-400 line-through dark:bg-slate-700 dark:text-slate-500',
  },
};

export const infoEstadoPop = (value) => ESTADOS_POP[value] || ESTADOS_POP.PENDIENTE;

// Tipos de pregunta que ofrece el editor de cuestionarios.
export const TIPOS_PREGUNTA_POP = [
  { value: 'OPCION', label: 'Opción múltiple', ayuda: 'El candidato elige una respuesta. Cada opción vale los puntos que definas.' },
  { value: 'TEXTO', label: 'Respuesta abierta', ayuda: 'Texto libre para leerlo tú. No suma puntos al resultado.' },
];

// Bloques sugeridos, espejo de los del reporte oficial. Son texto libre: sirven
// para agrupar las barras del resultado, la promotora puede escribir otros.
export const BLOQUES_SUGERIDOS = ['ADN en Ventas', 'Experiencia', 'Compatibilidad con la Carrera', 'General'];

// Modalidad de cita de reclutamiento sugerida según la etapa del candidato
// (preselección del formulario de cita; siempre editable).
export const MODALIDAD_POR_ETAPA = {
  ENTREVISTA_INICIAL: 'ENTREVISTA_INICIAL',
  SELECCION: 'ENTREVISTA_SELECCION',
  CARRERA: 'ENTREVISTA_CARRERA',
  ENTREVISTA_ADICIONAL: 'ENTREVISTA_CARRERA',
  PRECONTRATO_MC: 'PRP',
  FIRMA_CONTRATO_FC: 'PRP',
};
