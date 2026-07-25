import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Stat, EmptyState, Badge } from '../components/ui.jsx';
import { mxn, num, nombreMes } from '../lib/format.js';
import PipelineFunnel from '../components/PipelineFunnel.jsx';

export default function Dashboard() {
  const { user, esAdmin } = useAuth();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', mes, anio],
    queryFn: async () => {
      const { data } = await api.get('/metricas/dashboard', { params: { mes, anio } });
      return data;
    },
  });

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline'],
    queryFn: async () => (await api.get('/metricas/pipeline')).data,
  });

  const { data: funnel } = useQuery({
    queryKey: ['funnel'],
    queryFn: async () => (await api.get('/metricas/funnel')).data,
  });

  if (isLoading) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Hola, {user?.nombre} 👋</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            <span className="inline-flex items-center rounded-full bg-brand-50 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-brand-600 dark:text-brand-500 mr-2">
              {esAdmin() ? 'Promotora / Admin' : 'Asesor'}
            </span>
            Período: {nombreMes(mes)} {anio}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={mes} onChange={(e) => setMes(+e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{nombreMes(i + 1)}</option>)}
          </select>
          <input type="number" className="input w-24" value={anio} onChange={(e) => setAnio(+e.target.value)} />
        </div>
      </div>

      {/* Fila 1: clientes y actividad */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat title="Clientes totales" value={num(data.totalClientes)} subtitle={`${num(data.clientesMes)} nuevos este mes`} />
        <Stat title="Citas del mes" value={num(data.citasPeriodo)} color="amber" subtitle={`${pipeline?.citas?.completadas || 0} completadas`} />
        <Stat title="Ventas aprobadas" value={num(data.ventasAprobadas)} color="green" subtitle={`${num(data.ventasPendientes)} pendientes`} />
        <Stat title="Prima anual" value={mxn(data.primaAnualTotal)} color="green" subtitle={`Comisión: ${mxn(data.comisionTotal)}`} />
      </div>

      {/* Fila 2: pipeline financiero */}
      {pipeline && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Stat title="Pólizas firmadas" value={num(pipeline.ventas.firmadas)} color="blue" />
          <Stat title="Pagadas" value={num(pipeline.ventas.pagadas)} color="green" />
          <Stat title="Pendientes de pagar" value={num(pipeline.ventas.pendientesPagar)} color="amber" />
          <Stat title="Canceladas" value={num(pipeline.ventas.canceladas)} color="red" />
          <Stat title="Comisiones" value={mxn(pipeline.comisionTotal)} color="green" />
          <Stat title="Llamadas" value={num(pipeline.llamadas.total)} color="slate" />
        </div>
      )}

      {/* Fila 3: Bonos y referidos */}
      {pipeline && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Bonos">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Bonos cobrados</span>
                <span className="font-semibold text-emerald-600">{mxn(pipeline.bonos.cobrados.monto)}<span className="text-xs ml-1 text-slate-400">({pipeline.bonos.cobrados.count})</span></span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Bonos por ganar</span>
                <span className="font-semibold text-amber-600">{mxn(pipeline.bonos.porGanar.monto)}<span className="text-xs ml-1 text-slate-400">({pipeline.bonos.porGanar.count})</span></span>
              </div>
            </div>
          </Card>

          <Card title="Referidos">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Total referidos</span>
                <span className="font-semibold">{num(pipeline.referidos.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Convertidos</span>
                <span className="font-semibold text-emerald-600">{num(pipeline.referidos.convertidos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Tasa de conversión</span>
                <span className="font-semibold">{pipeline.referidos.total > 0 ? ((pipeline.referidos.convertidos / pipeline.referidos.total) * 100).toFixed(1) : 0}%</span>
              </div>
            </div>
          </Card>

          <Card title="Tasa de conversión">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Prospecto → Propuesta</span>
                <span className="font-semibold">{pipeline.conversiones.prospectoPropuesta}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Cita → Venta</span>
                <span className="font-semibold">{pipeline.conversiones.citaVenta}%</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Fila 4: embudo del pipeline */}
      {funnel && funnel.length > 0 && (
        <Card title="Embudo del pipeline de clientes" subtitle="Distribución de clientes por etapa">
          <PipelineFunnel datos={funnel} />
        </Card>
      )}

      {esAdmin() && data.ranking && (
        <Card title="Ranking de asesores" subtitle={`${data.totalAsesores} asesores activos`}>
          {data.ranking.length === 0 ? (
            <EmptyState message="No hay asesores activos" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Asesor</th>
                    <th className="py-2 pr-4 text-right">Clientes</th>
                    <th className="py-2 pr-4 text-right">Citas</th>
                    <th className="py-2 pr-4 text-right">Ventas</th>
                    <th className="py-2 pr-4 text-right">Prima anual</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((r, idx) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                      <td className="py-2 pr-4">
                        <Badge color={idx === 0 ? 'amber' : idx === 1 ? 'slate' : idx === 2 ? 'slate' : 'slate'}>{idx + 1}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">{r.nombre}</td>
                      <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-300">{num(r.clientes)}</td>
                      <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-300">{num(r.citas)}</td>
                      <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-300">{num(r.ventas)}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-emerald-600">{mxn(r.prima)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <VentasPorRamo />
    </div>
  );
}

const RAMO_PALETA = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#64748b'];

function VentasPorRamo() {
  const { data, isLoading } = useQuery({
    queryKey: ['ventas-por-ramo'],
    queryFn: async () => {
      const { data } = await api.get('/metricas/ventas-por-ramo');
      return data;
    },
  });
  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  const totalPrima = data.reduce((acc, d) => acc + (d._sum.primaAnual || 0), 0);
  const totalPolizas = data.reduce((acc, d) => acc + d._count._all, 0);
  const ramos = data.map((d, i) => ({
    ramo: d.ramo,
    polizas: d._count._all,
    prima: d._sum.primaAnual || 0,
    pct: totalPrima ? (d._sum.primaAnual / totalPrima) * 100 : 0,
    color: RAMO_PALETA[i % RAMO_PALETA.length],
  }));

  // Dona: cada ramo es un arco proporcional a su prima anual
  const R = 70;
  const circ = 2 * Math.PI * R;
  let offsetAcum = 0;

  return (
    <Card title="Ventas por ramo" subtitle="Distribución de la prima anual por tipo de seguro">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 items-center">
        <div className="relative mx-auto h-48 w-48">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" strokeWidth="26" className="stroke-slate-100 dark:stroke-slate-700/60" />
            {ramos.map((r) => {
              const largo = (r.pct / 100) * circ;
              const seg = (
                <circle
                  key={r.ramo}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={r.color}
                  strokeWidth="26"
                  strokeDasharray={`${Math.max(largo - 2, 0)} ${circ - Math.max(largo - 2, 0)}`}
                  strokeDashoffset={-offsetAcum}
                  strokeLinecap="butt"
                >
                  <title>{`${r.ramo}: ${mxn(r.prima)} (${Math.round(r.pct)}%)`}</title>
                </circle>
              );
              offsetAcum += largo;
              return seg;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{mxn(totalPrima)}</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Prima total</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{num(totalPolizas)} pólizas</p>
          </div>
        </div>

        <div className="space-y-3">
          {ramos.map((r) => (
            <div key={r.ramo} className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{r.ramo}</span>
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">
                    {num(r.polizas)} pólizas · <span className="font-semibold text-slate-700 dark:text-slate-200">{mxn(r.prima)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(r.pct, 2)}%`, backgroundColor: r.color }} />
                </div>
              </div>
              <span className="w-10 text-right text-sm font-semibold text-slate-600 dark:text-slate-300 shrink-0">{Math.round(r.pct)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
