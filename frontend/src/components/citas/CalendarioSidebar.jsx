import { useMemo, useState } from 'react';
import { nombreMes } from '../../lib/format.js';

// Piezas del riel izquierdo del calendario de escritorio. El diseño viene del
// template `shadcn-dashboard-landing-template` (sección Calendar): riel de 320px
// con botón de alta, mini calendario del mes con punto en los días que tienen
// eventos y una lista de "calendarios" con casillas de color para mostrar/ocultar.
// Se adoptó el DISEÑO, no el stack: allá es TypeScript + shadcn/ui + Radix
// (Collapsible, Checkbox, `cn()`); aquí es JS + Tailwind con los tokens del
// proyecto, sin dependencias nuevas — misma decisión que las gráficas del
// dashboard y el filtro de etapas de Clientes.

const DIAS_MINI = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Mini calendario del mes: navega el periodo visible y marca con un punto los
// días con citas (`conteos` viene ya calculado por la vista, no se recuenta).
export function MiniMes({ mes, onMes, selected, onSelect, conteos = {} }) {
  const hoy = new Date();
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const out = Array(primero.getDay()).fill(null);
    for (let d = 1; d <= dias; d++) out.push(new Date(mes.getFullYear(), mes.getMonth(), d));
    return out;
  }, [mes]);

  const paso = (dir) => onMes(new Date(mes.getFullYear(), mes.getMonth() + dir, 1));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button" onClick={() => paso(-1)} aria-label="Mes anterior"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {nombreMes(mes.getMonth() + 1)} {mes.getFullYear()}
        </span>
        <button
          type="button" onClick={() => paso(1)} aria-label="Mes siguiente"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">
        {DIAS_MINI.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {celdas.map((d, i) => {
          if (!d) return <span key={i} />;
          const esHoy = d.toDateString() === hoy.toDateString();
          const sel = selected && d.toDateString() === selected.toDateString();
          const tiene = (conteos[dayKey(d)] || 0) > 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(d)}
              className={`relative h-8 w-full rounded-lg text-xs font-medium transition ${
                sel ? 'bg-brand-600 text-white'
                  : esHoy ? 'text-brand-600 dark:text-brand-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {d.getDate()}
              {tiene && (
                <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${sel ? 'bg-white' : 'bg-brand-500'}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Grupo de "calendarios" (clasificación, canal, estado): casilla de color por
// valor, que muestra u oculta ese tipo de cita en la rejilla. Sustituye a los
// <select> de filtro: la casilla lleva el mismo color del evento, así el riel
// hace también de leyenda.
export function GrupoVisibilidad({ titulo, items, visibles, onToggle, onSolo, defaultOpen = true }) {
  const [abierto, setAbierto] = useState(defaultOpen);
  const ocultos = items.filter((i) => !visibles.has(i.value)).length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700/60"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{titulo}</span>
        <span className="flex items-center gap-1">
          {ocultos > 0 && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">{ocultos} oculto{ocultos > 1 ? 's' : ''}</span>}
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${abierto ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      {abierto && (
        <div className="mt-1 space-y-0.5">
          {items.map((it) => {
            const visible = visibles.has(it.value);
            return (
              <div key={it.value} className="group/fila flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-100/70 dark:hover:bg-slate-700/50">
                <button
                  type="button"
                  onClick={() => onToggle(it.value)}
                  aria-pressed={visible}
                  aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${it.label}`}
                  className={`flex aspect-square h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition ${
                    visible ? `border-transparent text-white ${it.dot}` : 'border-slate-300 dark:border-slate-600 bg-transparent'
                  }`}
                >
                  {visible && (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(it.value)}
                  className={`flex-1 truncate text-left text-sm ${visible ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}
                >{it.label}</button>
                {typeof it.count === 'number' && (
                  <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500 group-hover/fila:hidden">{it.count}</span>
                )}
                <button
                  type="button"
                  onClick={() => onSolo(it.value)}
                  className="hidden text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400 group-hover/fila:block"
                  title={`Ver solo ${it.label}`}
                >solo</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
