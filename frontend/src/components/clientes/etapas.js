import { ESTADOS_CLIENTE_LABEL } from '../../lib/format.js';

// ÚNICA fuente de verdad de las etapas del pipeline de clientes: enum ordenado
// con color que encodea progreso (slate → azules → teal → emerald). "Necesita
// seguimiento" NO está aquí: es una bandera independiente (Cliente.
// necesitaSeguimiento), ver FLAG_SEGUIMIENTO abajo.
// Clases estáticas para que Tailwind JIT las genere.
export const ETAPAS = [
  {
    value: 'PROSPECTO',
    dot: 'bg-slate-400', border: 'border-slate-400', halo: 'ring-slate-400/25',
    pill: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    chipOn: 'ring-slate-400 dark:ring-slate-400',
    badgeOn: 'bg-slate-100 text-slate-700 dark:bg-slate-600 dark:text-slate-200',
    text: 'text-slate-500 dark:text-slate-400',
    badge: 'slate',
  },
  {
    value: 'CITA',
    dot: 'bg-sky-500', border: 'border-sky-500', halo: 'ring-sky-500/25',
    pill: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    chipOn: 'ring-sky-500 dark:ring-sky-400',
    badgeOn: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    text: 'text-sky-600 dark:text-sky-400',
    badge: 'blue',
  },
  {
    value: 'PROPUESTA',
    dot: 'bg-blue-500', border: 'border-blue-500', halo: 'ring-blue-500/25',
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    chipOn: 'ring-blue-500 dark:ring-blue-400',
    badgeOn: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'blue',
  },
  {
    value: 'CIERRE_FIRMA',
    dot: 'bg-violet-500', border: 'border-violet-500', halo: 'ring-violet-500/25',
    pill: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    chipOn: 'ring-violet-500 dark:ring-violet-400',
    badgeOn: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    text: 'text-violet-600 dark:text-violet-400',
    badge: 'purple',
  },
  {
    value: 'ENTREGA_POLIZA',
    dot: 'bg-teal-500', border: 'border-teal-500', halo: 'ring-teal-500/25',
    pill: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    chipOn: 'ring-teal-500 dark:ring-teal-400',
    badgeOn: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    text: 'text-teal-600 dark:text-teal-400',
    badge: 'green',
  },
  {
    value: 'REFERIDOS',
    dot: 'bg-cyan-500', border: 'border-cyan-500', halo: 'ring-cyan-500/25',
    pill: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    chipOn: 'ring-cyan-500 dark:ring-cyan-400',
    badgeOn: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    text: 'text-cyan-600 dark:text-cyan-400',
    badge: 'blue',
  },
  {
    value: 'POST_VENTA_SEGUIMIENTO',
    dot: 'bg-emerald-500', border: 'border-emerald-500', halo: 'ring-emerald-500/25',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    chipOn: 'ring-emerald-500 dark:ring-emerald-400',
    badgeOn: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'green',
  },
].map((e, orden) => ({ ...e, orden, label: ESTADOS_CLIENTE_LABEL[e.value] || e.value }));

// Fallback neutro para valores desconocidos o legacy (p. ej. el viejo
// NECESITA_SEGUIMIENTO almacenado antes de la migración a bandera).
export const infoEtapa = (value) =>
  ETAPAS.find((e) => e.value === value) || { ...ETAPAS[0], value, orden: -1, label: ESTADOS_CLIENTE_LABEL[value] || value, badge: 'slate' };

export const ordenEtapa = (value) => infoEtapa(value).orden;

export const siguienteEtapa = (value) => {
  const i = ordenEtapa(value);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
};

// Bandera "necesita seguimiento" (independiente de la etapa) — siempre ámbar.
export const FLAG_SEGUIMIENTO = {
  label: 'Necesita seguimiento',
  dot: 'bg-amber-500',
  text: 'text-amber-600 dark:text-amber-400',
  chipOn: 'ring-amber-500 dark:ring-amber-400',
  badgeOn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};
