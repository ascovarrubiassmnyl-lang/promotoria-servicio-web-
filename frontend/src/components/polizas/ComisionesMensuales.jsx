import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { Card } from '../ui.jsx';
import { mxn, nombreMes } from '../../lib/format.js';

// Comisiones mes a mes del año (GET /ventas/comisiones/resumen):
//  - Esperada: lo que deben generar los recibos que vencen ese mes según el
//    esquema de cada póliza activa (cambia con la forma de pago y el año de
//    póliza).
//  - Cobrada: la comisión de los recibos realmente pagados.
//  - ISR RESICO: ESTIMADO sobre lo cobrado (tabla mensual en el servidor).
// asesorId: cartera de un asesor (vista de promotor); sin él, el alcance lo
// pone el servidor (asesor = lo suyo).
export default function ComisionesMensuales({ asesorId = null }) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [abierto, setAbierto] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['comisiones-resumen', anio, asesorId],
    queryFn: async () => (await api.get('/ventas/comisiones/resumen', { params: { anio, ...(asesorId ? { asesorId } : {}) } })).data,
  });
  const mesActual = new Date().getFullYear() === anio ? new Date().getMonth() + 1 : null;
  const actual = mesActual ? data?.meses?.[mesActual - 1] : null;

  return (
    <Card
      title="Comisiones"
      subtitle="Por recibo, según el año de cada póliza y su forma de pago"
      actions={(
        <div className="flex items-center gap-1 text-sm">
          <button type="button" onClick={() => setAnio((a) => a - 1)} className="btn-secondary px-2 py-1 text-xs" aria-label="Año anterior">‹</button>
          <span className="px-2 font-semibold tabular-nums">{anio}</span>
          <button type="button" onClick={() => setAnio((a) => a + 1)} className="btn-secondary px-2 py-1 text-xs" aria-label="Año siguiente">›</button>
        </div>
      )}
    >
      {isLoading || !data ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {actual && (
              <div className="kpi kpi-accent">
                <p className="kpi-label">{nombreMes(mesActual)} · cobrada</p>
                <p className="kpi-val money-earned">{mxn(actual.cobrada)}</p>
                <p className="kpi-note">de {mxn(actual.esperada)} esperada</p>
              </div>
            )}
            <div className="kpi kpi-green">
              <p className="kpi-label">Cobrada en {anio}</p>
              <p className="kpi-val money-earned">{mxn(data.totales.cobrada)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Esperada en {anio}</p>
              <p className="kpi-val">{mxn(data.totales.esperada)}</p>
              <p className="kpi-note">pólizas activas, por recibo</p>
            </div>
            <div className="kpi kpi-amber">
              <p className="kpi-label">ISR RESICO (estimado)</p>
              <p className="kpi-val">{mxn(data.totales.isrResico)}</p>
              <p className="kpi-note">sobre lo cobrado en {anio}</p>
            </div>
          </div>

          {data.excedeTopeResico && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              Lo cobrado en el año pasa el tope de RESICO ({mxn(data.topeResico)}). Revísalo con tu contador.
            </p>
          )}

          <button type="button" onClick={() => setAbierto((v) => !v)} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {abierto ? 'Ocultar mes por mes' : 'Ver mes por mes'}
          </button>
          {abierto && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-1.5 pr-3">Mes</th>
                    <th className="py-1.5 pr-3 text-right">Esperada</th>
                    <th className="py-1.5 pr-3 text-right">Cobrada</th>
                    <th className="py-1.5 pr-3 text-right">Recibos</th>
                    <th className="py-1.5 text-right">ISR RESICO est.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.meses.map((m) => (
                    <tr key={m.mes} className={`border-b border-slate-50 dark:border-slate-700/50 ${m.mes === mesActual ? 'bg-brand-50/50 dark:bg-brand-500/5' : ''}`}>
                      <td className="py-1.5 pr-3">{nombreMes(m.mes)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{m.esperada ? mxn(m.esperada) : '—'}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${m.cobrada ? 'money-earned' : 'text-slate-400'}`}>
                        {m.cobrada ? mxn(m.cobrada) : '—'}
                        {m.pendientesDeConvertir > 0 && <span className="ml-1 text-xs text-amber-600">+{m.pendientesDeConvertir} por convertir</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{m.recibosCobrados}/{m.recibosEsperados}</td>
                      <td className="py-1.5 text-right tabular-nums">{m.isrResico ? `${mxn(m.isrResico)} (${m.tasaResico}%)` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            ISR de RESICO estimado con la tabla mensual (1% a 2.5% sobre lo cobrado, sin deducir gastos), antes de las retenciones que te haga la aseguradora.
            La comisión se cuenta en el mes en que el cliente paga el recibo; la compañía puede depositarla después. Confírmalo con tu contador antes de declarar.
          </p>
        </div>
      )}
    </Card>
  );
}
