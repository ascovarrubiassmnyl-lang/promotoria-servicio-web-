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
  ADMIN: 'Admin / Promotor',
  SUPERADMIN: 'Súper Admin',
};
