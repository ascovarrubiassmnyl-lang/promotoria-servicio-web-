import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, handleError, TIMEOUT_SUBIDA } from '../../api/client.js';
import { Modal } from '../ui.jsx';
import { avisar } from '../../lib/toast.js';

// Visor + descarga de un DocumentoCliente (clic = previsualizar, descargar es
// secundario — mismo patrón ya usado en la ficha de cliente). La API va con
// token en el header, así que no se puede apuntar un <iframe> a la URL
// directo: se trae el blob y se crea un object URL local, revocado al cerrar.
// Extraído de ClienteDetalle.jsx para reusarlo también desde el detalle de
// una póliza (documento de póliza subido en "Nueva póliza" → "Subir documento").
// Con responseType 'blob' el cuerpo de un error también llega como Blob, así
// que `handleError` no encontraba el mensaje del servidor y mostraba el texto
// crudo de axios ("Request failed with status code 410").
async function errorDeBlob(e) {
  const data = e?.response?.data;
  if (data instanceof Blob) {
    try {
      const json = JSON.parse(await data.text());
      return { error: json.error || handleError(e), perdido: Boolean(json.perdido) };
    } catch { /* cuerpo no JSON: cae al mensaje genérico */ }
  }
  return { error: handleError(e), perdido: e?.response?.status === 410 };
}

export function useVisorDocumento() {
  const [visor, setVisor] = useState({ doc: null, url: '', cargando: false, error: '', perdido: false });

  const verArchivo = async (doc) => {
    setVisor({ doc, url: '', cargando: true, error: '', perdido: false });
    try {
      const r = await api.get(`/documentos/${doc.id}/ver`, { responseType: 'blob' });
      const blob = doc.mime ? new Blob([r.data], { type: doc.mime }) : r.data;
      setVisor({ doc, url: URL.createObjectURL(blob), cargando: false, error: '', perdido: false });
    } catch (e) {
      setVisor({ doc, url: '', cargando: false, ...(await errorDeBlob(e)) });
    }
  };

  // Re-sube el archivo de un documento perdido en su mismo lugar y lo abre.
  const reemplazarArchivo = async (doc, file) => {
    if (!file) return;
    setVisor((v) => ({ ...v, cargando: true, error: '' }));
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      await api.post(`/documentos/${doc.id}/reemplazar`, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: TIMEOUT_SUBIDA });
      avisar('Archivo recuperado', 'ok');
      await verArchivo(doc);
    } catch (e) {
      setVisor((v) => ({ ...v, cargando: false, error: handleError(e) }));
    }
  };

  const cerrarVisor = () => {
    setVisor((v) => {
      if (v.url) URL.revokeObjectURL(v.url);
      return { doc: null, url: '', cargando: false, error: '', perdido: false };
    });
  };

  const descargarArchivo = async (doc) => {
    try {
      const r = await api.get(`/documentos/${doc.id}/descargar`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { avisar((await errorDeBlob(e)).error, 'error'); }
  };

  return { visor, verArchivo, cerrarVisor, descargarArchivo, reemplazarArchivo };
}

export default function VisorDocumento({ visor, onClose, onDescargar, onReemplazar }) {
  return (
    <Modal open={Boolean(visor.doc)} onClose={onClose} title={visor.doc?.nombre || 'Archivo'} wide>
      <div className="space-y-3">
        {visor.cargando && <p className="text-sm text-slate-500 dark:text-slate-400 py-10 text-center">Cargando archivo…</p>}
        {visor.error && !visor.perdido && <p className="text-sm text-red-600 py-6 text-center">{visor.error}</p>}
        {visor.perdido && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-6 text-center space-y-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Este archivo se borró del servidor en una actualización del sistema. Los datos siguen guardados: solo hay que volver a subir el PDF.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {onReemplazar && (
                <label className="btn-primary cursor-pointer">
                  Subir este archivo de nuevo
                  <input type="file" className="hidden" onChange={(e) => onReemplazar(visor.doc, e.target.files?.[0])} />
                </label>
              )}
              <Link to="/recuperar-archivos" onClick={onClose} className="btn-secondary">Recuperar varios a la vez</Link>
            </div>
          </div>
        )}
        {visor.url && visor.doc?.mime?.startsWith('image/') && (
          <img src={visor.url} alt={visor.doc.nombre} className="max-h-[70vh] w-full object-contain rounded-lg bg-slate-50 dark:bg-slate-900" />
        )}
        {visor.url && visor.doc?.mime === 'application/pdf' && (
          <iframe src={visor.url} title={visor.doc.nombre} className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700" />
        )}
        {visor.url && !visor.doc?.mime?.startsWith('image/') && visor.doc?.mime !== 'application/pdf' && (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Este tipo de archivo no se puede previsualizar en el navegador. Descárgalo para abrirlo.
          </div>
        )}
        <div className="flex justify-between gap-2 pt-1">
          <button type="button" onClick={() => onDescargar(visor.doc)} className="btn-secondary" disabled={!visor.doc || visor.perdido}>Descargar</button>
          <button type="button" onClick={onClose} className="btn-primary">Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
