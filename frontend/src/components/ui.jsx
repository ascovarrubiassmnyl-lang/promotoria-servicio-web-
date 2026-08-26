import { useEffect, useRef, useState } from 'react';
import { ESTADOS_VENTA_LABEL, nombreMes } from '../lib/format.js';
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

// Contenedor de PANTALLA COMPLETA para capturas largas (hoy: la ficha técnica
// de una póliza). No es un Modal más ancho: ocupa el viewport entero, con
// encabezado y pie fijos y el contenido scrolleando entre ambos, para que el
// botón de guardar no se pierda al final de un formulario de cinco secciones.
//
// Se usa cuando el formulario ES la tarea (una ficha que se llena de arriba a
// abajo); un Modal sigue siendo lo correcto para preguntas cortas y
// confirmaciones — no convertir todos los formularios a esto.
export function PantallaCompleta({ open, onClose, title, subtitle, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-900">
      <header className="shrink-0 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none px-2"
          aria-label="cerrar"
        >✕</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6">{children}</div>
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 sm:px-6 py-3">
          <div className="mx-auto w-full max-w-5xl">{footer}</div>
        </footer>
      )}
    </div>
  );
}

// Bloque numerado de la ficha técnica: título de sección + contenido. Los
// campos los acomoda quien lo usa (no todos los bloques quieren la misma
// rejilla).
export function SeccionFicha({ numero, title, subtitle, children }) {
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 text-sm font-semibold flex items-center justify-center tabular-nums">
          {numero}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// Valor fijo, de solo lectura, con la misma caja que un .input — para datos
// que define la compañía o el sistema (aseguradora, clave de agente) y que el
// asesor no captura pero sí necesita ver en la ficha.
export function ValorFijo({ children, title, vacio = '—' }) {
  const hay = children !== null && children !== undefined && children !== '';
  return (
    <div
      className={`input flex items-center bg-slate-50 dark:bg-slate-700/40 ${hay ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}
      title={title}
    >{hay ? children : vacio}</div>
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

// Input numérico con separador de miles en vivo (350,000 mientras se
// escribe), para montos grandes donde un <input type="number"> nativo no
// puede mostrar comas. `value`/`onChange` llevan el número limpio (string u
// number, sin comas) — mismo contrato que un input controlado normal, para
// sustituirlo directo. Acepta decimales con punto.
export function NumeroFormateado({ value, onChange, className = '', placeholder, ...props }) {
  const formatear = (v) => {
    if (v === '' || v === null || v === undefined) return '';
    const [entero, decimal] = String(v).split('.');
    const conComas = entero.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimal !== undefined ? `${conComas}.${decimal}` : conComas;
  };
  const [texto, setTexto] = useState(formatear(value));
  useEffect(() => { setTexto(formatear(value)); }, [value]);

  const onInput = (e) => {
    const crudo = e.target.value;
    // Solo dígitos y un punto decimal — limpia cualquier otra cosa (letras,
    // varias comas pegadas al copiar/pegar, etc.) antes de reformatear.
    const limpio = crudo.replace(/[^\d.]/g, '');
    const partes = limpio.split('.');
    const numeroLimpio = partes.length > 1 ? `${partes[0]}.${partes.slice(1).join('')}` : limpio;
    setTexto(formatear(numeroLimpio));
    onChange(numeroLimpio);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`input ${className}`}
      value={texto}
      onChange={onInput}
      placeholder={placeholder}
      {...props}
    />
  );
}

// Selector de fecha con mini calendario (popover). `value`/`onChange` usan el
// mismo formato string 'YYYY-MM-DD' que <input type="date">, para poder
// sustituirlo directo en cualquier formulario.
export function DatePicker({ value, onChange, placeholder = 'Selecciona una fecha', className = '' }) {
  const [open, setOpen] = useState(false);
  const [mesVisible, setMesVisible] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setMesVisible(new Date(base.getFullYear(), base.getMonth(), 1));
    const cerrar = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const seleccionada = value ? new Date(`${value}T00:00:00`) : null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diasEnMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const offset = (new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1).getDay() + 6) % 7; // semana lunes-domingo
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cambiarMes = (delta) => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const irA = (anio, mes) => setMesVisible(new Date(anio, mes, 1));

  // Rango del selector de año. Las pólizas de vida llegan a 20+ años de
  // vigencia, así que el rango va muy por delante del año actual; hacia atrás
  // basta con cubrir pólizas antiguas y fechas de nacimiento no se capturan
  // aquí. Siempre incluye el año visible aunque quede fuera del rango (una
  // fecha ya guardada nunca debe desaparecer del selector).
  const anioActual = new Date().getFullYear();
  const anios = (() => {
    const desde = Math.min(anioActual - 10, mesVisible.getFullYear());
    const hasta = Math.max(anioActual + 40, mesVisible.getFullYear());
    return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  })();
  const elegir = (dia) => { onChange(fmt(new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia))); setOpen(false); };

  const label = seleccionada
    ? seleccionada.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input text-left flex items-center justify-between ${!seleccionada ? 'text-slate-400 dark:text-slate-500' : ''}`}
      >
        <span className="truncate">{label}</span>
        <svg className="w-4 h-4 text-slate-400 shrink-0 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {/* Mes y año como selects: llegar a una vigencia a 20 años con las
                flechas eran decenas de clics. */}
            <div className="flex items-center gap-1">
              <select
                aria-label="Mes"
                className="text-sm font-semibold text-slate-700 dark:text-slate-200 bg-transparent rounded-lg px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                value={mesVisible.getMonth()}
                onChange={(e) => irA(mesVisible.getFullYear(), Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>{nombreMes(i + 1)}</option>
                ))}
              </select>
              <select
                aria-label="Año"
                className="text-sm font-semibold text-slate-700 dark:text-slate-200 bg-transparent rounded-lg px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer tabular-nums"
                value={mesVisible.getFullYear()}
                onChange={(e) => irA(Number(e.target.value), mesVisible.getMonth())}
              >
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((dia, i) => {
              if (!dia) return <span key={i} />;
              const d = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
              const esHoy = d.getTime() === hoy.getTime();
              const esSeleccionado = seleccionada && d.getTime() === seleccionada.getTime();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => elegir(dia)}
                  className={`h-7 w-7 rounded-lg text-xs font-medium transition ${esSeleccionado
                    ? 'bg-brand-600 text-white'
                    : esHoy
                      ? 'text-brand-600 dark:text-brand-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >{dia}</button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button type="button" onClick={() => { onChange(fmt(hoy)); setOpen(false); }} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">Hoy</button>
            {value && <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs font-medium text-slate-400 hover:text-red-500">Limpiar</button>}
          </div>
        </div>
      )}
    </div>
  );
}
