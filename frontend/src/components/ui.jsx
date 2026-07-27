import { useEffect, useRef, useState } from 'react';
import { ESTADOS_VENTA_LABEL } from '../lib/format.js';
import { infoEtapa } from './clientes/etapas.js';
import { infoEstadoCita } from './citas/tipos.js';

export function Card({ children, className = '', title, subtitle, actions }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Stat({ title, value, subtitle, color = 'brand' }) {
  const colors = {
    brand: 'text-brand-600 dark:text-brand-500',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    slate: 'text-slate-700 dark:text-slate-300',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
  };
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${colors[color]}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, color = 'slate', className = '' }) {
  const map = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300',
  };
  return <span className={`badge ${map[color]} ${className}`}>{children}</span>;
}

const estadoVentaColor = {
  PENDIENTE_PAGAR: 'amber', FIRMADA: 'blue', PAGADA: 'green', CANCELADA: 'red', APROBADA: 'green', RECHAZADA: 'red',
};

// Color y label salen del mapa único de etapas (components/clientes/etapas.js)
export function ClienteBadge({ estado }) {
  const e = infoEtapa(estado);
  return <Badge color={e.badge}>{e.label}</Badge>;
}
// Color y label salen del mapa único de citas (components/citas/tipos.js)
export function CitaBadge({ estado }) {
  const e = infoEstadoCita(estado);
  return <Badge color={e.badge}>{e.label}</Badge>;
}
export function VentaBadge({ estado }) {
  return <Badge color={estadoVentaColor[estado] || 'slate'} className="badge-dot">{ESTADOS_VENTA_LABEL[estado] || estado}</Badge>;
}

export function EmptyState({ message = 'Sin datos' }) {
  return <div className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">{message}</div>;
}

// Menú desplegable de acciones (⋯). Las acciones destructivas viven aquí, con
// confirmación aparte — nunca como botón directo. items: [{label, onClick,
// danger?}, 'sep', ...]; los falsy se omiten.
export function MenuAcciones({ items, small = false, label = 'Más acciones' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const cerrar = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center justify-center rounded-lg transition ${small
          ? 'h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
          : 'h-9 w-9 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
      >
        <svg className={small ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[210px] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-1.5">
          {items.filter(Boolean).map((it, i) => it === 'sep' ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
          ) : (
            <button
              key={it.label}
              type="button"
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${it.danger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
            >{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70 p-4">
      <div className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="cerrar">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Drawer lateral derecho. Soporta `wide` para pánico más ancho en pantallas medianas+.
export function Drawer({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  const widthClass = wide ? 'sm:max-w-2xl' : 'sm:max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/70">
      <div className={`card w-full ${widthClass} max-w-full h-full overflow-auto rounded-l-xl rounded-r-none`}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-5 py-3 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="cerrar">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
