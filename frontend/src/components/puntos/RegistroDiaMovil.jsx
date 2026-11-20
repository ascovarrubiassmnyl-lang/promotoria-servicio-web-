import { useEffect, useRef, useState } from 'react';
import { isoDia, DIAS_LABEL } from '../../lib/semana.js';

// Captura del registro diario de 25 puntos en celular (< md). Sustituye a la
// tabla días × columnas: se elige un día con los chips y se captura cada
// actividad con un stepper. Los valores por actividad y la meta vienen del
// servidor (props), aquí no se re-declaran. El guardado es el mismo de la
// tabla (PUT /puntos/dia vía onGuardar), con una espera corta para no mandar
// una petición por cada toque.
const ESPERA_GUARDADO_MS = 500;

export default function RegistroDiaMovil({
  dias, filas, campos, valores, metaDiaria, hoy, soloLectura, puntosDeFila, onCambiar, onGuardar,
}) {
  const claves = dias.map(isoDia);
  const inicial = () => (claves.includes(hoy) ? hoy : claves[0]);
  const [sel, setSel] = useState(inicial);
  // Al cambiar de semana, el día elegido vuelve a hoy (o al lunes).
  useEffect(() => { setSel(inicial()); }, [claves[0], hoy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardado diferido por día; se vacía al desmontar para no perder cambios.
  const pendientes = useRef({});
  const guardarRef = useRef(onGuardar);
  guardarRef.current = onGuardar;
  useEffect(() => () => {
    for (const [clave, { timer, fila }] of Object.entries(pendientes.current)) {
      clearTimeout(timer);
      guardarRef.current(clave, fila);
    }
  }, []);
  const programarGuardado = (clave, fila) => {
    const prev = pendientes.current[clave];
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      delete pendientes.current[clave];
      guardarRef.current(clave, fila);
    }, ESPERA_GUARDADO_MS);
    pendientes.current[clave] = { timer, fila };
  };

  const fila = filas[sel] || {};
  const cerrado = sel < hoy;
  const bloqueado = soloLectura || cerrado;
  const puntos = puntosDeFila(fila);
  const idx = claves.indexOf(sel);
  const pct = metaDiaria ? Math.min(100, Math.round((puntos / metaDiaria) * 100)) : 0;

  const cambiar = (campo, valor) => {
    if (bloqueado) return;
    const limpio = String(valor).replace(/\D/g, '');
    const nueva = { ...fila, [campo]: limpio === '0' ? '' : limpio };
    onCambiar(sel, campo, nueva[campo]);
    programarGuardado(sel, nueva);
  };
  const paso = (campo, delta) => cambiar(campo, String(Math.max(0, (Number(fila[campo]) || 0) + delta)));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Día de la semana">
        {dias.map((d, i) => {
          const clave = claves[i];
          const activo = clave === sel;
          const esHoy = clave === hoy;
          const p = puntosDeFila(filas[clave]);
          return (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={activo}
              aria-label={`${DIAS_LABEL[i]} ${d.getDate()}${esHoy ? ' (hoy)' : ''}`}
              onClick={() => setSel(clave)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl text-xs transition-colors ${
                activo
                  ? 'bg-brand-600 text-white'
                  : esHoy
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300 dark:bg-brand-900/30 dark:text-brand-300 dark:ring-brand-700'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300'
              }`}
            >
              <span className="font-semibold">{DIAS_LABEL[i][0]}</span>
              <span className="tabular-nums text-sm font-bold">{d.getDate()}</span>
              <span className={`h-1 w-1 rounded-full ${p >= metaDiaria ? (activo ? 'bg-white' : 'bg-emerald-500') : p > 0 ? (activo ? 'bg-white/70' : 'bg-slate-400') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {DIAS_LABEL[idx]} {dias[idx]?.getDate()}{sel === hoy ? ' · hoy' : ''}
          </p>
          <p className="tabular-nums text-sm">
            <span className={`text-lg font-bold ${puntos >= metaDiaria ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>{puntos}</span>
            <span className="text-slate-400 dark:text-slate-500"> / {metaDiaria} pts</span>
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full rounded-full ${puntos >= metaDiaria ? 'bg-emerald-500' : 'bg-brand-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {cerrado && !soloLectura && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Día cerrado: ya no se puede modificar.</p>
        )}
        {!cerrado && soloLectura && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Solo consulta.</p>
        )}
        {cerrado && soloLectura && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Día cerrado · solo consulta.</p>
        )}
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {campos.map(([campo, label]) => {
          const v = fila[campo] ?? '';
          const n = Number(v) || 0;
          const valor = valores[campo];
          return (
            <li key={campo} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {valor ? `${valor} pt${valor > 1 ? 's' : ''} c/u${n ? ` · ${n * valor} pts` : ''}` : 'No suma puntos'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => paso(campo, -1)}
                  disabled={bloqueado || n === 0}
                  aria-label={`Restar ${label}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-700 active:scale-[0.95] disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={v}
                  placeholder="0"
                  disabled={bloqueado}
                  onChange={(e) => cambiar(campo, e.target.value)}
                  aria-label={label}
                  className="h-11 w-12 rounded-lg bg-transparent text-center text-base font-bold tabular-nums text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => paso(campo, 1)}
                  disabled={bloqueado}
                  aria-label={`Sumar ${label}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold text-white active:scale-[0.95] disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
