import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, handleError, TIMEOUT_ANALISIS } from '../../api/client.js';
import { Modal } from '../ui.jsx';
import { tamanoLegible } from '../../lib/format.js';

// Máximo de documentos por análisis — espejo de MAX_DOCUMENTOS_ANALISIS en
// backend/src/routes/ventas.js (el servidor es el que manda).
const MAX_DOCUMENTOS = 6;

// Sube los PDF de una póliza y los manda a analizar (POST /ventas/analizar-documento,
// backend/src/services/extraccionPoliza.js). No crea nada todavía: solo deja los
// archivos en /uploads y devuelve los campos leídos, que PolizaFormModal usa para
// prellenar su propio formulario — el asesor siempre revisa antes de guardar.
//
// Se pueden subir VARIOS documentos de la misma póliza (2026-08-31): la carátula
// rara vez trae todo, y la tabla de primas o los anexos suelen venir aparte. Se
// analizan juntos en una sola llamada al modelo y TODOS quedan adjuntos a la
// póliza; el primero es el principal (la carátula).
export default function SubirPolizaModal({ open, onClose, clienteId, onListo }) {
  const [archivos, setArchivos] = useState([]);
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
    setArchivos([]);
    setErr('');
    onClose();
  };

  // Se acumulan entre selecciones (el asesor puede ir agregando de carpetas
  // distintas) y se descartan repetidos por nombre + tamaño.
  const agregar = (e) => {
    const nuevos = Array.from(e.target.files || []);
    e.target.value = '';
    if (!nuevos.length) return;
    setErr('');
    setArchivos((prev) => {
      const clave = (f) => `${f.name}|${f.size}`;
      const vistos = new Set(prev.map(clave));
      const suma = [...prev, ...nuevos.filter((f) => !vistos.has(clave(f)))];
      if (suma.length > MAX_DOCUMENTOS) setErr(`Máximo ${MAX_DOCUMENTOS} documentos por análisis.`);
      return suma.slice(0, MAX_DOCUMENTOS);
    });
  };

  const quitar = (i) => setArchivos((prev) => prev.filter((_, x) => x !== i));

  const analizar = async () => {
    if (!archivos.length || !clienteId) return;
    setAnalizando(true);
    setErr('');
    try {
      const body = new FormData();
      archivos.forEach((f) => body.append('archivos', f));
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
    <Modal open={open} onClose={cerrar} title="Subir documentos de la póliza">
      <div className="space-y-3">
        {disponibilidad && !disponibilidad.disponible && (
          <p className="text-sm rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2">
            El análisis automático no está configurado todavía. Puedes subir el documento y capturar los datos a mano, o cerrar y usar "Capturar los datos manualmente".
          </p>
        )}
        <div>
          <label className="label">Archivos PDF de la póliza</label>
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="input"
            onChange={agregar}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Puedes subir varios: carátula, tabla de primas y anexos se leen juntos. Máximo {MAX_DOCUMENTOS} archivos de 35 MB. Todos quedan adjuntos a la póliza, con vista previa y descarga.
          </p>
        </div>

        {archivos.length > 0 && (
          <ul className="space-y-1.5">
            {archivos.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate text-slate-800 dark:text-slate-100">{f.name}</span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500">
                    {tamanoLegible(f.size)}{i === 0 ? ' · principal (carátula)' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  disabled={analizando}
                  className="text-slate-400 hover:text-red-500 px-1 shrink-0 disabled:opacity-50"
                  aria-label={`quitar ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {analizando && (
          <p className="text-sm rounded-lg bg-slate-50 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 px-3 py-2">
            Leyendo {archivos.length === 1 ? 'el documento' : `los ${archivos.length} documentos`}… puede tardar hasta un minuto. No cierres esta ventana.
          </p>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={cerrar} disabled={analizando} className="btn-secondary">Cancelar</button>
          <button
            type="button"
            onClick={analizar}
            disabled={!archivos.length || analizando || !disponibilidad?.disponible}
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
function mapearAForm({ datos, modelo, documentosTmp }) {
  const f = {};
  if (datos.producto) f.producto = datos.producto;
  // El "plan"/proyecto del cliente es distinto del nombre del producto (Orvi es
  // el producto; "Proyecto Imagina Ser" es el plan contratado) y va al campo
  // Plan de la sección "Detalle del ramo".
  if (datos.plan) f.plan = datos.plan;
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
  // Subir la carátula significa que la compañía YA emitió y cobró la póliza:
  // ese es el momento en que el asesor tiene este documento en la mano. Nace
  // como PAGADA en vez del PENDIENTE_PAGAR del alta manual (editable, por si
  // el caso es otro).
  f.estado = 'PAGADA';

  // Prima anual: en las carátulas de SMNYL casi nunca viene un total impreso —
  // hay que SUMAR la columna "PRIMA INICIAL" de la tabla (la fila de la
  // cobertura básica más la de cada adicional). La suma la hace este código,
  // no el modelo: pedirle aritmética a una IA es justo donde se equivoca. Solo
  // si la tabla no trae esa columna se usa el total que haya leído.
  const primaDeTabla = (datos.coberturas || []).reduce(
    (s, c) => s + (Number(c?.primaInicial) > 0 ? Number(c.primaInicial) : 0),
    0,
  );
  const primaTotal = primaDeTabla > 0 ? +primaDeTabla.toFixed(2) : datos.primaAnual;
  if (primaTotal != null) {
    if (datos.moneda && datos.moneda !== 'MXN') f.primaMoneda = primaTotal;
    else f.primaAnual = primaTotal;
  }
  if (datos.sumaAsegurada != null) f.sumaAsegurada = datos.sumaAsegurada;
  // El número de póliza ya tiene columna propia (Venta.numeroPoliza) desde la
  // ficha técnica: antes se anexaba a las notas por no tener dónde ponerlo.
  if (datos.numeroPoliza) f.numeroPoliza = datos.numeroPoliza;
  if (datos.plazo) f.plazo = datos.plazo;
  // La periodicidad (mensual/trimestral/semestral/anual) es el dato que la
  // carátula normalmente NO imprime: si no vino, se marca para que la ficha lo
  // señale en vez de dejar pasar el default como si fuera leído del documento.
  if (datos.formaPago) f.formaPago = datos.formaPago;
  else f.formaPagoPorConfirmar = true;
  if (datos.deducible != null) f.deducible = datos.deducible;
  if (datos.coaseguro) f.coaseguro = datos.coaseguro;
  if (datos.fechaEmision) f.fechaEmision = datos.fechaEmision;
  if (datos.fechaInicioVigencia) f.fechaInicioVigencia = datos.fechaInicioVigencia;
  if (datos.fechaFinVigencia) f.fechaFinVigencia = datos.fechaFinVigencia;
  if (Array.isArray(datos.coberturas) && datos.coberturas.length) {
    f.coberturas = datos.coberturas.map((c) => ({
      nombre: c.nombre || '', detalle: c.detalle || '', monto: c.monto || '',
      // La prima de esa fila es el "costo" de la cobertura, en la moneda de la
      // póliza: es el desglose del que salió la prima anual de arriba.
      costo: Number(c.primaInicial) > 0 ? c.primaInicial : '',
      costoMoneda: datos.moneda || 'MXN',
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

  f.documentosTmp = (documentosTmp || []).map((d) => ({ ...d, modelo }));
  return f;
}
