import { useEffect } from 'react';
import { ETAPAS, ETAPAS_FUERA_EMBUDO, FLAG_SEGUIMIENTO } from './etapas.js';
import { FILTROS_RAPIDOS, ORDENES } from './lista.js';

// Filtros del CRM en celular (< md, 2026-11-20): en vez de apilar 6 filas de
// controles arriba de la lista (el primer contacto quedaba al 75% de la
// pantalla), todo vive en una hoja inferior con el mismo estilo que la hoja
// "Más" de Layout. Es SOLO presentación: cada control llama a los mismos
// handlers de ClientesView, que escriben en los mismos parámetros de la URL;
// la lógica de filtrado sigue en ClientesView + lista.js.

// Segmentos de la lista (compartido con la barra de escritorio).
export const SEGMENTOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'clientes', label: 'Clientes' },
];

const Titulo = ({ children }) => (
  <p className="px-1 pb-2 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">{children}</p>
);

// Fila seleccionable de la hoja: ≥44px de alto.
function Opcion({ on, onClick, children, conteo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium transition ${
        on
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60'
      }`}
    >
      {children}
      {conteo !== undefined && <span className="ml-auto tabular-nums text-xs text-slate-400 dark:text-slate-500">{conteo}</span>}
      {on && (
        <svg className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
      )}
    </button>
  );
}

export function HojaFiltros({
  open, onClose, total,
  segmento, conteoSegmento, onSegmento,
  etapaActiva, conteos, totalSegmento, onEtapa,
  rapido, conteoRapido, onRapido,
  fuentesPresentes, fuenteFiltro, onFuente,
  orden, onOrden,
  verArchivados, onArchivados,
  selectorAsesor = null,
  hayActivos, onLimpiar,
  onImportar, onExportar, exportando,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  if (!open) return null;

  const filaEtapa = (e) => (
    <Opcion key={e.value} on={etapaActiva === e.value} onClick={() => onEtapa(etapaActiva === e.value ? null : e.value)} conteo={conteos[e.value] || 0}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${e.dot}`} />
      {e.label}
    </Opcion>
  );

  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filtros">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-1 dark:border-slate-700">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filtros</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/60"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
          <section>
            <Titulo>Mostrar</Titulo>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900/60">
              {SEGMENTOS.map((s) => {
                const on = segmento === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => onSegmento(s.value)}
                    aria-pressed={on}
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${
                      on ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.label}
                    <span className="tabular-nums text-xs opacity-70">{conteoSegmento[s.value]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {selectorAsesor && (
            <section>
              <Titulo>Asesor</Titulo>
              {selectorAsesor}
            </section>
          )}

          <section>
            <Titulo>Atajos</Titulo>
            <div className="flex flex-wrap gap-2">
              {FILTROS_RAPIDOS.map((fr) => {
                const on = rapido === fr.value;
                const n = conteoRapido[fr.value] || 0;
                const urgente = fr.tono === 'red' && n > 0 && !on;
                return (
                  <button
                    key={fr.value}
                    type="button"
                    onClick={() => onRapido(on ? null : fr.value)}
                    aria-pressed={on}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition ${
                      on
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200'
                        : urgente
                          ? 'border-red-200 text-red-700 dark:border-red-800 dark:text-red-300'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {fr.label}
                    <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <Titulo>Etapa</Titulo>
            <Opcion on={!etapaActiva} onClick={() => onEtapa(null)} conteo={totalSegmento}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
              Todas las etapas
            </Opcion>
            <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">En el embudo</p>
            {ETAPAS.map(filaEtapa)}
            <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">Fuera del embudo</p>
            {ETAPAS_FUERA_EMBUDO.map(filaEtapa)}
            <div className="my-2 h-px bg-slate-100 dark:bg-slate-700" />
            <Opcion on={etapaActiva === '__flag'} onClick={() => onEtapa(etapaActiva === '__flag' ? null : '__flag')} conteo={conteos.__flag}>
              <svg className={`h-4 w-4 shrink-0 ${FLAG_SEGUIMIENTO.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              {FLAG_SEGUIMIENTO.label}
            </Opcion>
          </section>

          {fuentesPresentes.length > 1 && (
            <section>
              <Titulo>Fuente</Titulo>
              <select className="input min-h-[44px]" value={fuenteFiltro} onChange={(e) => onFuente(e.target.value)} aria-label="Filtrar por fuente">
                <option value="">Todas las fuentes</option>
                {fuentesPresentes.map(([l, n]) => <option key={l} value={l}>{l} ({n})</option>)}
              </select>
            </section>
          )}

          <section>
            <Titulo>Ordenar por</Titulo>
            <select className="input min-h-[44px]" value={orden.value} onChange={(e) => onOrden(e.target.value)} aria-label="Ordenar por">
              {ORDENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </section>

          <section>
            <label className="flex min-h-[44px] cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60">
              Ver archivados
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                checked={verArchivados}
                onChange={(e) => onArchivados(e.target.checked)}
              />
            </label>
          </section>

          <section className="border-t border-slate-100 pt-4 dark:border-slate-700">
            <Titulo>Cartera</Titulo>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onImportar} className="btn-secondary min-h-[44px] justify-center">Importar Excel</button>
              <button type="button" onClick={onExportar} disabled={exportando} className="btn-secondary min-h-[44px] justify-center">
                {exportando ? 'Exportando…' : 'Exportar Excel'}
              </button>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-3 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-slate-700">
          <button type="button" onClick={onLimpiar} disabled={!hayActivos} className="btn-secondary min-h-[44px] justify-center px-5 disabled:opacity-40">
            Limpiar
          </button>
          <button type="button" onClick={onClose} className="btn-primary min-h-[44px] flex-1 justify-center">
            Ver {total} contacto{total === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Filtros activos como chips quitables (solo si hay alguno).
export function ChipsActivos({ activos }) {
  if (!activos.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 md:hidden">
      {activos.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.quitar}
          aria-label={`Quitar filtro ${a.label}`}
          className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-brand-50 pl-3 pr-2 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
        >
          {a.label}
          <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      ))}
    </div>
  );
}
