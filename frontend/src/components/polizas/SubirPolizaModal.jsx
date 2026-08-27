import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, handleError, TIMEOUT_ANALISIS } from '../../api/client.js';
import { Modal } from '../ui.jsx';

// Sube el PDF de una póliza y lo manda a analizar (POST /ventas/analizar-documento,
// backend/src/services/extraccionPoliza.js). No crea nada todavía: solo deja el
// archivo en /uploads y devuelve los campos leídos, que PolizaFormModal usa para
// prellenar su propio formulario — el asesor siempre revisa antes de guardar.
export default function SubirPolizaModal({ open, onClose, clienteId, onListo }) {
  const [archivo, setArchivo] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [err, setErr] = useState('');

  const { data: disponibilidad } = useQuery({
    queryKey: ['ventas-analisis-disponible'],
    queryFn: async () => (await api.get('/ventas/analisis-disponible')).data,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const cerrar = () => {
    if (analizando) return; // no cerrar a media subida
    setArchivo(null);
    setErr('');
    onClose();
  };

  const analizar = async () => {
    if (!archivo || !clienteId) return;
    setAnalizando(true);
    setErr('');
    try {
      const body = new FormData();
      body.append('archivo', archivo);
      const { data } = await api.post('/ventas/analizar-documento', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: TIMEOUT_ANALISIS,
      });
      onListo(mapearAForm(data));
    } catch (e) {
      setErr(handleError(e));
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <Modal open={open} onClose={cerrar} title="Subir documento de la póliza">
      <div className="space-y-3">
        {disponibilidad && !disponibilidad.disponible && (
          <p className="text-sm rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2">
            El análisis automático no está configurado todavía. Puedes subir el documento y capturar los datos a mano, o cerrar y usar "Capturar los datos manualmente".
          </p>
        )}
        <div>
          <label className="label">Archivo PDF de la póliza</label>
          <input
            type="file"
            accept="application/pdf"
            className="input"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Máximo 35 MB. El documento quedará adjunto a la póliza, con vista previa y descarga.</p>
        </div>
        {analizando && (
          <p className="text-sm rounded-lg bg-slate-50 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 px-3 py-2">
            Leyendo el documento… puede tardar hasta un minuto. No cierres esta ventana.
          </p>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={cerrar} disabled={analizando} className="btn-secondary">Cancelar</button>
          <button
            type="button"
            onClick={analizar}
            disabled={!archivo || analizando || !disponibilidad?.disponible}
            className="btn-primary"
          >
            {analizando ? 'Analizando…' : 'Analizar y continuar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Traduce la respuesta de POST /ventas/analizar-documento al shape de
// PolizaFormModal.form. Campos que la IA no encontró simplemente no se
// incluyen — el formulario conserva lo que ya tenía (VACIO) en esos casos.
function mapearAForm({ datos, modelo, documentoTmp }) {
  const f = {};
  if (datos.producto) f.producto = datos.producto;
  if (datos.ramo) f.ramo = datos.ramo;
  // La moneda leída del documento aplica a TODAS las cifras de la póliza: si
  // la carátula está en dólares, la suma asegurada, el deducible y el recibo
  // también lo están. El asesor puede corregir cada una por separado.
  if (datos.moneda) {
    f.moneda = datos.moneda;
    f.sumaAseguradaMoneda = datos.moneda;
    f.deducibleMoneda = datos.moneda;
    f.montoPagoMoneda = datos.moneda;
  }
  if (datos.primaAnual != null) {
    if (datos.moneda && datos.moneda !== 'MXN') f.primaMoneda = datos.primaAnual;
    else f.primaAnual = datos.primaAnual;
  }
  if (datos.sumaAsegurada != null) f.sumaAsegurada = datos.sumaAsegurada;
  // El número de póliza ya tiene columna propia (Venta.numeroPoliza) desde la
  // ficha técnica: antes se anexaba a las notas por no tener dónde ponerlo.
  if (datos.numeroPoliza) f.numeroPoliza = datos.numeroPoliza;
  if (datos.plazo) f.plazo = datos.plazo;
  if (datos.formaPago) f.formaPago = datos.formaPago;
  if (datos.deducible != null) f.deducible = datos.deducible;
  if (datos.coaseguro) f.coaseguro = datos.coaseguro;
  if (datos.fechaEmision) f.fechaEmision = datos.fechaEmision;
  if (datos.fechaInicioVigencia) f.fechaInicioVigencia = datos.fechaInicioVigencia;
  if (datos.fechaFinVigencia) f.fechaFinVigencia = datos.fechaFinVigencia;
  if (Array.isArray(datos.coberturas) && datos.coberturas.length) {
    f.coberturas = datos.coberturas.map((c) => ({
      nombre: c.nombre || '', detalle: c.detalle || '', monto: c.monto || '',
      costo: '', costoMoneda: datos.moneda || 'MXN',
    }));
  }
  if (Array.isArray(datos.beneficiarios) && datos.beneficiarios.length) {
    f.beneficiarios = datos.beneficiarios.map((b) => ({ nombre: b.nombre || '', porcentaje: b.porcentaje ?? '' }));
  }
  // `asegurado` es el nombre tal cual aparece en la carátula: no se mete solo
  // en la lista de asegurados de la ficha porque la IA no distingue titular de
  // dependientes — se deja en notas para que el asesor lo capture bien.
  const notasExtra = [];
  if (datos.asegurado) notasExtra.push(`Asegurado en el documento: ${datos.asegurado}`);
  if (datos.confianza === 'BAJA') notasExtra.push('⚠ La IA reportó confianza baja al leer este documento — revisa todos los campos con cuidado.');
  if (Array.isArray(datos.advertencias) && datos.advertencias.length) {
    notasExtra.push(`Advertencias del análisis: ${datos.advertencias.join('; ')}`);
  }
  if (notasExtra.length) f.notas = notasExtra.join('\n');

  f.documentoTmp = { ...documentoTmp, modelo };
  return f;
}
