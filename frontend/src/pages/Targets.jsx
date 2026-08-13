import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, EmptyState } from '../components/ui.jsx';
import { mxn, num, nombreMes } from '../lib/format.js';
import GoalBlock, { MiniBar } from '../components/metas/GoalBlock.jsx';
import { infoRitmo, pctAvance, diasPeriodo, ESTADOS_RITMO } from '../components/metas/ritmo.js';
import { METRICAS, sinMetas } from '../components/metas/metricas.js';

function ChipTranscurrido({ mes, anio }) {
  const { dia, dias, fraccion } = diasPeriodo(mes, anio);
  const texto = fraccion <= 0 ? 'El mes aún no inicia'
    : fraccion >= 1 ? 'Mes concluido'
    : <>Mes transcurrido: <b className="text-slate-700 dark:text-slate-200">{Math.round(fraccion * 100)}%</b> · día {dia} de {dias}</>;
  return (
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 rounded-lg px-2.5 py-1.5">
      {texto}
    </span>
  );
}

// Reconciliación por métrica: suma de metas individuales vs meta de promotoría.
// Solo aparecen las métricas con meta de equipo fijada.
function Reconciliacion({ equipo }) {
  const meta = equipo?.meta;
  if (!meta || sinMetas(meta)) return null;
  const filas = METRICAS.filter((m) => meta[m.campo]).map((m) => {
    const fmt = m.money ? mxn : num;
    const suma = equipo.sumaIndividual[m.key] || 0;
    const gap = meta[m.campo] - suma;
    return { ...m, fmt, suma, objetivo: meta[m.campo], gap };
  });
  return (
    <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Reconciliación · suma de metas individuales vs meta de promotoría
      </div>
      <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3 text-sm">
        {filas.map((f) => (
          <div key={f.key} className="flex items-baseline justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{f.corto}</span>
            <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">
              {f.fmt(f.suma)} / {f.fmt(f.objetivo)}
              {f.gap > 0 && <span className="ml-2 font-semibold text-amber-600 dark:text-amber-400">Por asignar {f.fmt(f.gap)}</span>}
              {f.gap < 0 && <span className="ml-2 font-semibold text-red-600 dark:text-red-400">Sobreasignado {f.fmt(-f.gap)}</span>}
              {f.gap === 0 && <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">Cubierta</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Formulario de las 6 métricas (meta de equipo o fila de asesor).
function CamposMeta({ valores, onChange, autoFocus = false }) {
  return METRICAS.map((m, i) => (
    <label key={m.key} className="label !mb-0">
      {m.label}
      <input
        type="number" min="0" className="input w-32 mt-1" placeholder={m.placeholder}
        value={valores[m.key]} autoFocus={autoFocus && i === 0}
        onChange={(e) => onChange({ ...valores, [m.key]: e.target.value })}
      />
    </label>
  ));
}

const valoresDe = (t) => Object.fromEntries(METRICAS.map((m) => [m.key, t?.[m.campo] ?? '']));
const payloadDe = (valores) => Object.fromEntries(METRICAS.map((m) => [m.campo, valores[m.key] === '' ? null : +valores[m.key]]));

// Meta de ingreso (PRP): campo personal aparte de las 6 métricas, solo en
// Target (no se reconcilia contra la meta de equipo). El backend la traduce
// a "pólizas necesarias" con la comisión promedio histórica del asesor
// (GET /targets/resumen → promedioComisionPoliza/polizasParaMeta).
function MetaIngresoNota({ fila }) {
  const meta = fila?.meta?.metaIngresoMonto;
  if (!meta) return <span className="text-xs italic text-slate-400 dark:text-slate-500">Sin meta de ingreso</span>;
  if (!fila.promedioComisionPoliza) {
    return (
      <>
        <div className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{mxn(meta)}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">Aún sin pólizas ganadas para proyectar</div>
      </>
    );
  }
  const faltan = Math.max(0, (fila.polizasParaMeta || 0) - fila.actual.ventas);
  return (
    <>
      <div className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{mxn(meta)}/mes</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        ≈ {fila.polizasParaMeta} pólizas ({mxn(fila.promedioComisionPoliza)} prom.){' '}
        {faltan > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-400">· faltan {faltan}</span> : <span className="font-semibold text-emerald-600 dark:text-emerald-400">· cubierta</span>}
      </div>
    </>
  );
}

// Grid de bloques grandes (meta de promotoría / "mi meta") en las 6 métricas.
function BloquesMeta({ meta, actual, fraccion }) {
  return (
    <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
      {METRICAS.map((m) => (
        <GoalBlock key={m.key} label={m.label} actual={actual?.[m.key] ?? 0} meta={meta?.[m.campo]} fraccion={fraccion} money={m.money} />
      ))}
    </div>
  );
}

export default function Targets() {
  const qc = useQueryClient();
  const { esAdmin } = useAuth();
  const admin = esAdmin();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [err, setErr] = useState('');
  // Edición en línea: fila de asesor en edición y formulario de meta de equipo
  const [editRow, setEditRow] = useState(null); // { asesorId, valores }
  const [editTeam, setEditTeam] = useState(null); // { valores }
  const [saving, setSaving] = useState(false);

  const { fraccion } = diasPeriodo(mes, anio);
  const periodo = `${nombreMes(mes)} ${anio}`;

  // Resumen del periodo: asesores con meta + actuales de las 6 métricas.
  // La API acota por rol: el asesor recibe solo su propia fila.
  const { data: resumen } = useQuery({
    queryKey: ['metas-resumen', mes, anio],
    queryFn: async () => (await api.get('/targets/resumen', { params: { mes, anio } })).data,
  });
  const { data: equipo } = useQuery({
    queryKey: ['meta-equipo', mes, anio],
    enabled: admin,
    queryFn: async () => (await api.get('/targets/equipo', { params: { mes, anio } })).data,
  });

  const invalidar = () => {
    qc.invalidateQueries(['metas-resumen']);
    qc.invalidateQueries(['meta-equipo']);
  };

  const guardarFila = async () => {
    setSaving(true); setErr('');
    try {
      const metaIngresoMonto = editRow.ingreso === '' ? null : +editRow.ingreso;
      await api.post('/targets', { asesorId: editRow.asesorId, mes, anio, ...payloadDe(editRow.valores), metaIngresoMonto });
      setEditRow(null);
      invalidar();
    } catch (e) { setErr(handleError(e)); } finally { setSaving(false); }
  };

  const guardarEquipo = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      await api.post('/targets/equipo', { mes, anio, ...payloadDe(editTeam.valores) });
      setEditTeam(null);
      invalidar();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  // Filas: estado por ritmo = el PEOR avance entre las métricas con meta.
  // Ranking por % de avance de prima (y prima absoluta como desempate).
  const asesores = resumen?.asesores || [];
  const totalPrimaEquipo = asesores.reduce((s, a) => s + a.actual.prima, 0);
  const filas = asesores
    .map((a) => {
      const sinMeta = sinMetas(a.meta);
      const pcts = METRICAS.filter((m) => a.meta?.[m.campo]).map((m) => pctAvance(a.actual[m.key], a.meta[m.campo]));
      const st = sinMeta ? ESTADOS_RITMO.SIN_META : infoRitmo(Math.min(...pcts), fraccion);
      const pctP = a.meta?.metaPrimaMonto ? pctAvance(a.actual.prima, a.meta.metaPrimaMonto) : null;
      return { ...a, sinMeta, pctP, st };
    })
    .sort((a, b) => {
      if (a.sinMeta !== b.sinMeta) return a.sinMeta ? 1 : -1;
      return (b.pctP ?? -1) - (a.pctP ?? -1) || b.actual.prima - a.actual.prima;
    });

  const metaEquipo = equipo?.meta;
  const mio = admin ? null : asesores[0];
  const miSinMeta = sinMetas(mio?.meta);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{admin ? 'Metas / Targets' : 'Mi meta'}</h2>
        <div className="flex gap-2">
          <select className="input w-auto" value={mes} onChange={(e) => { setMes(+e.target.value); setEditRow(null); setEditTeam(null); }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{nombreMes(i + 1)}</option>)}
          </select>
          <input type="number" className="input w-24" value={anio} onChange={(e) => { setAnio(+e.target.value); setEditRow(null); setEditTeam(null); }} />
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Nivel 1 — meta de promotoría (solo promotores) */}
      {admin && (
        <Card
          title={`Meta de la promotoría · ${periodo}`}
          subtitle="Objetivo agregado de todo el equipo"
          actions={(
            <div className="flex items-center gap-3">
              <ChipTranscurrido mes={mes} anio={anio} />
              {!editTeam && (
                <button className="btn-secondary" onClick={() => setEditTeam({ valores: valoresDe(metaEquipo) })}>
                  {metaEquipo ? 'Editar meta' : 'Asignar meta'}
                </button>
              )}
            </div>
          )}
        >
          {editTeam && (
            <form onSubmit={guardarEquipo} className="mb-5 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">
              <CamposMeta valores={editTeam.valores} onChange={(valores) => setEditTeam({ valores })} />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                <button type="button" className="btn-secondary" onClick={() => setEditTeam(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {metaEquipo || editTeam ? (
            <>
              <BloquesMeta meta={metaEquipo} actual={equipo?.actual} fraccion={fraccion} />
              <Reconciliacion equipo={equipo} />
            </>
          ) : (
            <EmptyState message={`Sin meta de promotoría para ${periodo}. Asígnala para leer el avance del equipo contra un objetivo.`} />
          )}
        </Card>
      )}

      {/* Nivel 2 — metas individuales */}
      {admin ? (
        <Card title={`Metas por asesor · ${periodo}`} subtitle="Avance individual contra la meta asignada, en las 6 métricas">
          {filas.length === 0 ? <EmptyState message="Sin asesores activos" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="py-2 pr-3 w-10">#</th>
                    <th className="py-2 pr-4">Asesor</th>
                    {METRICAS.map((m) => <th key={m.key} className="py-2 pr-4">{m.corto}</th>)}
                    <th className="py-2 pr-4">Meta ingreso (PRP)</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const editando = editRow?.asesorId === f.id;
                    return (
                      <tr key={f.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/60 dark:hover:bg-slate-700/30 align-top">
                        <td className="py-3 pr-3">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-500 dark:text-slate-300">{i + 1}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-700 dark:text-slate-200">{f.nombre}</div>
                          {totalPrimaEquipo > 0 && (
                            <div className="text-xs text-slate-400 dark:text-slate-500">{Math.round((f.actual.prima / totalPrimaEquipo) * 100)}% de la prima del equipo</div>
                          )}
                        </td>
                        {editando ? (
                          <>
                            {METRICAS.map((m, j) => (
                              <td key={m.key} className="py-3 pr-4">
                                <input
                                  type="number" min="0" className="input w-24" placeholder={m.placeholder}
                                  value={editRow.valores[m.key]} autoFocus={j === 0}
                                  onChange={(e) => setEditRow({ ...editRow, valores: { ...editRow.valores, [m.key]: e.target.value } })}
                                />
                              </td>
                            ))}
                            <td className="py-3 pr-4">
                              <input
                                type="number" min="0" className="input w-32" placeholder="Ingreso MXN"
                                value={editRow.ingreso}
                                onChange={(e) => setEditRow({ ...editRow, ingreso: e.target.value })}
                              />
                            </td>
                            <td className="py-3 pr-4" colSpan={2}>
                              <div className="flex justify-end gap-2">
                                <button className="btn-primary" onClick={guardarFila} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                                <button className="btn-secondary" onClick={() => setEditRow(null)}>Cancelar</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            {METRICAS.map((m) => (
                              <td key={m.key} className="py-3 pr-4">
                                {f.meta?.[m.campo]
                                  ? <MiniBar actual={f.actual[m.key]} meta={f.meta[m.campo]} fraccion={fraccion} money={m.money} compact />
                                  : <span className="text-xs italic text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">{(m.money ? mxn : num)(f.actual[m.key])} / —</span>}
                              </td>
                            ))}
                            <td className="py-3 pr-4"><MetaIngresoNota fila={f} /></td>
                            <td className="py-3 pr-4"><span className={`badge ${f.st.pill}`}>{f.st.label}</span></td>
                            <td className="py-3 text-right">
                              <button
                                className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
                                onClick={() => { setEditRow({ asesorId: f.id, valores: valoresDe(f.meta), ingreso: f.meta?.metaIngresoMonto ?? '' }); setErr(''); }}
                              >
                                {f.sinMeta ? 'Asignar meta' : 'Editar meta'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* Vista asesor: solo su meta y su avance. La API ya fuerza el alcance. */
        <Card
          title={`Mi meta · ${periodo}`}
          subtitle="Tu avance contra la meta asignada por tu promotor"
          actions={<ChipTranscurrido mes={mes} anio={anio} />}
        >
          {miSinMeta && (
            <p className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Aún no tienes meta asignada para {periodo}. Pídesela a tu promotor; mientras tanto, aquí va tu avance real.
            </p>
          )}
          <BloquesMeta meta={mio?.meta} actual={mio?.actual} fraccion={fraccion} />
          {mio?.meta?.metaIngresoMonto ? (
            <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3 text-sm">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Meta de ingreso (PRP)</div>
              <MetaIngresoNota fila={mio} />
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
