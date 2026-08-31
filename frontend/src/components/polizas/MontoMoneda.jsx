import { NumeroFormateado } from '../ui.jsx';
import { MONEDAS, infoMoneda, equivalenteMXN } from './tipos.js';
import { mxn } from '../../lib/format.js';

// Campo de dinero con moneda propia y equivalente en pesos.
//
// Pieza ÚNICA del formulario de pólizas para capturar cualquier cifra que pueda
// estar en MXN / USD / UDIS (suma asegurada, monto por recibo, deducible, costo
// de una cobertura). Antes cada campo resolvía esto a su manera — o no lo
// resolvía y asumía pesos, que es justo el problema que se está corrigiendo.
//
// El equivalente en pesos se muestra SOLO si hay tipo de cambio real de Banxico
// para esa moneda (`equivalenteMXN` devuelve null si no lo hay). Nunca se
// inventa una paridad ni se recicla una vieja sin avisar: si no se puede
// afirmar la cifra en pesos, no se enseña ninguna.
//
// No tener tipo de cambio NO impide registrar la póliza (2026-08-31): el aviso
// es informativo y el servidor guarda la prima en su moneda, dejando la
// conversión pendiente hasta que haya un TC real (ver utils/prima.js).
//
// Props:
//   value / onChange       — monto (string), mismo contrato que NumeroFormateado
//   moneda / onMoneda      — denominación del monto
//   tipos                  — tabla de GET /ventas/tipo-cambio
//   monedas                — subconjunto permitido (ej. las del producto); default: todas
//   placeholder, decimales — presentación del input
export default function MontoMoneda({
  value,
  onChange,
  moneda,
  onMoneda,
  tipos,
  monedas = null,
  placeholder,
  id,
}) {
  const opciones = monedas && monedas.length ? MONEDAS.filter((m) => monedas.includes(m.value)) : MONEDAS;
  const enPesos = equivalenteMXN(value, moneda, tipos);
  const fecha = moneda && moneda !== 'MXN' ? tipos?.[moneda]?.fecha : null;
  const tc = moneda && moneda !== 'MXN' ? tipos?.[moneda]?.valor : null;
  // Con moneda extranjera y sin tipo de cambio disponible se avisa, porque el
  // asesor está viendo una cifra sin referencia en pesos y debe saber por qué.
  const sinTC = Boolean(moneda && moneda !== 'MXN' && !tc);

  return (
    <div>
      <div className="flex gap-1.5">
        <NumeroFormateado
          id={id}
          className="flex-1"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
        <select
          className="input w-[6.5rem] shrink-0"
          title="Moneda de este monto"
          value={moneda || 'MXN'}
          onChange={(e) => onMoneda(e.target.value)}
        >
          {opciones.map((m) => <option key={m.value} value={m.value}>{m.sufijo}</option>)}
        </select>
      </div>
      {enPesos != null && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          ≈ <strong className="tabular-nums font-medium">{mxn(enPesos)}</strong>
          <span className="text-slate-400 dark:text-slate-500">
            {' '}· 1 {infoMoneda(moneda).sufijo} = {tc?.toLocaleString('es-MX', { maximumFractionDigits: 4 })} MXN
            {fecha ? ` (Banxico ${fecha})` : ''}
          </span>
        </p>
      )}
      {sinTC && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Todavía no hay tipo de cambio del día para mostrar el equivalente en pesos.
          Puedes guardar la póliza igual: se calcula solo en cuanto haya uno.
        </p>
      )}
    </div>
  );
}
