import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { EmptyState } from '../components/ui.jsx';
import { mxn } from '../lib/format.js';
import PolizasView from '../components/polizas/PolizasView.jsx';
import ActividadView from '../components/actividad/ActividadView.jsx';

const iniciales = (a) => `${a.nombre?.[0] || ''}${a.apellidoP?.[0] || ''}`.toUpperCase();
const nombreCompleto = (a) => `${a.nombre} ${a.apellidoP}${a.apellidoM ? ` ${a.apellidoM}` : ''}`;

function useResumenEquipo() {
  return useQuery({
    queryKey: ['equipo-resumen'],
    queryFn: async () => (await api.get('/ventas/equipo/resumen')).data,
  });
}

// Roster de asesores para el promotor: pólizas y comisiones por asesor.
// Ruta protegida con AdminRoute; el endpoint del backend también exige rol promotor.
export default function Equipo() {
  const navigate = useNavigate();
  const { data: resumen, isLoading } = useResumenEquipo();
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('');

  const filas = useMemo(() => {
    let r = resumen || [];
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      r = r.filter((x) => nombreCompleto(x.asesor).toLowerCase().includes(t));
    }
    if (filtro === 'pendientes') r = r.filter((x) => x.pendientes > 0);
    return r;
  }, [resumen, q, filtro]);

  const tot = useMemo(() => (resumen || []).reduce((acc, x) => ({
    polizas: acc.polizas + x.polizas,
    prima: acc.prima + x.primaGestionada,
    ganada: acc.ganada + x.comisionGanada,
    pipeline: acc.pipeline + x.comisionPipeline,
  }), { polizas: 0, prima: 0, ganada: 0, pipeline: 0 }), [resumen]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Equipo · Pólizas por asesor</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Selecciona un asesor para ver el detalle de su cartera</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi kpi-accent">
          <p className="kpi-label">Asesores activos</p>
          <p className="kpi-val">{resumen?.length ?? '—'}</p>
          <p className="kpi-note">{tot.polizas} póliza(s) en total</p>
        </div>
        <div className="kpi kpi-green">
          <p className="kpi-label">Comisión del equipo (ganada)</p>
          <p className="kpi-val">{mxn(tot.ganada)}</p>
          <p className="kpi-note">cobrada / pagada</p>
        </div>
        <div className="kpi kpi-amber">
          <p className="kpi-label">Comisión en pipeline</p>
          <p className="kpi-val">{mxn(tot.pipeline)}</p>
          <p className="kpi-note">pendiente de cierre</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Prima gestionada</p>
          <p className="kpi-val">{mxn(tot.prima)}</p>
          <p className="kpi-note">todo el equipo</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className="input w-auto min-w-[220px]" placeholder="Buscar asesor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos los asesores</option>
          <option value="pendientes">Con pendientes</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <EmptyState message="Cargando…" /> : filas.length === 0 ? <EmptyState message="Sin asesores" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-3 px-4 font-semibold">Asesor</th>
                  <th className="py-3 px-4 font-semibold text-center">Pólizas</th>
                  <th className="py-3 px-4 font-semibold text-right">Prima gestionada</th>
                  <th className="py-3 px-4 font-semibold text-right">Comisión ganada</th>
                  <th className="py-3 px-4 font-semibold text-right">En pipeline</th>
                  <th className="py-3 px-4 font-semibold text-center">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((x) => (
                  <tr
                    key={x.asesor.id}
                    onClick={() => navigate(`/equipo/${x.asesor.id}`)}
                    className="border-b border-slate-50 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="avatar">{iniciales(x.asesor)}</div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{nombreCompleto(x.asesor)}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">Asesor</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums">{x.polizas}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{mxn(x.primaGestionada)}</td>
                    <td className="py-3 px-4 text-right"><span className="money-earned">{mxn(x.comisionGanada)}</span></td>
                    <td className="py-3 px-4 text-right"><span className="money-pending">{mxn(x.comisionPipeline)}</span></td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-semibold tabular-nums">{x.cierrePct}%</span>
                        <div className="w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${x.cierrePct}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Perfil de un asesor concreto para el promotor, con dos pestañas:
//  - Pólizas: control total de la cartera (crear asignada a ese asesor,
//    editar, eliminar, registrar pagos y aprobar/rechazar).
//  - Actividad: línea de tiempo del asesor en modo consulta (mismo
//    ActivityTimeline que usa el propio asesor).
export function EquipoAsesor() {
  const { asesorId } = useParams();
  const [tab, setTab] = useState('polizas');
  const { data: resumen } = useResumenEquipo();
  const asesor = resumen?.find((x) => x.asesor.id === asesorId)?.asesor;
  const nombre = asesor ? nombreCompleto(asesor) : 'Asesor';

  const tabs = [
    { id: 'polizas', label: 'Pólizas' },
    { id: 'actividad', label: 'Actividad' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 dark:text-slate-500">
        <Link to="/equipo" className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition">Equipo</Link>
        <span> / </span>
        <span>{nombre}</span>
      </p>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'polizas' && (
        <PolizasView
          asesorId={asesorId}
          titulo={`Pólizas de ${nombre}`}
          subtitulo="Vista de promotor · control total de la cartera"
          banner={
            <div className="scope-banner">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
              <span>Estás gestionando la cartera de <strong>{nombre}</strong> como promotor: las pólizas que crees aquí se asignan a este asesor.</span>
            </div>
          }
        />
      )}

      {tab === 'actividad' && (
        <ActividadView
          asesorId={asesorId}
          titulo={`Actividad de ${nombre}`}
          scopeLabel="Consulta · promotor"
          banner={
            <div className="scope-banner">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
              <span>Estás viendo la actividad de <strong>{nombre}</strong> como promotor (solo consulta).</span>
            </div>
          }
        />
      )}
    </div>
  );
}
