import { mxn, FORMAS_PAGO } from '../../lib/format.js';

// Comisión de la póliza a lo largo de su vida (datos de
// GET /ventas/:id/comisiones o POST /ventas/comisiones/preview; la tabla de
// porcentajes vive en el servidor, utils/comisiones.js — aquí solo se pinta).
// Los años consecutivos con el mismo % se agrupan ("Años 4–10") para que una
// póliza vitalicia no sea una lista de 30 filas.
// Información INTERNA del asesor: no se muestra al cliente.

function agrupar(anios) {
  const grupos = [];
  for (const a of anios) {
    const g = grupos[grupos.length - 1];
    if (g && g.pct === a.pct && g.comisionAnualMXN === a.comisionAnualMXN && a.anio !== 1 && g.desde !== 1) {
      g.hasta = a.anio;
      g.cobradoMXN += a.cobradoMXN || 0;
    } else {
      grupos.push({ ...a, desde: a.anio, hasta: a.anio, cobradoMXN: a.cobradoMXN || 0 });
    }
  }
  return grupos;
}

export default function TablaComisiones({ datos, formaPago, mostrarCobrado = false }) {
  if (!datos) return null;
  const { esquema, sinTabla, anios = [], totalVidaMXN, tipoCambio, moneda } = datos;
  const recibos = anios[0]?.recibos || 1;
  const grupos = agrupar(anios);
  const sinPesos = anios.length > 0 && anios[0].comisionAnualMXN == null && anios[0].comisionAnual != null;

  return (
    <div className="space-y-2">
      {esquema ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Esquema SMNYL · <span className="font-medium text-slate-700 dark:text-slate-200">{esquema.producto}</span>
          {esquema.variante ? ` · ${esquema.variante}` : ''}
          {' · '}{FORMAS_PAGO[formaPago] || formaPago}{recibos > 1 ? ` (${recibos} recibos al año)` : ''}
        </p>
      ) : sinTabla && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Este producto no tiene tabla de comisiones cargada: se usa el % capturado solo para el primer año.
        </p>
      )}
      {esquema?.supuestos?.map((s) => (
        <p key={s} className="text-xs text-amber-700 dark:text-amber-400">{s}</p>
      ))}
      {sinPesos && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Sin tipo de cambio disponible: las cifras en pesos aparecen cuando haya uno.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-1.5 pr-3">Año de póliza</th>
              <th className="py-1.5 pr-3 text-right">%</th>
              <th className="py-1.5 pr-3 text-right">Por año</th>
              {recibos > 1 && <th className="py-1.5 pr-3 text-right">Por recibo</th>}
              {mostrarCobrado && <th className="py-1.5 text-right">Cobrado</th>}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.desde} className="border-b border-slate-50 dark:border-slate-700/50">
                <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                  {g.desde === g.hasta ? `Año ${g.desde}` : `Años ${g.desde}–${g.hasta}`}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{g.pct}%</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{g.comisionAnualMXN != null ? mxn(g.comisionAnualMXN) : '—'}</td>
                {recibos > 1 && <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{g.porReciboMXN != null ? mxn(g.porReciboMXN) : '—'}</td>}
                {mostrarCobrado && (
                  <td className={`py-1.5 text-right tabular-nums ${g.cobradoMXN > 0 ? 'money-earned' : 'text-slate-400'}`}>
                    {g.cobradoMXN > 0 ? mxn(g.cobradoMXN) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {anios.length > 1 && totalVidaMXN != null && (
            <tfoot>
              <tr className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                <td className="pt-2 pr-3" colSpan={2}>Total en {anios.length} años de primas</td>
                <td className="pt-2 pr-3 text-right tabular-nums">{mxn(totalVidaMXN)}</td>
                {recibos > 1 && <td />}
                {mostrarCobrado && <td className="pt-2 text-right tabular-nums money-earned">{mxn(datos.cobradoMXN || 0)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {moneda !== 'MXN' && tipoCambio && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          En pesos al tipo de cambio de hoy (1 {moneda} = {tipoCambio.toLocaleString('es-MX', { maximumFractionDigits: 4 })} MXN). Lo cobrado usa el del día de cada pago.
        </p>
      )}
    </div>
  );
}
