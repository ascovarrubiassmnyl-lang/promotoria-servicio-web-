// Fuente de verdad ÚNICA de presentación por tipo de evento de actividad:
// label, colores (clases Tailwind estáticas) e icono. Espejo del enum canónico
// del backend (backend/src/utils/actividad.js). No definir labels ni colores de
// actividad en ningún otro componente.

const Icono = ({ d }) => (
  <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);

export const TIPOS_EVENTO = {
  POLIZA_CREADA: {
    label: 'Póliza creada',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    marker: 'bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
    chipOn: 'ring-emerald-500 dark:ring-emerald-400',
    badgeOn: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    icon: <Icono d={['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9']} />,
    titulo: (m) => (m.producto ? `Póliza creada: ${m.producto}` : 'Póliza creada'),
  },
  CITA_CREADA: {
    label: 'Cita agendada',
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    marker: 'bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
    chipOn: 'ring-violet-500 dark:ring-violet-400',
    badgeOn: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    icon: <Icono d={['M3 5h18v16H3z', 'M3 9h18', 'M8 3v4', 'M16 3v4']} />,
    titulo: (m) => (m.cliente ? `Cita agendada con ${m.cliente}` : 'Cita agendada'),
  },
  CLIENTE_CREADO: {
    label: 'Cliente nuevo',
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    marker: 'bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30',
    chipOn: 'ring-blue-500 dark:ring-blue-400',
    badgeOn: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    icon: <Icono d={['M9 8a3 3 0 106 0 3 3 0 00-6 0', 'M4 20c0-3 2-5 5-5', 'M17 11v6', 'M14 14h6']} />,
    titulo: () => 'Nuevo cliente registrado',
  },
  LLAMADA: {
    label: 'Llamada',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    marker: 'bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
    chipOn: 'ring-amber-500 dark:ring-amber-400',
    badgeOn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    icon: <Icono d={['M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z']} />,
    titulo: (m) => (m.cliente ? `Llamada con ${m.cliente}` : 'Llamada'),
  },
  PAGO_CONFIRMADO: {
    label: 'Pago registrado',
    dot: 'bg-teal-500',
    text: 'text-teal-600 dark:text-teal-400',
    marker: 'bg-teal-50 text-teal-600 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:ring-teal-500/30',
    chipOn: 'ring-teal-500 dark:ring-teal-400',
    badgeOn: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    icon: <Icono d={['M3 6h18v12H3z', 'M3 10h18', 'M7 15h4']} />,
    titulo: (m) => (m.producto ? `Pago registrado: ${m.producto}` : 'Pago registrado'),
  },
  PAGO_RECORDADO: {
    label: 'Recordatorio de pago',
    dot: 'bg-cyan-500',
    text: 'text-cyan-600 dark:text-cyan-400',
    marker: 'bg-cyan-50 text-cyan-600 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-500/30',
    chipOn: 'ring-cyan-500 dark:ring-cyan-400',
    badgeOn: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    icon: <Icono d={['M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M10 21a2 2 0 004 0']} />,
    titulo: (m) => (m.producto ? `Recordatorio de pago enviado: ${m.producto}` : 'Recordatorio de pago enviado'),
  },
  NOTA_CREADA: {
    label: 'Nota',
    dot: 'bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    marker: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-600',
    chipOn: 'ring-slate-500 dark:ring-slate-400',
    badgeOn: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    icon: <Icono d={['M5 3h11l3 3v15H5z', 'M9 8h6', 'M9 12h6', 'M9 16h4']} />,
    titulo: (m) => (m.cliente ? `Nota agregada en ${m.cliente}` : 'Nota agregada'),
  },
  RECORDATORIO_CREADO: {
    label: 'Recordatorio',
    dot: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    marker: 'bg-orange-50 text-orange-600 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/30',
    chipOn: 'ring-orange-500 dark:ring-orange-400',
    badgeOn: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    icon: <Icono d={['M12 8v5l3 2', 'M12 21a9 9 0 100-18 9 9 0 000 18z']} />,
    titulo: (m) => (m.nota ? `Recordatorio: ${m.nota}` : 'Recordatorio creado'),
  },
  REFERIDO_CREADO: {
    label: 'Referido nuevo',
    dot: 'bg-indigo-500',
    text: 'text-indigo-600 dark:text-indigo-400',
    marker: 'bg-indigo-50 text-indigo-600 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/30',
    chipOn: 'ring-indigo-500 dark:ring-indigo-400',
    badgeOn: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    icon: <Icono d={['M8 8a3 3 0 106 0 3 3 0 00-6 0', 'M3 20c0-3 2-5 5-5h2', 'M16 16l3 3 5-5']} />,
    titulo: (m) => (m.clienteOrigen ? `Nuevo referido desde ${m.clienteOrigen}` : 'Nuevo referido'),
  },
};

// Orden estable de los chips de filtro.
export const ORDEN_TIPOS = Object.keys(TIPOS_EVENTO);

// Estilo neutro para tipos históricos/desconocidos que no están en el mapa:
// se muestran igual (fallando suave), sin romper el timeline.
export function infoTipo(tipo) {
  return TIPOS_EVENTO[tipo] || {
    label: (tipo || 'Evento').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    dot: 'bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    marker: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-600',
    chipOn: 'ring-slate-500 dark:ring-slate-400',
    badgeOn: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    icon: <Icono d={['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 8v5', 'M12 16h.01']} />,
    titulo: () => null,
  };
}

// Campos del payload que hacen a un evento "estructurado". Los eventos
// históricos (solo descripcion pre-renderizada, o metadata con solo clienteId/
// tipoOriginal) se muestran con su texto crudo como fallback.
const CAMPOS_VISIBLES = ['cliente', 'producto', 'ramo', 'prima', 'nota', 'titulo', 'clienteOrigen', 'referido', 'proximoCobro'];
export const esEventoEstructurado = (e) =>
  !!e.metadata && CAMPOS_VISIBLES.some((k) => e.metadata[k] != null);
