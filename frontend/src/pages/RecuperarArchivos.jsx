import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError, TIMEOUT_SUBIDA } from '../api/client.js';
import { Card, EmptyState } from '../components/ui.jsx';
import { fechaCorta } from '../lib/format.js';
import { avisar } from '../lib/toast.js';

// Recuperar archivos perdidos (2026-10-15). Los documentos subidos antes de
// tener bucket se borraron en un deploy, pero su registro (con el nombre
// original del archivo) sigue en la base. Aquí se eligen los PDF de la
// computadora —todos de golpe— y el servidor los re-vincula solos por nombre
// exacto, en el mismo cliente y la misma póliza donde estaban.
const LOTE = 10;

function tamano(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function RecuperarArchivos() {
  const qc = useQueryClient();
  const input = useRef(null);
  const [progreso, setProgreso] = useState(null); // {hechos, total}
  const [resultado, setResultado] = useState(null); // {recuperados, sinCoincidencia}

  const { data, isLoading, error } = useQuery({
    queryKey: ['documentos-perdidos'],
    queryFn: () => api.get('/documentos/perdidos').then((r) => r.data),
  });

  const subir = async (files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    const acumulado = { recuperados: [], sinCoincidencia: [] };
    setResultado(null);
    setProgreso({ hechos: 0, total: lista.length });
    try {
      for (let i = 0; i < lista.length; i += LOTE) {
        const fd = new FormData();
        lista.slice(i, i + LOTE).forEach((f) => fd.append('archivos', f));
        const r = await api.post('/documentos/recuperar', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: TIMEOUT_SUBIDA });
        acumulado.recuperados.push(...r.data.recuperados);
        acumulado.sinCoincidencia.push(...r.data.sinCoincidencia);
        setProgreso({ hechos: Math.min(i + LOTE, lista.length), total: lista.length });
      }
      avisar(`${acumulado.recuperados.length} archivo(s) recuperado(s)`, 'ok');
    } catch (e) {
      avisar(handleError(e), 'error');
    } finally {
      setResultado(acumulado);
      setProgreso(null);
      if (input.current) input.current.value = '';
      qc.invalidateQueries({ queryKey: ['documentos-perdidos'] });
    }
  };

  const perdidos = data?.perdidos || [];

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Recuperar archivos perdidos</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
          Algunos documentos se borraron del servidor en una actualización del sistema. Sus datos siguen
          capturados: solo falta el PDF. Elige <strong>todos los archivos a la vez</strong> desde tu computadora
          y el sistema los vuelve a poner solos en el cliente y la póliza donde estaban, por el nombre del archivo.
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="kpi"><div className="kpi-label">Documentos registrados</div><div className="kpi-val tabular-nums">{data.total}</div></div>
          <div className={`kpi ${perdidos.length ? 'kpi-amber' : 'kpi-green'}`}>
            <div className="kpi-label">Por recuperar</div><div className="kpi-val tabular-nums">{perdidos.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Espacio usado</div><div className="kpi-val tabular-nums">{tamano(data.bytesGuardados)}</div>
            <div className="kpi-note">{data.almacenamiento === 'bucket' ? 'Almacenamiento permanente' : 'Disco local del servidor'}</div>
          </div>
        </div>
      )}

      {perdidos.length > 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Puedes seleccionar la carpeta completa: los archivos que no correspondan se ignoran.
            </p>
            <label className={`btn-primary cursor-pointer whitespace-nowrap ${progreso ? 'opacity-60 pointer-events-none' : ''}`}>
              {progreso ? `Subiendo ${progreso.hechos} de ${progreso.total}…` : 'Elegir archivos'}
              <input ref={input} type="file" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
            </label>
          </div>
        </Card>
      )}

      {resultado && (
        <Card title="Resultado">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{resultado.recuperados.length} recuperado(s).</p>
          {resultado.sinCoincidencia.length > 0 && (
            <details className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer">{resultado.sinCoincidencia.length} archivo(s) no coincidieron con ningún documento perdido</summary>
              <ul className="mt-2 list-disc pl-5 space-y-0.5">{resultado.sinCoincidencia.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </details>
          )}
        </Card>
      )}

      <Card title="Pendientes" subtitle={perdidos.length ? 'Si un archivo cambió de nombre, ábrelo desde la ficha del cliente y súbelo ahí.' : undefined}>
        {isLoading && <p className="text-sm text-slate-500 py-6 text-center">Revisando archivos…</p>}
        {error && <p className="text-sm text-red-600 py-6 text-center">{handleError(error)}</p>}
        {data && !perdidos.length && <EmptyState message="No hay archivos perdidos. Todos los documentos están guardados." />}
        {perdidos.length > 0 && (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 dark:text-slate-400 text-left">
                <tr><th className="px-4 py-2">Archivo</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Subido</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {perdidos.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-2 text-slate-800 dark:text-slate-100 break-all">{d.nombre}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link to={`/clientes/${d.cliente.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                        {d.cliente.nombre} {d.cliente.apellidoP}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fechaCorta(d.creadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
