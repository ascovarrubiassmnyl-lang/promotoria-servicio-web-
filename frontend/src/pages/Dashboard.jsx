import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Stat, EmptyState, Badge } from '../components/ui.jsx';
import { mxn, num, nombreMes, ESTADOS_CLIENTE_LABEL } from '../lib/format.js';

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
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Hola, {user?.nombre}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{esAdmin() ? 'Vista promotora / admin' : 'Vista asesor'} · Período: {nombreMes(mes)} {anio}</p>
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

function PipelineFunnel({ datos }) {
  const max = Math.max(...datos.map((d) => d.count), 1);
  const funnelColors = {
    PROSPECTO: 'bg-slate-300',
    CITA: 'bg-blue-400',
    PROPUESTA: 'bg-purple-400',
    CIERRE_FIRMA: 'bg-amber-400',
    ENTREGA_POLIZA: 'bg-emerald-400',
    REFERIDOS: 'bg-cyan-400',
    POST_VENTA_SEGUIMIENTO: 'bg-green-500',
    NECESITA_SEGUIMIENTO: 'bg-red-400',
  };
  const total = datos.reduce((a, d) => a + d.count, 0);
  const etapasActivas = ['PROSPECTO', 'CITA', 'PROPUESTA', 'CIERRE_FIRMA', 'ENTREGA_POLIZA'];
  let previousCount = null;
  return (
    <div className="space-y-3">
      {datos.map((d, idx) => {
        const esActivo = etapasActivas.includes(d.etapa);
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const width = max > 0 ? Math.max((d.count / max) * 100, 4) : 4;
        const conversion = esActivo && previousCount > 0 && d.count > 0 ? ((d.count / previousCount) * 100).toFixed(0) : null;
        if (esActivo) previousCount = d.count;
        return (
          <div key={d.etapa}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">{ESTADOS_CLIENTE_LABEL[d.etapa]}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {num(d.count)} {pct > 0 && `(${pct}%)`}
                {conversion && <span className="ml-2 text-xs text-amber-600">↓ {conversion}%</span>}
              </span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
              <div className={`h-full ${funnelColors[d.etapa]}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  return (
    <Card title="Ventas por ramo">
      <div className="space-y-3">
        {data.map((d) => {
          const pct = totalPrima ? Math.round((d._sum.primaAnual / totalPrima) * 100) : 0;
          return (
            <div key={d.ramo}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">{d.ramo}</span>
                <span className="text-slate-500 dark:text-slate-400">{d._count._all} pólizas · {mxn(d._sum.primaAnual)} ({pct}%)</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                <div className="h-full bg-brand-50 dark:bg-brand-900/300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
