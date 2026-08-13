import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, EmptyState } from '../components/ui.jsx';
import { rangoSemana, labelSemana, isoDia, diasDeSemana, DIAS_LABEL } from '../lib/semana.js';
import ResumenHistorico from '../components/puntos/ResumenHistorico.jsx';

// Sistema de 25 puntos: digitaliza el formato semanal de la promotoría.
// El puntaje por concepto y la meta diaria vienen del servidor (GET
// /puntos/semana → valores/metaDiaria): aquí no se re-declaran valores.
// Columnas del formato físico, agrupadas igual que en la hoja.
// Columnas visibles del formato. Las columnas referidosContactados,
// citasPlaneadas, citasNuevas, cierresPlaneados y comision se retiraron por
// petición de la promotora (2026-08) — los campos se conservan en la BD para
// no perder datos históricos, pero ya no se capturan ni muestran.
const GRUPOS = [
  {
    titulo: 'Prospección',
    campos: [
      ['referidosObtenidos', 'Ref. obtenidos'],
      ['llamadasRealizadas', 'Llamadas'],
      ['citasObtenidas', 'Citas obtenidas'],
    ],
  },
  {
    titulo: 'Alta productividad',
    campos: [
      ['cuestionariosPlaneados', 'Cuest. plan.'],
      ['cuestionariosRealizados', 'Cuest. real.'],
      ['cierresRealizados', 'Cierres real.'],
    ],
  },
  {
    titulo: 'Resultados',
    campos: [
      ['solicitudes', 'Solicitudes'],
    ],
  },
];
const CAMPOS = GRUPOS.flatMap((g) => g.campos.map(([campo]) => campo));

const LISTAS_PLAN = [
  ['mejoresProspectos', '5 mejores prospectos'],
  ['oportunidadesVenta', 'Oportunidades de venta'],
  ['desarrolloPersonal', 'Desarrollo personal'],
  ['oportunidadesServicio', 'Oportunidades de servicio al cliente'],
];

const filaVacia = () => Object.fromEntries(CAMPOS.map((c) => [c, '']));

export default function Puntos() {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [modo, setModo] = useState('semana'); // 'semana' | 'historico'
  const [offset, setOffset] = useState(0);
  const [fAsesor, setFAsesor] = useState('');
  const semana = useMemo(() => rangoSemana(offset), [offset]);
  const inicioIso = isoDia(semana.inicio);
  const dias = useMemo(() => diasDeSemana(semana.inicio), [semana.inicio]);

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });
  // El promotor captura/consulta por asesor; sin selección ve su propio formato.
  const asesorId = esAdmin() ? fAsesor : '';

  const { data, isLoading } = useQuery({
    queryKey: ['puntos-semana', inicioIso, asesorId || 'yo'],
    queryFn: async () => (await api.get('/puntos/semana', { params: { inicio: inicioIso, asesorId: asesorId || undefined } })).data,
  });

  const { data: resumen } = useQuery({
    queryKey: ['puntos-resumen', inicioIso],
    queryFn: async () => (await api.get('/puntos/resumen', { params: { inicio: inicioIso } })).data,
    enabled: esAdmin(),
  });

  // Estado editable: una fila por día + listas de planeación. Se re-siembra al
  // cambiar de semana/asesor o al llegar datos del servidor.
  const [filas, setFilas] = useState({});
  const [plan, setPlan] = useState({});
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!data) return;
    const base = {};
    for (const d of dias) base[isoDia(d)] = filaVacia();
    for (const r of data.registros || []) {
      const clave = String(r.fecha).slice(0, 10);
      if (base[clave]) base[clave] = Object.fromEntries(CAMPOS.map((c) => [c, r[c] === 0 ? '' : String(r[c] ?? '')]));
    }
    setFilas(base);
    setPlan(Object.fromEntries(LISTAS_PLAN.map(([campo]) => {
      const lista = Array.isArray(data.plan?.[campo]) ? data.plan[campo] : [];
      return [campo, Array.from({ length: 5 }, (_, i) => lista[i] || '')];
    })));
    setErr('');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const valores = data?.valores || {};
  const metaDiaria = data?.metaDiaria || 25;

  const puntosDeFila = (fila) =>
    Object.entries(valores).reduce((acc, [campo, valor]) => acc + (Number(fila?.[campo]) || 0) * valor, 0);

  const totales = useMemo(() => {
    const t = filaVacia();
    for (const campo of CAMPOS) t[campo] = dias.reduce((acc, d) => acc + (Number(filas[isoDia(d)]?.[campo]) || 0), 0);
    return t;
  }, [filas, dias]);
  const puntosSemana = useMemo(() => dias.reduce((acc, d) => acc + puntosDeFila(filas[isoDia(d)]), 0), [filas, dias, valores]); // eslint-disable-line react-hooks/exhaustive-deps
  const diasConRegistro = dias.filter((d) => CAMPOS.some((c) => Number(filas[isoDia(d)]?.[c]) > 0)).length;
  const mejorDia = useMemo(() => {
    let mejor = null;
    dias.forEach((d, i) => {
      const p = puntosDeFila(filas[isoDia(d)]);
      if (p > 0 && (!mejor || p > mejor.p)) mejor = { p, label: DIAS_LABEL[i] };
    });
    return mejor;
  }, [filas, dias, valores]); // eslint-disable-line react-hooks/exhaustive-deps

  // Candado anti-falsificación: solo se edita el propio formato (nunca el de
  // otro asesor, aunque el promotor lo esté consultando) y solo mientras el
  // día siga siendo "hoy" según el servidor — en cuanto cierra, ni el
  // asesor ni el promotor pueden tocarlo (backend/src/routes/puntos.js).
  const soloLectura = !!data?.soloLectura;
  const hoy = data?.hoy || isoDia(new Date());

  // Guardado por día al salir del campo (upsert idempotente en el servidor).
  const guardarDia = async (clave) => {
    if (soloLectura || clave < hoy) return;
    const fila = filas[clave];
    if (!fila) return;
    try {
      setErr('');
      const payload = { fecha: clave };
      for (const campo of CAMPOS) payload[campo] = Number(fila[campo]) || 0;
      await api.put('/puntos/dia', payload);
      qc.invalidateQueries(['puntos-resumen']);
    } catch (e) { setErr(handleError(e)); }
  };

  const guardarPlan = async () => {
    if (soloLectura) return;
    try {
      setErr('');
      const payload = { semanaInicio: inicioIso };
      for (const [campo] of LISTAS_PLAN) payload[campo] = (plan[campo] || []).map((s) => s.trim());
      await api.put('/puntos/plan', payload);
    } catch (e) { setErr(handleError(e)); }
  };

  const setCelda = (clave, campo, v) => setFilas((f) => ({ ...f, [clave]: { ...f[clave], [campo]: v } }));

  const promedio = diasConRegistro ? Math.round(puntosSemana / diasConRegistro) : 0;
  const nombreScope = asesorId
    ? (() => { const a = asesores?.find((x) => x.id === asesorId); return a ? `${a.nombre} ${a.apellidoP}` : ''; })()
    : `${user?.nombre || ''}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Sistema de 25 puntos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Formato semanal de actividad comercial · {nombreScope}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin() && (
            <select className="input w-auto" value={fAsesor} onChange={(e) => setFAsesor(e.target.value)}>
              <option value="">Mi formato</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          )}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setModo('semana')}
              className={`px-3 py-1.5 text-xs font-semibold ${modo === 'semana' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              Esta semana
            </button>
            <button
              onClick={() => setModo('historico')}
              className={`px-3 py-1.5 text-xs font-semibold ${modo === 'historico' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              Histórico
            </button>
          </div>
        </div>
      </div>

      {modo === 'historico' ? (
        <ResumenHistorico
          asesorId={asesorId || undefined}
          metaDiaria={metaDiaria}
          onSeleccionaSemana={(o) => { setOffset(o); setModo('semana'); }}
        />
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setOffset((o) => o - 1)} className="btn-secondary px-3">← Semana anterior</button>
          <button onClick={() => setOffset(0)} className={`btn-secondary px-3 ${offset === 0 ? '!bg-slate-100 dark:!bg-slate-700' : ''}`}>Esta semana</button>
          <button onClick={() => setOffset((o) => o + 1)} className="btn-secondary px-3">Semana siguiente →</button>
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{labelSemana(semana)}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`kpi ${puntosSemana >= metaDiaria * 5 ? 'kpi-green' : 'kpi-accent'}`}>
          <p className="kpi-label">Puntos de la semana</p>
          <p className="kpi-val">{puntosSemana}</p>
          <p className="kpi-note">Referencia: {metaDiaria} diarios</p>
        </div>
        <div className={`kpi ${promedio >= metaDiaria ? 'kpi-green' : 'kpi-amber'}`}>
          <p className="kpi-label">Promedio por día activo</p>
          <p className="kpi-val">{promedio}</p>
          <p className="kpi-note">Meta: {metaDiaria} puntos al día</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Días con actividad</p>
          <p className="kpi-val">{diasConRegistro} / 7</p>
          <p className="kpi-note">{mejorDia ? `Mejor día: ${mejorDia.label} (${mejorDia.p} pts)` : 'Sin registros aún'}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Solicitudes acumuladas</p>
          <p className="kpi-val">{totales.solicitudes}</p>
          <p className="kpi-note">Total de la semana</p>
        </div>
      </div>

      {soloLectura && (
        <p className="scope-banner">
          Modo consulta: estás viendo el formato de {nombreScope}. Solo la propia persona puede capturarlo.
        </p>
      )}

      <Card
        title="Registro diario"
        subtitle="Captura al terminar el día; el puntaje se calcula solo. Se guarda al salir de cada celda. Al día siguiente el registro se cierra y ya no se puede modificar."
      >
        {isLoading ? (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                  <th className="py-1 pr-2 text-left align-bottom" rowSpan={2}>Día</th>
                  {GRUPOS.map((g) => (
                    <th key={g.titulo} colSpan={g.campos.length} className="px-1 pb-0.5 text-center border-b border-slate-100 dark:border-slate-700">{g.titulo}</th>
                  ))}
                  <th className="py-1 pl-2 text-right align-bottom" rowSpan={2}>Puntos</th>
                </tr>
                <tr className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                  {GRUPOS.flatMap((g) => g.campos).map(([campo, label]) => (
                    <th key={campo} className="px-1 py-1 text-center font-medium whitespace-nowrap">
                      {label}
                      {valores[campo] ? <span className="block text-[9px] normal-case text-slate-300 dark:text-slate-600">{valores[campo]} pt{valores[campo] > 1 ? 's' : ''}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dias.map((d, i) => {
                  const clave = isoDia(d);
                  const fila = filas[clave] || filaVacia();
                  const puntos = puntosDeFila(fila);
                  const esHoy = hoy === clave;
                  const cerrado = clave < hoy; // candado: día ya pasado, ni el asesor ni el promotor pueden tocarlo
                  const bloqueado = soloLectura || cerrado;
                  return (
                    <tr key={clave} className={`border-t border-slate-50 dark:border-slate-700/60 ${esHoy ? 'bg-brand-50/40 dark:bg-brand-900/10' : ''} ${cerrado ? 'opacity-60' : ''}`}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${esHoy ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}`}>{DIAS_LABEL[i]}</span>
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                          {d.getDate()}{cerrado && <span title="Día cerrado: ya no se puede modificar"> 🔒</span>}
                        </span>
                      </td>
                      {CAMPOS.map((campo) => (
                        <td key={campo} className="px-0.5 py-1">
                          <input
                            type="number"
                            min="0"
                            step={campo === 'comision' ? '0.01' : '1'}
                            className="input !px-1 !py-1 w-14 text-center tabular-nums text-xs disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-800/60"
                            value={fila[campo]}
                            disabled={bloqueado}
                            onChange={(e) => setCelda(clave, campo, e.target.value)}
                            onBlur={() => guardarDia(clave)}
                            aria-label={`${campo} del ${DIAS_LABEL[i]}`}
                          />
                        </td>
                      ))}
                      <td className={`py-1.5 pl-2 text-right font-bold tabular-nums ${puntos >= metaDiaria ? 'text-emerald-600 dark:text-emerald-400' : puntos > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'}`}>
                        {puntos}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <td className="py-2 pr-2">Total</td>
                  {CAMPOS.map((campo) => (
                    <td key={campo} className="px-1 py-2 text-center tabular-nums">
                      {totales[campo]}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right tabular-nums text-brand-700 dark:text-brand-300">{puntosSemana}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
          Puntúan: {Object.entries(valores).map(([campo, v]) => {
            const label = GRUPOS.flatMap((g) => g.campos).find(([c]) => c === campo)?.[1] || campo;
            return `${label} = ${v}`;
          }).join(' · ')} · Meta: {metaDiaria} puntos diarios.
        </p>
      </Card>

      <Card title="Planeación de la semana" subtitle="Las cuatro listas del formato. Se guardan al salir del campo.">
        <div className="grid md:grid-cols-2 gap-4">
          {LISTAS_PLAN.map(([campo, titulo]) => (
            <div key={campo}>
              <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 mb-1.5">{titulo}</p>
              <div className="space-y-1.5">
                {(plan[campo] || []).map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 text-xs text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}.</span>
                    <input
                      className="input !py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-800/60"
                      value={v}
                      disabled={soloLectura}
                      onChange={(e) => setPlan((p) => ({ ...p, [campo]: p[campo].map((x, j) => (j === i ? e.target.value : x)) }))}
                      onBlur={guardarPlan}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {esAdmin() && (
        <Card title="Equipo · puntos de la semana" subtitle="Seguimiento por asesor (misma semana seleccionada).">
          {!resumen?.filas?.length ? (
            <EmptyState message="Sin asesores activos." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-400 dark:text-slate-500 text-left">
                    <th className="py-1.5 pr-2">Asesor</th>
                    <th className="py-1.5 px-2 text-right">Puntos</th>
                    <th className="py-1.5 px-2 text-right">Días activos</th>
                    <th className="py-1.5 px-2 text-right">Llamadas</th>
                    <th className="py-1.5 px-2 text-right">Citas obtenidas</th>
                    <th className="py-1.5 pl-2 text-right">Solicitudes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...resumen.filas].sort((a, b) => b.puntos - a.puntos).map((f) => (
                    <tr
                      key={f.asesor.id}
                      className="border-t border-slate-50 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                      onClick={() => setFAsesor(f.asesor.id)}
                      title="Ver / capturar su formato"
                    >
                      <td className="py-2 pr-2 font-medium text-slate-700 dark:text-slate-200">{f.asesor.nombre} {f.asesor.apellidoP}</td>
                      <td className={`py-2 px-2 text-right font-bold tabular-nums ${f.puntos >= resumen.metaDiaria * 5 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{f.puntos}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{f.dias}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{f.llamadas}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{f.citasObtenidas}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{f.solicitudes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
        </>
      )}
    </div>
  );
}
