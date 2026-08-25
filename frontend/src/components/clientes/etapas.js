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
    // "Ya le hablé, todavía no me da cita": el paso que faltaba entre el
    // prospecto crudo y la cita agendada.
    value: 'CONTACTADO',
    dot: 'bg-indigo-500', border: 'border-indigo-500', halo: 'ring-indigo-500/25',
    pill: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    chipOn: 'ring-indigo-500 dark:ring-indigo-400',
    badgeOn: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    text: 'text-indigo-600 dark:text-indigo-400',
    badge: 'purple',
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
].map((e, orden) => ({ ...e, orden, fueraEmbudo: false, label: ESTADOS_CLIENTE_LABEL[e.value] || e.value }));

// Etapas FUERA del embudo: no son un paso de progreso, así que no tienen
// posición (`orden: -1`) y el stepper, los segmentos de la lista, el funnel
// del dashboard y `siguienteEtapa` las ignoran sin tocar su lógica.
//
//   DESCARTADO  terminal — no va a comprar (no contesta, no le interesa, no
//               califica). Rojo, el color de "cancelado/terminal" del sistema.
//   STANDBY     pausado a propósito ("búscame en 3 meses"). Ámbar, el color
//               de "en espera" del sistema. Sale de la clínica telefónica y
//               de la alerta de prospecto estancado: la pausa es deliberada.
//   RETARGETING se enfrió y hay que volver a trabajarlo. Morado. Sí vuelve a
//               la clínica telefónica — es justo material de re-contacto.
//
// Ninguna es lo mismo que archivar (borrado lógico, Cliente.archivadoEn): el
// cliente sigue en la lista y se reactiva cambiándole la etapa.
const fueraDelEmbudo = (e) => ({
  ...e,
  orden: -1,
  fueraEmbudo: true,
  label: ESTADOS_CLIENTE_LABEL[e.value] || e.value,
});

export const ETAPA_DESCARTADO = fueraDelEmbudo({
  value: 'DESCARTADO',
  terminal: true,
  dot: 'bg-red-500', border: 'border-red-500', halo: 'ring-red-500/25',
  pill: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  chipOn: 'ring-red-500 dark:ring-red-400',
  badgeOn: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  text: 'text-red-600 dark:text-red-400',
  badge: 'red',
});

export const ETAPA_STANDBY = fueraDelEmbudo({
  value: 'STANDBY',
  terminal: false,
  dot: 'bg-amber-500', border: 'border-amber-500', halo: 'ring-amber-500/25',
  pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  chipOn: 'ring-amber-500 dark:ring-amber-400',
  badgeOn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  text: 'text-amber-600 dark:text-amber-400',
  badge: 'amber',
});

export const ETAPA_RETARGETING = fueraDelEmbudo({
  value: 'RETARGETING',
  terminal: false,
  dot: 'bg-fuchsia-500', border: 'border-fuchsia-500', halo: 'ring-fuchsia-500/25',
  pill: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  chipOn: 'ring-fuchsia-500 dark:ring-fuchsia-400',
  badgeOn: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  text: 'text-fuchsia-600 dark:text-fuchsia-400',
  badge: 'purple',
});

// Las tres, en el orden en que se ofrecen después del embudo.
export const ETAPAS_FUERA_EMBUDO = [ETAPA_STANDBY, ETAPA_RETARGETING, ETAPA_DESCARTADO];

// Todo lo que el usuario puede ELEGIR (selectores, popover de la columna
// Etapa, chips de filtro). Distinto de ETAPAS, que es el embudo ordenado y
// solo debe usarse para pintar progreso.
export const ETAPAS_SELECCIONABLES = [...ETAPAS, ...ETAPAS_FUERA_EMBUDO];

// Fallback neutro para valores desconocidos o legacy (p. ej. el viejo
// NECESITA_SEGUIMIENTO almacenado antes de la migración a bandera).
export const infoEtapa = (value) =>
  ETAPAS_SELECCIONABLES.find((e) => e.value === value)
  || { ...ETAPAS[0], value, orden: -1, fueraEmbudo: false, terminal: false, label: ESTADOS_CLIENTE_LABEL[value] || value, badge: 'slate' };

export const ordenEtapa = (value) => infoEtapa(value).orden;

// Una etapa fuera del embudo (Standby, Retargeting, Descartado) no "avanza" a
// ninguna parte: sale null igual que la última etapa del embudo (orden -1).
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
