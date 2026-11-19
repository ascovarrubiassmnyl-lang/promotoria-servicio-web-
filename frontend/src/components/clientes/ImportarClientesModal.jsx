import { useEffect, useRef, useState } from 'react';
import { api, handleError, TIMEOUT_SUBIDA } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import { avisar } from '../../lib/toast.js';
import { descargarDeApi } from '../../lib/descargar.js';
import { infoEtapa } from './etapas.js';

// Importar contactos desde Excel (2026-11-19). Dos pasos, siempre: al elegir
// el archivo el servidor SIMULA y devuelve qué entraría; nada se guarda hasta
// oprimir "Importar". Las reglas (columnas, duplicados, validación) viven en
// el servidor — backend/src/utils/hojaClientes.js — aquí solo se pinta.
//
//  - destinoFijo: id del asesor cuando la vista ya está acotada a una cartera.
//  - opcionesDestino: [{id, label}] para quien tiene alcance de administración
//    (null para un asesor: importa siempre a su propia cartera).
export default function ImportarClientesModal({ open, onClose, destinoFijo = null, opcionesDestino = null, destinoInicial = '', onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [destino, setDestino] = useState('');
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);
  const pedirDestino = !destinoFijo && !!opcionesDestino;
  const destinoId = destinoFijo || destino;

  useEffect(() => {
    if (!open) return;
    setArchivo(null); setResumen(null); setError(null); setOcupado(false);
    setDestino(destinoInicial || (opcionesDestino?.length === 1 ? opcionesDestino[0].id : ''));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (file, confirmar) => {
    const fd = new FormData();
    fd.append('archivo', file);
    if (destinoId) fd.append('asesorId', destinoId);
    if (confirmar) fd.append('confirmar', '1');
    return (await api.post('/clientes/importar', fd, { timeout: TIMEOUT_SUBIDA })).data;
  };

  // Revisa el archivo en cuanto hay archivo y destino (y de nuevo si cambia el
  // destino: los duplicados dependen de la cartera a la que entra).
  useEffect(() => {
    if (!open || !archivo || (pedirDestino && !destino)) return undefined;
    let vigente = true;
    setOcupado(true); setError(null); setResumen(null);
    enviar(archivo, false)
      .then((r) => { if (vigente) setResumen(r); })
      .catch((e) => { if (vigente) setError(handleError(e)); })
      .finally(() => { if (vigente) setOcupado(false); });
    return () => { vigente = false; };
  }, [archivo, destino, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async () => {
    setOcupado(true); setError(null);
    try {
      const r = await enviar(archivo, true);
      avisar(`${r.creados} contacto${r.creados === 1 ? '' : 's'} importado${r.creados === 1 ? '' : 's'}`);
      onImportado?.(r);
      onClose();
    } catch (e) {
      setError(handleError(e));
      setOcupado(false);
    }
  };

  const plantilla = () => descargarDeApi('/clientes/plantilla-importacion', 'plantilla-clientes.xlsx')
    .catch(() => avisar('No se pudo descargar la plantilla', 'error'));

  return (
    <Modal open={open} onClose={onClose} title="Importar contactos desde Excel">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Sube un archivo de Excel (.xlsx) con un contacto por fila. Solo el nombre es obligatorio.{' '}
          <button type="button" onClick={plantilla} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Descargar plantilla
          </button>
        </p>

        {pedirDestino && (
          <Field label="¿A la cartera de quién?">
            <select className="input" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">— Elige un asesor —</option>
              {opcionesDestino.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}

        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { setArchivo(e.target.files?.[0] || null); e.target.value = ''; }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary" disabled={ocupado}>
            {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
          </button>
          {archivo && <span className="ml-3 text-sm text-slate-600 dark:text-slate-300 break-all">{archivo.name}</span>}
        </div>

        {archivo && pedirDestino && !destino && (
          <p className="text-sm text-amber-700 dark:text-amber-400">Elige a qué cartera entran para revisar el archivo.</p>
        )}
        {ocupado && !resumen && <p className="text-sm text-slate-500 dark:text-slate-400">Revisando el archivo…</p>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {resumen && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Cifra valor={resumen.nuevos} label="Se van a agregar" tono="text-emerald-600 dark:text-emerald-400" />
              <Cifra valor={resumen.duplicados} label="Ya estaban (se omiten)" tono="text-slate-600 dark:text-slate-300" />
              <Cifra valor={resumen.totalErrores} label="Con error (se omiten)" tono={resumen.totalErrores ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'} />
            </div>

            {resumen.muestra.length > 0 && (
              <div className="text-sm">
                <p className="label">Primeros contactos</p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {resumen.muestra.map((m, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5 text-slate-700 dark:text-slate-200">
                      <span className="truncate">{m.nombre}</span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{m.telefono || 'sin teléfono'} · {infoEtapa(m.etapa).label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {resumen.errores.length > 0 && (
              <div className="text-sm">
                <p className="label">Filas con error</p>
                <ul className="max-h-32 overflow-auto space-y-1 text-red-700 dark:text-red-400">
                  {resumen.errores.map((e) => (
                    <li key={e.fila}>Fila {e.fila}{e.nombre ? ` (${e.nombre})` : ''}: {e.motivo}</li>
                  ))}
                  {resumen.totalErrores > resumen.errores.length && <li>…y {resumen.totalErrores - resumen.errores.length} más</li>}
                </ul>
              </div>
            )}

            {resumen.nuevos === 0 && (
              <p className="text-sm text-slate-600 dark:text-slate-300">No hay contactos nuevos que agregar en este archivo.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={ocupado || !resumen || resumen.nuevos === 0} className="btn-primary">
            {ocupado && resumen ? 'Importando…' : resumen?.nuevos ? `Importar ${resumen.nuevos} contacto${resumen.nuevos === 1 ? '' : 's'}` : 'Importar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Cifra({ valor, label, tono }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tono}`}>{valor}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
