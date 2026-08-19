// Catálogo único de secciones controlables por permiso. Debe coincidir con
// SECCIONES del backend (middleware/permisos.js). No duplicar labels en otros
// componentes: la matriz de roles, las excepciones y la bitácora se generan
// de aquí. `ventas` se rotula "Pólizas": es el nombre del módulo en el resto
// del sistema.
export const SECCIONES = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Panel principal con métricas' },
  { id: 'clientes', label: 'Clientes', desc: 'Listado y expediente de clientes' },
  { id: 'citas', label: 'Citas', desc: 'Agenda y acompañamientos' },
  { id: 'ventas', label: 'Pólizas', desc: 'Pólizas vendidas y comisiones' },
  { id: 'actividad', label: 'Actividad', desc: 'Bitácora de acciones' },
  { id: 'metas', label: 'Metas', desc: 'Objetivos mensuales' },
  { id: 'puntos', label: '25 puntos', desc: 'Formato semanal de actividad comercial' },
  { id: 'clinica', label: 'Clínica telefónica', desc: 'Evaluador de prospectos y sesiones' },
  // Secciones de administración: además del permiso exigen rol Admin/Súper
  // Admin en el servidor (no se conceden por excepción a un asesor).
  { id: 'candidatos', label: 'Candidatos', desc: 'Reclutamiento de asesores', soloAdmin: true },
  { id: 'asesores', label: 'Asesores', desc: 'Gestión del equipo', soloAdmin: true },
  { id: 'configuracion', label: 'Configuración', desc: 'Accesos y notificaciones', soloAdmin: true },
];

export const infoSeccion = (id) => SECCIONES.find((s) => s.id === id) || { id, label: id, desc: '' };

// Cambios que piden confirmación explícita antes de guardarse.
export const SECCIONES_SENSIBLES = ['asesores', 'configuracion'];

export const ROLES_LABEL = {
  ASESOR: 'Asesor',
  ASISTENTE: 'Asistente / Secretaría',
  ADMIN: 'Admin / Promotor',
  SUPERADMIN: 'Súper Admin',
};

// Filas de la matriz de Configuración → "Roles y accesos", de menor a mayor
// alcance. Súper Admin va al final: es la fila bloqueada con acceso total.
export const ROLES_MATRIZ = ['ASESOR', 'ASISTENTE', 'ADMIN', 'SUPERADMIN'];

// Roles con alcance de administración ("promotor" en el lenguaje del negocio);
// espejo de ROLES_ADMIN en backend/src/middleware/auth.js. ASISTENTE tiene el
// mismo acceso que ADMIN, pero NO es promotora: no se ofrece para
// acompañamientos, disponibilidad ni como reclutador (esa lista sale de
// GET /usuarios/promotores, que filtra solo ADMIN).
export const ROLES_ADMIN = ['SUPERADMIN', 'ADMIN', 'ASISTENTE'];

// Qué implica cada rol, en el lenguaje del negocio. Se muestra bajo el selector
// de rol del alta/edición para que quede claro antes de guardar.
export const ROLES_DESC = {
  ASESOR: 'Ve y trabaja únicamente su propia cartera.',
  ASISTENTE: 'Mismo acceso que el promotor (papelería, emisión de pólizas, alta de asesores), pero no se ofrece como promotor para acompañamientos ni entra al ranking de asesores.',
  ADMIN: 'Promotor: control total del equipo, y se ofrece para acompañamientos y disponibilidad.',
  SUPERADMIN: 'Cuenta de quien desarrolla el servicio. No se asigna desde la app.',
};

// Roles asignables desde el alta/edición de usuarios (Asesores → Equipo).
// Súper Admin queda fuera: es el rol reservado para quien desarrolla el
// servicio, sembrado por variables de entorno y nunca asignado desde la app.
export const ROLES_ASIGNABLES = ['ADMIN', 'ASISTENTE', 'ASESOR'];
