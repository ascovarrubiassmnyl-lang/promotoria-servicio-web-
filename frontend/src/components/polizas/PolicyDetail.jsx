import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, VentaBadge, EmptyState, Modal, Field, NumeroFormateado } from '../ui.jsx';
import {
  mxn, fechaCorta, fechaHora, RAMOS_LABEL, FORMAS_PAGO,
  esVentaGanada, esVentaPipeline, PAGOS_POR_ANIO, edad, tamanoLegible,
} from '../../lib/format.js';
import {
  infoMoneda, montoMoneda, labelMetodoPago, semaforoPago, infoSemaforo, equivalenteMXN,
  infoSituacion, ASEGURADORA,
} from './tipos.js';
import VisorDocumento, { useVisorDocumento } from '../documentos/VisorDocumento.jsx';

const PERIODO_LABEL = { MENSUAL: 'por mes', TRIMESTRAL: 'por trimestre', SEMESTRAL: 'por semestre' };

// La fecha de nacimiento de un asegurado se guarda como el string 'YYYY-MM-DD'
// que captura el DatePicker (es un dato de la carátula, no un instante). Se lee
// como fecha LOCAL: `new Date('2000-05-10')` es medianoche UTC y en México se
// pintaría como el día anterior.
const fechaDia = (iso) => fechaCorta(`${iso}T00:00:00`);

function Kv({ k, children, big = false, green = false }) {
  return (
    <div>
      <p className="kv-k">{k}</p>
      <div className={`kv-v ${big ? 'text-lg' : ''} ${green ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{children}</div>
    </div>
  );
}

// Equivalente en pesos, en pequeño, de una cifra guardada en divisa. Se calcula
// con el tipo de cambio de HOY (Banxico), no con el que se usó al capturar la
// póliza: la pregunta que responde es "¿cuánto vale esto ahorita?".
// No renderiza nada para montos en MXN ni cuando no hay tipo de cambio — antes
// que mostrar una cifra en pesos que no es la real, no se muestra ninguna.
function EquivalentePesos({ monto, moneda, tipos }) {
  const enPesos = equivalenteMXN(monto, moneda, tipos);
  if (enPesos == null) return null;
  const fecha = tipos?.[moneda]?.fecha;
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
      ≈ {mxn(enPesos)} <span className="text-slate-400 dark:text-slate-500">hoy{fecha ? ` · Banxico ${fecha}` : ''}</span>
    </p>
  );
}

function FilaAdmin({ label, valor }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-100 text-right">{valor}</span>
    </div>
  );
}

// Detalle de póliza COMPARTIDO entre roles. readOnly = modo consulta:
// sin editar, sin eliminar, sin registrar pagos. Los promotores además ven
// Aprobar/Rechazar (el backend registra validadoPor/fechaValidacion).
export default function PolicyDetail({ polizaId, readOnly = false, onBack, onEditar, onEliminar }) {
  const qc = useQueryClient();
  const { esAdmin } = useAuth();
  const { data: p, isLoading } = useQuery({
    queryKey: ['poliza', polizaId],
    queryFn: async () => (await api.get(`/ventas/${polizaId}`)).data,
  });
  // Tipos de cambio del día: para mostrar a cuánto equivalen HOY en pesos las
  // cifras que la póliza guarda en dólares o UDIS. Es una referencia viva
  // (cambia con el mercado), distinta del TC que se congeló al capturarla.
  const { data: tipos } = useQuery({
    queryKey: ['tipo-cambio'],
    queryFn: async () => (await api.get('/ventas/tipo-cambio')).data,
    staleTime: 60 * 60 * 1000,
  });
  const { visor, verArchivo, cerrarVisor, descargarArchivo } = useVisorDocumento();

  // Confirmación de pago: pantalla real con monto y periodo, no un confirm()
  // del navegador — el asesor tiene que ver qué está registrando.
  const [cobro, setCobro] = useState({ open: false, otroMonto: false, monto: '', justificacion: '', saving: false, err: '' });

  // El monto esperado lo calcula el servidor (montoPago o prima/periodos).
  useEffect(() => {
    if (cobro.open && !cobro.otroMonto && p) {
      setCobro((c) => (c.monto === '' ? { ...c, monto: p.montoEsperado ?? '' } : c));
    }
  }, [cobro.open, cobro.otroMonto, p]);

  if (isLoading || !p) return <EmptyState message="Cargando póliza…" />;

  const ganada = esVentaGanada(p);
  const enPipeline = esVentaPipeline(p);
  const pagos = PAGOS_POR_ANIO[p.formaPago] || 1;
  const coberturas = Array.isArray(p.coberturas) ? p.coberturas : [];
  const beneficiarios = Array.isArray(p.beneficiarios) ? p.beneficiarios : [];
  const recibos = p.recordatoriosPago || [];
  const historial = p.pagos || [];
  const edadCliente = edad(p.cliente?.fechaNacimiento);
  const asegurados = Array.isArray(p.asegurados) ? p.asegurados : [];
  // Pólizas anteriores a la ficha técnica no guardan contratante: ahí el
  // contratante es el cliente, que es como se registraban.
  const contratante = p.contratante
    || `${p.cliente?.nombre || ''} ${p.cliente?.apellidoP || ''} ${p.cliente?.apellidoM || ''}`.replace(/\s+/g, ' ').trim();
  const contratanteEsOtro = Boolean(p.contratante)
    && p.contratante.trim().toLowerCase() !== `${p.cliente?.nombre || ''} ${p.cliente?.apellidoP || ''} ${p.cliente?.apellidoM || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
  const situacion = infoSituacion(p.situacion);
  const puedeRegistrarPago = !readOnly && p.formaPago !== 'UNICO' && p.fechaProximoPago;
  // Validación: solo promotores, y solo mientras la póliza no esté ya resuelta.
  const puedeValidar = esAdmin() && !['APROBADA', 'RECHAZADA', 'CANCELADA'].includes(p.estado);

  const validar = async (estado) => {
    const msg = estado === 'APROBADA'
      ? '¿Aprobar esta póliza? Quedará registrada como validada por ti.'
      : '¿Rechazar esta póliza? Dejará de contar como comisión ganada o en pipeline.';
    if (!confirm(msg)) return;
    try {
      await api.patch(`/ventas/${p.id}`, { estado });
      qc.invalidateQueries(['poliza', p.id]);
      qc.invalidateQueries(['ventas']);
      qc.invalidateQueries(['equipo-resumen']);
    } catch (e) { alert(handleError(e)); }
  };

  const abrirCobro = () => setCobro({
    open: true, otroMonto: false, monto: p.montoEsperado ?? '', justificacion: '', saving: false, err: '',
  });

  const confirmarCobro = async (e) => {
    e.preventDefault();
    // NumeroFormateado no es un <input required> nativo (es type="text" para
    // poder mostrar comas), así que la validación de "otro monto" capturado
    // se hace aquí en vez de depender del required de HTML.
    if (cobro.otroMonto && !(+cobro.monto > 0)) {
      setCobro((c) => ({ ...c, err: 'Captura el monto pagado.' }));
      return;
    }
    setCobro((c) => ({ ...c, saving: true, err: '' }));
    try {
      await api.post(`/ventas/${p.id}/cobroconfirmado`, {
        montoPagado: cobro.monto !== '' ? +cobro.monto : undefined,
        justificacion: cobro.otroMonto ? cobro.justificacion : undefined,
      });
      setCobro({ open: false, otroMonto: false, monto: '', justificacion: '', saving: false, err: '' });
      qc.invalidateQueries(['poliza', p.id]);
      qc.invalidateQueries(['ventas']);
      qc.invalidateQueries(['cliente', p.clienteId]);
    } catch (e2) {
      setCobro((c) => ({ ...c, saving: false, err: handleError(e2) }));
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition">
        ← Volver
      </button>

      {/* Encabezado */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{p.producto}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="tag">{RAMOS_LABEL[p.ramo] || p.ramo}</span>
              {p.plan && <span className="tag">{p.plan}</span>}
              <span>{ASEGURADORA}</span>
              {p.numeroPoliza && <span className="tabular-nums">· Póliza {p.numeroPoliza}</span>}
            </div>
          </div>
          <div className="text-right space-y-2.5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <VentaBadge estado={p.estado} />
              {/* Situación operativa de la póliza emitida: es OTRO campo,
                  no el estado administrativo que decide la comisión. */}
              {situacion && (
                <span className={`badge badge-dot ring-1 ${situacion.chip}`}>{situacion.label}</span>
              )}
              {/* Semáforo de pagos: derivado de la póliza y su historial */}
              <span className={`badge badge-dot ring-1 ${infoSemaforo(semaforoPago(p)).chip}`}>
                {infoSemaforo(semaforoPago(p)).label}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              {puedeValidar && (
                <>
                  <button onClick={() => validar('RECHAZADA')} className="btn-secondary text-xs py-1.5 px-2.5 !text-red-600 dark:!text-red-400">Rechazar</button>
                  <button onClick={() => validar('APROBADA')} className="btn-secondary text-xs py-1.5 px-2.5 !text-emerald-600 dark:!text-emerald-400">Aprobar</button>
                </>
              )}
              {readOnly ? (
                <span className="text-xs text-slate-400 dark:text-slate-500 self-center">Consulta · promotor</span>
              ) : (
                <>
                  <button onClick={() => onEliminar?.(p)} className="btn-secondary text-xs py-1.5 px-2.5 !text-red-600 dark:!text-red-400">Eliminar</button>
                  <button onClick={() => onEditar?.(p)} className="btn-secondary text-xs py-1.5 px-2.5">Editar</button>
                  {puedeRegistrarPago && (
                    <button onClick={abrirCobro} className="btn-primary text-xs py-1.5 px-2.5">Registrar pago</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
          <Kv k="Contratante">
            {contratante || '—'}
            {contratanteEsOtro && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                Cliente: {p.cliente?.nombre} {p.cliente?.apellidoP} {p.cliente?.apellidoM || ''}
              </p>
            )}
            {!contratanteEsOtro && edadCliente != null && (
              <span className="text-slate-400 dark:text-slate-500 font-normal"> · {edadCliente} años</span>
            )}
          </Kv>
          <Kv k="Asesor">
            {p.asesor?.nombre} {p.asesor?.apellidoP}
            {/* Clave de agente: dato del asesor (Asesores → Equipo), no de la
                póliza — por eso se lee del dueño y no se copia a la Venta. */}
            {p.asesor?.claveAgente && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5 tabular-nums">
                Clave {p.asesor.claveAgente}
              </p>
            )}
          </Kv>
          <Kv k="Suma asegurada" big>
            {p.sumaAsegurada != null
              ? (p.sumaAseguradaMoneda && p.sumaAseguradaMoneda !== 'MXN' ? montoMoneda(p.sumaAsegurada, p.sumaAseguradaMoneda) : mxn(p.sumaAsegurada))
              : '—'}
            <EquivalentePesos monto={p.sumaAsegurada} moneda={p.sumaAseguradaMoneda} tipos={tipos} />
          </Kv>
          <Kv k="Prima anual" big>
            {mxn(p.primaAnual)}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal"> / {(FORMAS_PAGO[p.formaPago] || p.formaPago).toLowerCase()}</span>
            {/* Póliza en divisa: se muestra el monto original y el TC usado.
                La cifra en pesos es la que cuenta para comisión y metas. */}
            {p.moneda && p.moneda !== 'MXN' && p.primaMoneda != null && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                {montoMoneda(p.primaMoneda, p.moneda)}
                {p.tipoCambio ? ` · TC ${p.tipoCambio}` : ''}
              </p>
            )}
            {PERIODO_LABEL[p.formaPago] && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">≈ {mxn(p.primaAnual / pagos)} {PERIODO_LABEL[p.formaPago]}</p>
            )}
          </Kv>
          <Kv k="Fecha de firma">{p.fechaFirma ? fechaCorta(p.fechaFirma) : '—'}</Kv>
          <Kv k="Fecha de emisión">{p.fechaEmision ? fechaCorta(p.fechaEmision) : '—'}</Kv>
          <Kv k="Vigencia">
            {p.fechaInicioVigencia ? fechaCorta(p.fechaInicioVigencia) : '—'} – {p.fechaFinVigencia ? fechaCorta(p.fechaFinVigencia) : '—'}
          </Kv>
          <Kv k="Próximo pago">
            {p.domiciliada
              ? <span className="text-slate-500 dark:text-slate-400">Domiciliada · cargo automático</span>
              : (p.fechaProximoPago ? fechaCorta(p.fechaProximoPago) : '—')}
          </Kv>
          {/* Comisión: verde SOLO si la póliza está aprobada/pagada */}
          <Kv k={`Comisión ${p.comisionPct != null ? `(${p.comisionPct}%)` : ''} ${ganada ? '· ganada' : enPipeline ? '· potencial' : ''}`} green={ganada}>
            {mxn(p.comisionMonto)}
          </Kv>
          {p.deducible != null && (
            <Kv k="Deducible">
              {p.deducibleMoneda && p.deducibleMoneda !== 'MXN' ? montoMoneda(p.deducible, p.deducibleMoneda) : mxn(p.deducible)}
              <EquivalentePesos monto={p.deducible} moneda={p.deducibleMoneda} tipos={tipos} />
            </Kv>
          )}
          {p.coaseguro && <Kv k="Coaseguro">{p.coaseguro}</Kv>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <div className="space-y-4">
          {/* Documento de la póliza: subir/ver/descargar el PDF emitido por
              la compañía. Clic = previsualizar, igual que en la ficha del
              cliente (mismo VisorDocumento reusado). */}
          <DocumentoPoliza polizaId={polizaId} venta={p} readOnly={readOnly} onVer={verArchivo} />

          {/* Coberturas */}
          <Card title="Coberturas">
            {coberturas.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Sin coberturas registradas.{!readOnly && ' Agrégalas con "Editar".'}</p>
            ) : coberturas.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.nombre}</p>
                  {c.detalle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{c.detalle}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm tabular-nums ${/incluida/i.test(c.monto || '') ? 'text-slate-400 dark:text-slate-500' : 'font-semibold text-slate-800 dark:text-slate-100'}`}>
                    {c.monto || '—'}
                  </p>
                  {/* Costo extra por cobertura: sin costo = va incluida.
                      Cada fila puede tener su propia moneda (costoMoneda);
                      las guardadas antes de multi-moneda no la traen = MXN. */}
                  <p className="text-xs mt-0.5 tabular-nums text-slate-400 dark:text-slate-500">
                    {c.costo > 0
                      ? `+${(c.costoMoneda && c.costoMoneda !== 'MXN') ? montoMoneda(c.costo, c.costoMoneda) : mxn(c.costo)}`
                      : 'Sin costo extra'}
                  </p>
                </div>
              </div>
            ))}
            {coberturas.some((c) => c.costo > 0) && (
              <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-700 text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">Costo extra de coberturas</span>
                <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {/* Se convierte cada fila a pesos ANTES de sumar: sumar
                      dólares con pesos daría un número sin significado. */}
                  {mxn(coberturas.reduce((s, c) => {
                    const m = c.costoMoneda || 'MXN';
                    return s + (m === 'MXN' ? (+c.costo || 0) : (equivalenteMXN(c.costo, m, tipos) || 0));
                  }, 0))}
                </span>
              </div>
            )}
          </Card>

          {/* Historial de pagos: cobros realmente registrados (PagoPoliza).
              Distinto del calendario de recibos, que son los avisos programados. */}
          <Card title={`Historial de pagos (${historial.length})`}>
            {historial.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Todavía no se ha registrado ningún cobro de esta póliza.</p>
            ) : (
              <div className="space-y-1">
                {historial.map((pago) => {
                  const distinto = pago.montoEsperado != null && pago.montoPagado != null
                    && Math.abs(pago.montoPagado - pago.montoEsperado) > 0.005;
                  return (
                    <div key={pago.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          Periodo {fechaCorta(pago.periodo)}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Registrado el {fechaCorta(pago.fechaPago)}
                          {pago.registrador ? ` por ${pago.registrador.nombre} ${pago.registrador.apellidoP}` : ''}
                        </p>
                        {pago.justificacion && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{pago.justificacion}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums money-earned">{mxn(pago.montoPagado)}</p>
                        {distinto && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                            esperado {mxn(pago.montoEsperado)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Calendario de recibos (recordatorios de pago reales) */}
          <Card title={`Calendario de recibos (${recibos.length})`}>
            {recibos.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Sin recibos programados. {!readOnly && 'Configura "Próximo pago" para generar recordatorios automáticos.'}
              </p>
            ) : (
              <div className="space-y-1">
                {recibos.map((r, i) => {
                  const pagado = r.completada;
                  const proximo = !pagado && recibos.findIndex((x) => !x.completada) === i;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 ${
                          pagado ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : proximo ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                          {pagado ? '✓' : i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">{r.fechaAviso ? fechaHora(r.fechaAviso) : '—'}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{r.texto}</p>
                        </div>
                      </div>
                      {pagado
                        ? <span className="badge badge-dot bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Pagado</span>
                        : proximo
                          ? <span className="badge badge-dot bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">Próximo</span>
                          : <span className="badge bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">Programado</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {puedeRegistrarPago && (
              <div className="mt-3 rounded-lg bg-brand-50 dark:bg-brand-900/30 p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-brand-700 dark:text-brand-300">Próximo cobro al cliente</p>
                  <p className="text-base font-bold text-brand-700 dark:text-brand-200 tabular-nums">{fechaCorta(p.fechaProximoPago)}</p>
                </div>
                <button onClick={abrirCobro} className="btn-primary text-sm">Confirmar cobro recibido</button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Asegurados: quiénes están cubiertos. Distinto de los
              beneficiarios, que son quienes cobran el siniestro. */}
          <Card title="Asegurados">
            {asegurados.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Sin asegurados capturados: se entiende que el asegurado es el contratante.
              </p>
            ) : asegurados.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-700 dark:text-slate-200">{a.nombre}</p>
                  {a.parentesco && <p className="text-xs text-slate-400 dark:text-slate-500">{a.parentesco}</p>}
                </div>
                {a.fechaNacimiento && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {fechaDia(a.fechaNacimiento)}
                  </span>
                )}
              </div>
            ))}
          </Card>

          {/* Beneficiarios */}
          <Card title="Beneficiarios">
            {beneficiarios.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Sin beneficiarios registrados.{!readOnly && ' Agrégalos con "Editar".'}</p>
            ) : beneficiarios.map((b, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{b.nombre}</span>
                <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{b.porcentaje != null ? `${b.porcentaje}%` : '—'}</span>
              </div>
            ))}
          </Card>

          {/* Datos administrativos */}
          <Card title="Datos administrativos">
            <FilaAdmin label="Aseguradora" valor={ASEGURADORA} />
            <FilaAdmin label="Número de póliza" valor={p.numeroPoliza || '—'} />
            <FilaAdmin label="Ramo" valor={RAMOS_LABEL[p.ramo] || p.ramo} />
            <FilaAdmin label="Plan" valor={p.plan || '—'} />
            {p.ramo === 'GMM' && <FilaAdmin label="Red médica" valor={p.redMedica || '—'} />}
            <FilaAdmin label="Estado de la póliza" valor={situacion?.label || '—'} />
            <FilaAdmin label="Clave del agente" valor={p.asesor?.claveAgente || '—'} />
            <FilaAdmin label="Plazo" valor={p.plazo || '—'} />
            <FilaAdmin label="Moneda" valor={infoMoneda(p.moneda).label} />
            <FilaAdmin label="Forma de pago" valor={FORMAS_PAGO[p.formaPago] || p.formaPago} />
            <FilaAdmin label="Método de pago" valor={labelMetodoPago(p.metodoPago) || '—'} />
            <FilaAdmin label="Domiciliada" valor={p.domiciliada ? 'Sí · cargo automático' : 'No'} />
            <FilaAdmin label="Monto por pago" valor={p.montoPago != null ? mxn(p.montoPago) : '—'} />
            <FilaAdmin label="Día de pago" valor={p.diaPago ? `Día ${p.diaPago}` : '—'} />
            <FilaAdmin label="Registrada" valor={fechaCorta(p.creadoEn)} />
            {p.validador && <FilaAdmin label="Validada por" valor={p.validador.nombre} />}
            {p.notas && (
              <div className="pt-2.5">
                <p className="kv-k">Notas</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{p.notas}</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Confirmación de pago: monto y periodo a la vista antes de aceptar */}
      <Modal open={cobro.open} onClose={() => setCobro((c) => ({ ...c, open: false }))} title="Registrar pago">
        <form onSubmit={confirmarCobro} className="space-y-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Cliente</span>
              <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{p.cliente?.nombre} {p.cliente?.apellidoP}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Póliza</span>
              <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{p.producto}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Periodo que se cubre</span>
              <span className="font-medium text-slate-800 dark:text-slate-100 tabular-nums text-right">
                {p.fechaProximoPago ? fechaCorta(p.fechaProximoPago) : 'Sin fecha programada'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Monto esperado</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums text-right">
                {p.montoEsperado != null ? mxn(p.montoEsperado) : '—'}
                <span className="block text-xs font-normal text-slate-400 dark:text-slate-500">
                  {FORMAS_PAGO[p.formaPago] || p.formaPago}
                </span>
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cobro.otroMonto}
              onChange={(e) => setCobro((c) => ({
                ...c,
                otroMonto: e.target.checked,
                monto: e.target.checked ? c.monto : (p.montoEsperado ?? ''),
                justificacion: e.target.checked ? c.justificacion : '',
              }))}
            />
            <span className="text-slate-700 dark:text-slate-200">El cliente pagó otro monto</span>
          </label>

          {cobro.otroMonto && (
            <div className="grid gap-3">
              <Field label="Monto pagado (MXN)*">
                <NumeroFormateado
                  value={cobro.monto}
                  onChange={(v) => setCobro((c) => ({ ...c, monto: v }))}
                />
              </Field>
              <Field label="Justificación (opcional)">
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Ej. pagó parcial, aplicó un descuento, recargo por atraso…"
                  value={cobro.justificacion}
                  onChange={(e) => setCobro((c) => ({ ...c, justificacion: e.target.value }))}
                />
              </Field>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Al confirmar se registra el cobro en el historial de la póliza y se genera
            automáticamente el siguiente recordatorio de pago.
          </p>

          {cobro.err && <p className="text-sm text-red-600">{cobro.err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setCobro((c) => ({ ...c, open: false }))} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={cobro.saving} className="btn-primary">
              {cobro.saving ? 'Registrando…' : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </Modal>

      <VisorDocumento visor={visor} onClose={cerrarVisor} onDescargar={descargarArchivo} />
    </div>
  );
}

// Documento oficial de la póliza: ver/descargar si ya está adjunto, o subirlo
// si la póliza se creó a mano y todavía no tiene uno. Sin análisis con IA
// (eso solo pasa al crear, en SubirPolizaModal) — aquí es solo el archivo.
function DocumentoPoliza({ polizaId, venta, readOnly, onVer }) {
  const qc = useQueryClient();
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState('');
  const doc = venta?.documentoPoliza;

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      await api.post(`/ventas/${polizaId}/documento`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries(['poliza', polizaId]);
    } catch (e2) { setErr(handleError(e2)); } finally { setSubiendo(false); }
  };

  return (
    <Card title="Documento de la póliza">
      {doc ? (
        <button
          type="button"
          onClick={() => onVer(doc)}
          className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 hover:border-brand-400 dark:hover:border-brand-500 transition-colors text-left"
        >
          <span>
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{doc.nombre}</span>
            <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {tamanoLegible(doc.tamano)} · subido el {fechaCorta(doc.creadoEn)}
            </span>
          </span>
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400 shrink-0">Ver</span>
        </button>
      ) : readOnly ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Sin documento adjunto.</p>
      ) : (
        <div>
          <label className="input flex items-center justify-center gap-2 cursor-pointer text-sm text-slate-500 dark:text-slate-400 hover:border-brand-400 dark:hover:border-brand-500">
            {subiendo ? 'Subiendo…' : 'Subir el PDF de esta póliza'}
            <input type="file" accept="application/pdf" className="hidden" disabled={subiendo} onChange={subir} />
          </label>
          {err && <p className="text-xs text-red-600 mt-1.5">{err}</p>}
        </div>
      )}
    </Card>
  );
}
