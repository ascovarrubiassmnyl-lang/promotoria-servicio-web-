import { useState } from 'react';
import { api, handleError } from '../../api/client.js';
import { Modal } from '../ui.jsx';

// Visor + descarga de un DocumentoCliente (clic = previsualizar, descargar es
// secundario — mismo patrón ya usado en la ficha de cliente). La API va con
// token en el header, así que no se puede apuntar un <iframe> a la URL
// directo: se trae el blob y se crea un object URL local, revocado al cerrar.
// Extraído de ClienteDetalle.jsx para reusarlo también desde el detalle de
// una póliza (documento de póliza subido en "Nueva póliza" → "Subir documento").
export function useVisorDocumento() {
  const [visor, setVisor] = useState({ doc: null, url: '', cargando: false, error: '' });

  const verArchivo = async (doc) => {
    setVisor({ doc, url: '', cargando: true, error: '' });
    try {
      const r = await api.get(`/documentos/${doc.id}/ver`, { responseType: 'blob' });
      const blob = doc.mime ? new Blob([r.data], { type: doc.mime }) : r.data;
      setVisor({ doc, url: URL.createObjectURL(blob), cargando: false, error: '' });
    } catch (e) {
      setVisor({ doc, url: '', cargando: false, error: handleError(e) });
    }
  };

  const cerrarVisor = () => {
    setVisor((v) => {
      if (v.url) URL.revokeObjectURL(v.url);
      return { doc: null, url: '', cargando: false, error: '' };
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
    } catch (e) { alert(handleError(e)); }
  };

  return { visor, verArchivo, cerrarVisor, descargarArchivo };
}

export default function VisorDocumento({ visor, onClose, onDescargar }) {
  return (
    <Modal open={Boolean(visor.doc)} onClose={onClose} title={visor.doc?.nombre || 'Archivo'} wide>
      <div className="space-y-3">
        {visor.cargando && <p className="text-sm text-slate-500 dark:text-slate-400 py-10 text-center">Cargando archivo…</p>}
        {visor.error && <p className="text-sm text-red-600 py-6 text-center">{visor.error}</p>}
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
          <button type="button" onClick={() => onDescargar(visor.doc)} className="btn-secondary" disabled={!visor.doc}>Descargar</button>
          <button type="button" onClick={onClose} className="btn-primary">Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
