import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.js';
import { Card, CitaBadge, VentaBadge, EmptyState } from '../components/ui.jsx';
import { mxn, fechaHora, hora, nombreMes } from '../lib/format.js';

// La vista de clientes por asesor vive en components/clientes/ClientesView.jsx
// (contenedor compartido con scope asesorId, mismo patrón que PolizasView).

export function CitasAsesor({ asesorId, vistaCalendario }) {
  const [mes, setMes] = useState(new Date());
  const ini = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const { data } = useQuery({
    queryKey: ['citas-asesor', asesorId, ini.toISOString()],
    queryFn: async () => (await api.get('/citas', { params: { asesorId, desde: ini.toISOString(), hasta: fin.toISOString() } })).data,
  });
  const citas = data || [];
  if (vistaCalendario) {
    const grid = [];
    const primer = ini.getDay();
    for (let i = 0; i < primer; i++) grid.push(null);
    for (let d = 1; d <= fin.getDate(); d++) grid.push(new Date(mes.getFullYear(), mes.getMonth(), d));
    while (grid.length % 7 !== 0) grid.push(null);
    const porDia = {};
    citas.forEach((c) => { const k = new Date(c.fechaHoraInicio).getDate(); (porDia[k] = porDia[k] || []).push(c); });
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="btn-secondary px-3 min-h-[44px] md:min-h-0" aria-label="Mes anterior">←</button>
          <span className="text-sm font-medium px-2">{nombreMes(mes.getMonth() + 1)} {mes.getFullYear()}</span>
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="btn-secondary px-3 min-h-[44px] md:min-h-0" aria-label="Mes siguiente">→</button>
        </div>
        <Card>
          <div className="grid grid-cols-7 text-center text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => <div key={d} className="py-1"><span className="md:hidden">{d[0]}</span><span className="hidden md:inline">{d}</span></div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const items = porDia[d.getDate()] || [];
              return (
                <div key={i} className="min-h-[48px] md:min-h-[70px] rounded-lg border border-slate-100 dark:border-slate-700 p-1 md:p-1.5 max-md:text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-300">{d.getDate()}</div>
                  {/* Celular: en 7 columnas no cabe texto legible; solo el conteo del día. */}
                  {items.length > 0 && (
                    <span className="md:hidden mt-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                      {items.length}
                    </span>
                  )}
                  <div className="hidden md:block mt-1 space-y-0.5">
                    {items.slice(0, 3).map((c) => (
                      <div key={c.id} className="text-[10px] text-slate-600 dark:text-slate-300 truncate">• {hora(c.fechaHoraInicio)} {c.cliente?.nombre}</div>
                    ))}
                    {items.length > 3 && <p className="text-[10px] text-slate-400 dark:text-slate-500">+{items.length - 3}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }
  if (citas.length === 0) return <EmptyState message="Sin citas este mes" />;
  return (
    <Card><ul className="divide-y divide-slate-100">
      {citas.sort((a, b) => new Date(a.fechaHoraInicio) - new Date(b.fechaHoraInicio)).map((c) => (
        <li key={c.id} className="py-2.5 md:py-2 flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.titulo}</p><p className="text-xs text-slate-500 dark:text-slate-400">{c.cliente?.nombre} {c.cliente?.apellidoP} · {fechaHora(c.fechaHoraInicio)}</p></div>
          <CitaBadge estado={c.estado} />
        </li>
      ))}
    </ul></Card>
  );
}

export function VentasAsesor({ asesorId }) {
  const { data } = useQuery({ queryKey: ['ventas-asesor', asesorId], queryFn: async () => (await api.get('/ventas', { params: { asesorId } })).data });
  if (!data || data.length === 0) return <EmptyState message="Sin ventas" />;
  const total = data.filter((v) => v.estado === 'APROBADA').reduce((a, v) => a + v.primaAnual, 0);
  return (
    <Card>
      <p className="text-xs uppercase text-slate-500 dark:text-slate-400 mb-3">Prima anual aprobada: <span className="text-emerald-600 font-bold">{mxn(total)}</span></p>
      {/* Celular: una tarjeta por póliza en vez de la tabla de 5 columnas. */}
      <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-700/60">
        {data.map((v) => (
          <li key={v.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{v.producto}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{v.aseguradora}</p>
              </div>
              <VentaBadge estado={v.estado} />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-slate-600 dark:text-slate-300 tabular-nums">Prima {mxn(v.primaAnual)}</span>
              <span className="text-emerald-600 tabular-nums">Comisión {mxn(v.comisionMonto)}</span>
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden md:table w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700"><th className="py-2 pr-4">Producto</th><th className="py-2 pr-4">Aseguradora</th><th className="py-2 pr-4 text-right">Prima</th><th className="py-2 pr-4 text-right">Comisión</th><th className="py-2 pr-4">Estado</th></tr></thead>
        <tbody>
          {data.map((v) => (
            <tr key={v.id} className="border-b border-slate-50">
              <td className="py-2 pr-4">{v.producto}</td>
              <td className="py-2 pr-4">{v.aseguradora}</td>
              <td className="py-2 pr-4 text-right">{mxn(v.primaAnual)}</td>
              <td className="py-2 pr-4 text-right text-emerald-600">{mxn(v.comisionMonto)}</td>
              <td className="py-2 pr-4"><VentaBadge estado={v.estado} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function TendenciaMes({ asesorId, anio }) {
  const añoActual = new Date().getFullYear();
  const [year, setYear] = useState(anio || añoActual);
  const { data } = useQuery({
    queryKey: ['tendencia', asesorId, year],
    queryFn: async () => (await api.get('/metricas/tendencia', { params: { asesorId, anio: year } })).data,
  });
  const arr = data || [];
  const maxPrima = Math.max(1, ...arr.map((m) => m.prima));
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Ventas por mes · {year}</h3>
        <input type="number" className="input w-24 max-md:min-h-[44px]" value={year} onChange={(e) => setYear(+e.target.value)} />
      </div>
      <div className="flex items-end gap-1 h-40">
        {arr.map((m) => (
          <div key={m.mes} className="flex-1 flex flex-col items-center justify-end gap-1">
            <div className="w-full bg-brand-50 dark:bg-brand-900/300 rounded-t" style={{ height: `${(m.prima / maxPrima) * 100}%`, minHeight: m.prima ? '4px' : '0' }} title={mxn(m.prima)} />
            <span className="md:hidden text-xs text-slate-400 dark:text-slate-500">{nombreMes(m.mes)[0]}</span>
            <span className="hidden md:inline text-[10px] text-slate-400 dark:text-slate-500">{nombreMes(m.mes).slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <div className="hidden md:flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1">
        {arr.map((m) => <span key={m.mes} className="flex-1 text-center">{mxn(m.prima)}</span>)}
      </div>
      {/* Celular: 12 cifras en una fila no caben; se listan solo los meses con venta. */}
      <ul className="md:hidden mt-3 divide-y divide-slate-100 dark:divide-slate-700/60">
        {arr.filter((m) => m.prima > 0).map((m) => (
          <li key={m.mes} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="text-slate-600 dark:text-slate-300">{nombreMes(m.mes)}</span>
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{mxn(m.prima)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
