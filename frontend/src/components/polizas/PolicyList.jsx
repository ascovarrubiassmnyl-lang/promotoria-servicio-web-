import { useMemo, useState } from 'react';
import { EmptyState, VentaBadge } from '../ui.jsx';
import {
  mxn, fechaCorta, RAMOS, RAMOS_LABEL, FORMAS_PAGO,
  ESTADOS_VENTA, ESTADOS_VENTA_LABEL, esVentaGanada, esVentaPipeline,
} from '../../lib/format.js';

// Lista de pólizas COMPARTIDA entre roles (asesor y promotor).
// El comportamiento se condiciona solo por props (readOnly / onOpen), nunca se duplica.
export default function PolicyList({ ventas, loading = false, onOpen }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [ramo, setRamo] = useState('');

  // KPIs sobre TODA la cartera del scope (no sobre el filtro visible).
  // Regla de negocio: ganado y pipeline nunca se suman en una sola cifra.
  const kpis = useMemo(() => {
    const todas = ventas || [];
    const ganadas = todas.filter(esVentaGanada);
    const pendientes = todas.filter(esVentaPipeline);
    const activas = ganadas.length + pendientes.length;
    return {
      comGanada: ganadas.reduce((s, v) => s + (v.comisionMonto || 0), 0),
      primaGanada: ganadas.reduce((s, v) => s + v.primaAnual, 0),
      comPipeline: pendientes.reduce((s, v) => s + (v.comisionMonto || 0), 0),
      primaPipeline: pendientes.reduce((s, v) => s + v.primaAnual, 0),
      ganadas: ganadas.length,
      pendientes: pendientes.length,
      cierre: activas ? Math.round((ganadas.length / activas) * 100) : 0,
    };
  }, [ventas]);

  const filtradas = useMemo(() => {
    let ps = ventas || [];
    if (estado) ps = ps.filter((v) => v.estado === estado);
    if (ramo) ps = ps.filter((v) => v.ramo === ramo);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      ps = ps.filter((v) =>
        `${v.producto} ${v.cliente?.nombre || ''} ${v.cliente?.apellidoP || ''} ${v.cliente?.apellidoM || ''}`.toLowerCase().includes(t));
    }
    return ps;
  }, [ventas, q, estado, ramo]);

  const totPrima = filtradas.reduce((s, v) => s + v.primaAnual, 0);
  const totComGanada = filtradas.filter(esVentaGanada).reduce((s, v) => s + (v.comisionMonto || 0), 0);
  const totComPipeline = filtradas.filter(esVentaPipeline).reduce((s, v) => s + (v.comisionMonto || 0), 0);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi kpi-green">
          <p className="kpi-label">Ganado · cobrado</p>
          <p className="kpi-val">{mxn(kpis.comGanada)}</p>
          <p className="kpi-note">comisión · {kpis.ganadas} póliza(s) · {mxn(kpis.primaGanada)} prima</p>
        </div>
        <div className="kpi kpi-amber">
          <p className="kpi-label">En pipeline · pendiente</p>
          <p className="kpi-val">{mxn(kpis.comPipeline)}</p>
          <p className="kpi-note">comisión potencial · {kpis.pendientes} póliza(s) · {mxn(kpis.primaPipeline)} prima</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Tasa de cierre</p>
          <p className="kpi-val">{kpis.cierre}%</p>
          <div className="flex gap-0.5 mt-2 h-1.5">
            <span className="rounded-full bg-emerald-500" style={{ flex: kpis.ganadas || 0.001 }} />
            <span className="rounded-full bg-amber-400/50" style={{ flex: kpis.pendientes || 0.001 }} />
          </div>
          <p className="kpi-note">{kpis.ganadas} aprobada(s) · {kpis.pendientes} pendiente(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <input
          className="input w-auto min-w-[220px]"
          placeholder="Buscar por cliente o producto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{ESTADOS_VENTA_LABEL[e]}</option>)}
        </select>
        <select className="input w-auto" value={ramo} onChange={(e) => setRamo(e.target.value)}>
          <option value="">Todos los ramos</option>
          {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r]}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {loading ? (
          <EmptyState message="Cargando…" />
        ) : filtradas.length === 0 ? (
          <EmptyState message="Sin pólizas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-3 px-4 font-semibold">Producto (ramo)</th>
                  <th className="py-3 px-4 font-semibold">Cliente</th>
                  <th className="py-3 px-4 font-semibold text-right">Prima</th>
                  <th className="py-3 px-4 font-semibold text-right">Comisión</th>
                  <th className="py-3 px-4 font-semibold text-center">Forma pago</th>
                  <th className="py-3 px-4 font-semibold">Próx. pago</th>
                  <th className="py-3 px-4 font-semibold text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => onOpen(v)}
                    className="border-b border-slate-50 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{v.producto}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{RAMOS_LABEL[v.ramo] || v.ramo}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-200">{v.cliente?.nombre} {v.cliente?.apellidoP}</td>
                    <td className="py-3 px-4 text-right font-semibold tabular-nums">{mxn(v.primaAnual)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={esVentaGanada(v) ? 'money-earned' : 'money-pending'}>{mxn(v.comisionMonto)}</span>
                    </td>
                    <td className="py-3 px-4 text-center"><span className="tag">{FORMAS_PAGO[v.formaPago] || v.formaPago}</span></td>
                    <td className="py-3 px-4 tabular-nums text-slate-600 dark:text-slate-300">
                      {v.fechaProximoPago ? fechaCorta(v.fechaProximoPago) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center"><VentaBadge estado={v.estado} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 font-semibold">
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">Total · {filtradas.length} póliza(s)</td>
                  <td />
                  <td className="py-3 px-4 text-right tabular-nums">{mxn(totPrima)}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="money-earned">{mxn(totComGanada)} ganada</span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal"> · </span>
                    <span className="money-pending">{mxn(totComPipeline)} pipeline</span>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
