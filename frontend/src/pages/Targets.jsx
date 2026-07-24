import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { Card, Field, EmptyState } from '../components/ui.jsx';
import { mxn, num, nombreMes } from '../lib/format.js';

export default function Targets() {
  const qc = useQueryClient();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [form, setForm] = useState({ asesorId: '', metaVentasNum: '', metaPrimaMonto: '' });
  const [err, setErr] = useState('');

  const { data: targets } = useQuery({
    queryKey: ['targets', mes, anio],
    queryFn: async () => (await api.get('/targets', { params: { mes, anio } })).data,
  });
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', mes, anio],
    queryFn: async () => (await api.get('/metricas/dashboard', { params: { mes, anio } })).data,
  });
  const { data: asesores } = useQuery({ queryKey: ['asesores-list'], queryFn: async () => (await api.get('/usuarios/asesores')).data });
  const ranking = dashboard?.ranking || [];

  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (!form.asesorId) return setErr('Selecciona un asesor');
    try {
      await api.post('/targets', {
        asesorId: form.asesorId,
        mes: +mes, anio: +anio,
        metaVentasNum: form.metaVentasNum ? +form.metaVentasNum : null,
        metaPrimaMonto: form.metaPrimaMonto ? +form.metaPrimaMonto : null,
      });
      setForm({ asesorId: '', metaVentasNum: '', metaPrimaMonto: '' });
      qc.invalidateQueries(['targets']);
      qc.invalidateQueries(['dashboard']);
    } catch (e2) { setErr(handleError(e2)); }
  };

  const metaPorAsesor = {};
  targets?.forEach((t) => { metaPorAsesor[t.asesorId] = t; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Metas / Targets</h2>
        <div className="flex gap-2">
          <select className="input w-auto" value={mes} onChange={(e) => setMes(+e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{nombreMes(i + 1)}</option>)}</select>
          <input type="number" className="input w-24" value={anio} onChange={(e) => setAnio(+e.target.value)} />
        </div>
      </div>

      <Card title="Asignar meta">
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <Field label="Asesor">
            <select className="input w-auto" value={form.asesorId} onChange={(e) => setForm({ ...form, asesorId: e.target.value })}>
              <option value="">Selecciona…</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          </Field>
          <Field label="Meta de ventas (núm)"><input type="number" className="input w-32" value={form.metaVentasNum} onChange={(e) => setForm({ ...form, metaVentasNum: e.target.value })} /></Field>
          <Field label="Meta de prima (MXN)"><input type="number" className="input w-40" value={form.metaPrimaMonto} onChange={(e) => setForm({ ...form, metaPrimaMonto: e.target.value })} /></Field>
          <button type="submit" className="btn-primary">Guardar</button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>
      </Card>

      <Card title={`Avance · ${nombreMes(mes)} ${anio}`}>
        {ranking.length === 0 ? <EmptyState message="Sin asesores" /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700"><th className="py-2 pr-4">Asesor</th><th className="py-2 pr-4 text-right">Meta ventas</th><th className="py-2 pr-4 text-right">Ventas</th><th className="py-2 pr-4 text-right">Meta prima</th><th className="py-2 pr-4 text-right">Prima real</th><th className="py-2 pr-4">Avance</th></tr></thead>
            <tbody>
              {ranking.map((r) => {
                const t = metaPorAsesor[r.id];
                const pctVentas = t?.metaVentasNum ? Math.min(100, Math.round((r.ventas / t.metaVentasNum) * 100)) : 0;
                const pctPrima = t?.metaPrimaMonto ? Math.min(100, Math.round((r.prima / t.metaPrimaMonto) * 100)) : 0;
                return (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">{r.nombre}</td>
                    <td className="py-2 pr-4 text-right text-slate-500 dark:text-slate-400">{t?.metaVentasNum ? num(t.metaVentasNum) : '—'}</td>
                    <td className="py-2 pr-4 text-right">{num(r.ventas)}</td>
                    <td className="py-2 pr-4 text-right text-slate-500 dark:text-slate-400">{t?.metaPrimaMonto ? mxn(t.metaPrimaMonto) : '—'}</td>
                    <td className="py-2 pr-4 text-right">{mxn(r.prima)}</td>
                    <td className="py-2 pr-4">
                      {t ? (
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Ventas {pctVentas}% · Prima {pctPrima}%</div>
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                            <div className={`h-full ${pctPrima >= 100 ? 'bg-emerald-500' : 'bg-brand-50 dark:bg-brand-900/300'}`} style={{ width: `${Math.max(pctPrima, pctVentas)}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-slate-400 dark:text-slate-500 text-xs">Sin meta</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
