// Fuente de verdad ÚNICA de presentación por tipo de notificación in-app:
// label, colores (clases Tailwind estáticas) e icono. Espejo del enum canónico
// del backend (backend/src/utils/notificaciones.js). Los colores coinciden con
// los que ya usa Actividad para el mismo concepto (cita=violet, recordatorio=
// orange, recordatorio de pago=cyan) — no inventar una paleta paralela.

const Icono = ({ d }) => (
  <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const ICONO_CITA = ['M3 5h18v16H3z', 'M3 9h18', 'M8 3v4', 'M16 3v4'];
const ICONO_CAMPANA = ['M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M10 21a2 2 0 004 0'];
const ICONO_PAGO = ['M3 6h18v12H3z', 'M3 10h18', 'M7 15h4'];

export const TIPOS_NOTIFICACION = {
  CITA_INVITACION: {
    label: 'Invitación de acompañamiento',
    dot: 'bg-violet-500',
    marker: 'bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
    icon: <Icono d={ICONO_CITA} />,
  },
  CITA_INVITACION_RESPUESTA: {
    label: 'Respuesta a invitación',
    dot: 'bg-violet-500',
    marker: 'bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
    icon: <Icono d={ICONO_CITA} />,
  },
  CITA_SUGERENCIA_RESPUESTA: {
    label: 'Respuesta a horario propuesto',
    dot: 'bg-violet-500',
    marker: 'bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30',
    icon: <Icono d={ICONO_CITA} />,
  },
  RECORDATORIO: {
    label: 'Recordatorio',
    dot: 'bg-orange-500',
    marker: 'bg-orange-50 text-orange-600 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/30',
    icon: <Icono d={ICONO_CAMPANA} />,
  },
  RECORDATORIO_PAGO: {
    label: 'Recordatorio de pago',
    dot: 'bg-cyan-500',
    marker: 'bg-cyan-50 text-cyan-600 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-500/30',
    icon: <Icono d={ICONO_PAGO} />,
  },
};

// Tipos desconocidos (notificaciones viejas o de una versión más nueva del
// backend) caen a un estilo neutro, sin romper la lista.
export function infoTipoNotificacion(tipo) {
  return TIPOS_NOTIFICACION[tipo] || {
    label: (tipo || 'Aviso').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    dot: 'bg-slate-400',
    marker: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-600',
    icon: <Icono d={ICONO_CAMPANA} />,
  };
}
