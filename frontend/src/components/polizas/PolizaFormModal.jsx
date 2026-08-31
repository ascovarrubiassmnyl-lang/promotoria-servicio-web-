import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Modal, Field, DatePicker, NumeroFormateado,
  PantallaCompleta, ValorFijo,
} from '../ui.jsx';
import {
  RAMOS, RAMOS_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST,
  ESTADOS_VENTA, ESTADOS_VENTA_LABEL, isoLocalDateInput, mxn, fechaCorta,
} from '../../lib/format.js';
import {
  MONEDAS, METODOS_PAGO, requiereTipoCambio, infoMoneda, equivalenteMXN,
  SITUACIONES, ASEGURADORA,
} from './tipos.js';
import MontoMoneda from './MontoMoneda.jsx';
import SubirPolizaModal from './SubirPolizaModal.jsx';

const VACIO = {
  clienteId: '', ramo: 'GMM', producto: '', productoCatalogoId: '',
  primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR', formaPago: 'ANUAL',
  moneda: 'MXN', primaMoneda: '', tipoCambio: '',
  domiciliada: false, esColectiva: false, metodoPago: '',
  contratante: '', numeroPoliza: '', situacion: 'ACTIVA',
  plan: '', redMedica: '', asegurados: [],
  sumaAsegurada: '', sumaAseguradaMoneda: 'MXN', plazo: '',
  deducible: '', deducibleMoneda: 'MXN', coaseguro: '',
  fechaFirma: '', fechaEmision: '', fechaInicioVigencia: '', fechaFinVigencia: '',
  fechaProximoPago: '', diaPago: '', montoPago: '', montoPagoMoneda: 'MXN', notas: '',
  coberturas: [], beneficiarios: [],
  documentoTmp: null,
};

const d = (v) => (v ? isoLocalDateInput(new Date(v)) : '');

function finDeVigenciaSugerido(inicioISO, anios = 1) {
  if (!inicioISO) return '';
  const [a, m, dia] = inicioISO.split('-').map(Number);
  if (!a || !m || !dia) return '';
  const fin = new Date(a + (anios || 1), m - 1, dia);
  fin.setDate(fin.getDate() - 1);
  return isoLocalDateInput(fin);
}

const PLAZO_POR_PRODUCTO = {
  'Vida Mujer': '20 años',
  SeguBeca: '18 menos la edad del menor',
  'Alfa Medical': 'Anual renovable',
  'Alfa Medical Flex': 'Anual renovable',
  'Alfa Medical Internacional': 'Anual renovable',
};

function plazoDesdeNombre(nombre) {
  if (!nombre) return '';
  const n = String(nombre);
  if (PLAZO_POR_PRODUCTO[n]) return PLAZO_POR_PRODUCTO[n];
  const pagosLimitados = n.match(/Pagos Limitados\s+(\d+)/i);
  if (pagosLimitados) return `${pagosLimitados[1]} pagos`;
  const nPagos = n.match(/(\d+)\s*pagos/i);
  if (nPagos) return `${nPagos[1]} pagos`;
  const nAnios = n.match(/(\d+)\s*años/i);
  if (nAnios) return `${nAnios[1]} años`;
  const edad = n.match(/Edad\s+(\d+)/i);
  if (edad) return `Hasta edad ${edad[1]}`;
  if (/Todos los pagos/i.test(n)) return 'Todos los pagos';
  if (/Plazo Largo/i.test(n)) return 'Plazo largo (20+ años)';
  if (/Plazo Medio/i.test(n)) return 'Plazo medio (10-19 años)';
  return '';
}

function aniosDePlazo(plazoTexto) {
  if (!plazoTexto) return null;
  const t = String(plazoTexto);
  if (/anual renovable/i.test(t)) return 1;
  const rango = t.match(/\((\d+)/);
  if (rango) return Number(rango[1]);
  const n = t.match(/(\d+)\s*(pagos|años)/i);
  if (n) return Number(n[1]);
  return null;
}

export default function PolizaFormModal({
  open,
  onClose,
  venta = null,
  asesorId = null,
  clienteId = null,
  nombreCliente = '',
  onSaved,
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const editando = !!venta;
  const [form, setForm] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [eligiendoOrigen, setEligiendoOrigen] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setEligiendoOrigen(!venta);
    setForm(venta ? {
      clienteId: venta.clienteId,
      ramo: venta.ramo || 'GMM',
      producto: venta.producto || '',
      productoCatalogoId: venta.productoCatalogoId || '',
      primaAnual: venta.primaAnual ?? '',
      comisionPct: venta.comisionPct ?? 10,
      estado: venta.estado,
      formaPago: venta.formaPago || 'ANUAL',
      moneda: venta.moneda || 'MXN',
      primaMoneda: venta.primaMoneda ?? '',
      tipoCambio: venta.tipoCambio ?? '',
      domiciliada: venta.domiciliada === true,
      esColectiva: Boolean(venta.esColectiva),
      metodoPago: venta.metodoPago || '',
      contratante: venta.contratante || '',
      numeroPoliza: venta.numeroPoliza || '',
      situacion: venta.situacion || 'ACTIVA',
      plan: venta.plan || '',
      redMedica: venta.redMedica || '',
      asegurados: Array.isArray(venta.asegurados) ? venta.asegurados : [],
      sumaAsegurada: venta.sumaAsegurada ?? '',
      sumaAseguradaMoneda: venta.sumaAseguradaMoneda || 'MXN',
      plazo: venta.plazo || '',
      deducible: venta.deducible ?? '',
      deducibleMoneda: venta.deducibleMoneda || 'MXN',
      coaseguro: venta.coaseguro || '',
      fechaFirma: d(venta.fechaFirma),
      fechaEmision: d(venta.fechaEmision),
      fechaInicioVigencia: d(venta.fechaInicioVigencia),
      fechaFinVigencia: d(venta.fechaFinVigencia),
      fechaProximoPago: d(venta.fechaProximoPago),
      diaPago: venta.diaPago ?? '',
      montoPago: venta.montoPago ?? '',
      montoPagoMoneda: venta.montoPagoMoneda || 'MXN',
      notas: venta.notas || '',
      coberturas: Array.isArray(venta.coberturas) ? venta.coberturas : [],
      beneficiarios: Array.isArray(venta.beneficiarios) ? venta.beneficiarios : [],
      documentoTmp: null,
    } : { ...VACIO, clienteId: clienteId || '' });
  }, [open, venta, clienteId]);

  const { data: clientes } = useQuery({
    queryKey: ['clientes-min', asesorId || 'self'],
    queryFn: async () => (await api.get('/clientes', { params: { asesorId: asesorId || undefined } })).data,
    enabled: open && !editando && !clienteId,
  });

  const { data: catalogo } = useQuery({
    queryKey: ['productos-catalogo'],
    queryFn: async () => (await api.get('/productos-catalogo', { params: { soloActivos: true } })).data,
    enabled: open,
  });

  const productosPorRamo = useMemo(() => (catalogo || []).filter((p) => p.ramo === form.ramo), [catalogo, form.ramo]);

  const { data: asesoresEquipo } = useQuery({
    queryKey: ['usuarios-asesores'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: open && !!asesorId && !editando,
  });

  const claveAgente = editando
    ? (venta.asesor?.claveAgente || '')
    : (asesorId
      ? (asesoresEquipo?.find((a) => a.id === asesorId)?.claveAgente || '')
      : (user?.claveAgente || ''));

  const { data: tipos } = useQuery({
    queryKey: ['tipo-cambio'],
    queryFn: async () => (await api.get('/ventas/tipo-cambio')).data,
    enabled: open,
    staleTime: 60 * 60 * 1000,
  });

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const clienteDeLista = clientes?.find((c) => c.id === form.clienteId);
  const nombreDelCliente = (nombreCliente
    || (clienteDeLista ? `${clienteDeLista.nombre} ${clienteDeLista.apellidoP} ${clienteDeLista.apellidoM || ''}` : '')
    || (editando ? `${venta.cliente?.nombre || ''} ${venta.cliente?.apellidoP || ''} ${venta.cliente?.apellidoM || ''}` : '')
  ).replace(/\s+/g, ' ').trim();

  useEffect(() => {
    if (!open || !nombreDelCliente) return;
    setForm((f) => (f.contratante ? f : { ...f, contratante: nombreDelCliente }));
  }, [open, nombreDelCliente]);

  const contratanteEsOtro = Boolean(nombreDelCliente) && form.contratante.trim() !== nombreDelCliente;

  const onProductoCatalogo = (id) => {
    const p = catalogo?.find((x) => x.id === id);
    const disponibles = Array.isArray(p?.monedas) ? p.monedas : null;
    const plazoSugerido = plazoDesdeNombre(p?.nombre);
    setForm((f) => {
      const moneda = disponibles && !disponibles.includes(f.moneda) ? disponibles[0] : f.moneda;
      const plazo = plazoSugerido || f.plazo;
      return {
        ...f,
        productoCatalogoId: id,
        producto: p?.nombre || f.producto,
        comisionPct: p?.comisionPct ?? f.comisionPct,
        plazo,
        fechaFinVigencia:
          f.fechaInicioVigencia
            && (!f.fechaFinVigencia
              || f.fechaFinVigencia === finDeVigenciaSugerido(f.fechaInicioVigencia, aniosDePlazo(f.plazo)))
            ? finDeVigenciaSugerido(f.fechaInicioVigencia, aniosDePlazo(plazo))
            : f.fechaFinVigencia,
        moneda,
        primaMoneda: requiereTipoCambio(moneda) ? (f.primaMoneda || f.primaAnual) : '',
        sumaAseguradaMoneda: moneda,
      };
    });
  };

  const aniosDelPlazo = aniosDePlazo(form.plazo);
  const productoCatalogoActual = catalogo?.find((x) => x.id === form.productoCatalogoId);
  const nombreBloqueado = Boolean(productoCatalogoActual);

  const monedasDelProducto = Array.isArray(productoCatalogoActual?.monedas) && productoCatalogoActual.monedas.length
    ? MONEDAS.filter((m) => productoCatalogoActual.monedas.includes(m.value))
    : null;

  const necesitaTC = requiereTipoCambio(form.moneda);

  const coberturasDisponibles = (productoCatalogoActual?.coberturas || []).filter(
    (c) => !form.coberturas.some((fc) => fc.nombre === c.nombre)
  );

  const agregarCoberturaDelCatalogo = (nombre) => {
    const c = coberturasDisponibles.find((x) => x.nombre === nombre);
    if (c) set('coberturas', [...form.coberturas, { ...c }]);
  };

  const esCoberturaDeCatalogo = (fila) => (productoCatalogoActual?.coberturas || []).some((c) => c.nombre === fila.nombre && c.detalle === fila.detalle);

  const setFila = (lista, i, campo, valor) => {
    const copia = [...form[lista]];
    copia[i] = { ...copia[i], [campo]: valor };
    set(lista, copia);
  };
  const quitarFila = (lista, i) => set(lista, form[lista].filter((_, x) => x !== i));

  const sumaPct = form.beneficiarios.reduce((s, b) => s + (+b.porcentaje || 0), 0);

  const costoCoberturas = form.coberturas.reduce((s, c) => {
    const m = c.costoMoneda || 'MXN';
    if (m === 'MXN') return s + (+c.costo || 0);
    return s + (equivalenteMXN(c.costo, m, tipos) || 0);
  }, 0);

  const costosSinConvertir = form.coberturas.some(
    (c) => +c.costo > 0 && (c.costoMoneda || 'MXN') !== 'MXN' && equivalenteMXN(c.costo, c.costoMoneda, tipos) == null
  );

  const primaEnPesos = necesitaTC
    ? equivalenteMXN(form.primaMoneda, form.moneda, tipos)
    : (form.primaAnual !== '' && !Number.isNaN(+form.primaAnual) ? +form.primaAnual : null);

  const comisionEstimada = primaEnPesos != null && form.comisionPct !== '' && !Number.isNaN(+form.comisionPct)
    ? primaEnPesos * (+form.comisionPct) / 100
    : null;

  // Validación de campos requeridos para el widget resumen
  const camposRequeridos = [
    { label: 'Cliente', ok: Boolean(form.clienteId || clienteId) },
    { label: 'Ramo', ok: Boolean(form.ramo) },
    { label: 'Producto', ok: Boolean(form.producto?.trim()) },
    { label: 'Prima', ok: necesitaTC ? +form.primaMoneda > 0 : +form.primaAnual > 0 },
    { label: 'Número de póliza', ok: Boolean(form.numeroPoliza?.trim()) },
    { label: 'Inicio de vigencia', ok: Boolean(form.fechaInicioVigencia) },
    { label: 'Fin de vigencia', ok: Boolean(form.fechaFinVigencia) },
  ];
  const camposFaltantes = camposRequeridos.filter((c) => !c.ok).length;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    if (necesitaTC && !(+form.primaMoneda > 0)) {
      setSaving(false);
      setErr(`Captura la prima anual en ${infoMoneda(form.moneda).sufijo}.`);
      return;
    }
    try {
      const payload = {
        ramo: form.ramo,
        producto: form.producto,
        productoCatalogoId: form.productoCatalogoId || null,
        contratante: form.contratante || null,
        numeroPoliza: form.numeroPoliza || null,
        situacion: form.situacion || null,
        primaAnual: necesitaTC ? undefined : (form.primaAnual !== '' ? +form.primaAnual : undefined),
        moneda: form.moneda,
        primaMoneda: necesitaTC && form.primaMoneda !== '' ? +form.primaMoneda : null,
        comisionPct: form.comisionPct !== '' ? +form.comisionPct : undefined,
        estado: form.estado,
        formaPago: form.formaPago,
        domiciliada: form.domiciliada === true,
        metodoPago: form.metodoPago || null,
        fechaEmision: form.fechaEmision || null,
        sumaAsegurada: form.sumaAsegurada !== '' ? +form.sumaAsegurada : null,
        sumaAseguradaMoneda: form.sumaAseguradaMoneda || 'MXN',
        sumaAseguradaTC: tipos?.[form.sumaAseguradaMoneda]?.valor ?? null,
        plazo: form.plazo || null,
        plan: form.plan || null,
        redMedica: form.redMedica || null,
        deducible: form.deducible !== '' ? +form.deducible : null,
        deducibleMoneda: form.deducibleMoneda || 'MXN',
        coaseguro: form.coaseguro || null,
        fechaFirma: form.fechaFirma || null,
        fechaInicioVigencia: form.fechaInicioVigencia || null,
        fechaFinVigencia: form.fechaFinVigencia || null,
        fechaProximoPago: form.fechaProximoPago || null,
        diaPago: form.diaPago !== '' ? +form.diaPago : null,
        montoPago: form.montoPago !== '' ? +form.montoPago : null,
        montoPagoMoneda: form.montoPagoMoneda || 'MXN',
        notas: form.notas || null,
        coberturas: form.coberturas,
        asegurados: form.asegurados,
        beneficiarios: form.beneficiarios,
      };
      if (editando) {
        await api.patch(`/ventas/${venta.id}`, payload);
        qc.invalidateQueries(['poliza', venta.id]);
      } else {
        await api.post('/ventas', {
          ...payload,
          clienteId: form.clienteId,
          asesorId: asesorId || undefined,
          documentoTmp: form.documentoTmp || undefined,
        });
      }
      qc.invalidateQueries(['ventas']);
      qc.invalidateQueries(['equipo-resumen']);
      onSaved?.();
      onClose();
    } catch (e2) {
      setErr(handleError(e2));
    } finally {
      setSaving(false);
    }
  };

  if (eligiendoOrigen) {
    const clienteElegido = clienteId || form.clienteId;
    return (
      <Modal open={open} onClose={onClose} title="Nueva póliza">
        <div className="space-y-3">
          {!clienteId && (
            <Field label="Cliente*">
              <select className="input" required value={form.clienteId} onChange={(e) => set('clienteId', e.target.value)}>
                <option value="">Selecciona…</option>
                {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP}</option>)}
              </select>
            </Field>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">¿Cómo quieres registrar esta póliza?</p>
          <button
            type="button"
            disabled={!clienteElegido}
            onClick={() => setSubiendo(true)}
            className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500 px-4 py-3 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <span className="block font-medium text-slate-800 dark:text-slate-100">Subir documento de la póliza</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sube el PDF emitido por la compañía: se analiza con IA y la ficha se prellena con los datos que encuentre. Tú revisas y confirmas antes de guardar.
            </span>
          </button>
          <button
            type="button"
            disabled={!clienteElegido}
            onClick={() => setEligiendoOrigen(false)}
            className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500 px-4 py-3 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <span className="block font-medium text-slate-800 dark:text-slate-100">Capturar los datos manualmente</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Se abre la ficha técnica completa para llenarla tú mismo.</span>
          </button>
          <div className="flex justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          </div>
        </div>
        <SubirPolizaModal
          open={subiendo}
          onClose={() => setSubiendo(false)}
          clienteId={clienteElegido}
          onListo={(datos) => {
            setForm((f) => ({ ...f, ...datos }));
            setSubiendo(false);
            setEligiendoOrigen(false);
          }}
        />
      </Modal>
    );
  }

  const esGMM = form.ramo === 'GMM';
  const conDeducible = esGMM || form.ramo === 'SALUD';

  return (
    <PantallaCompleta
      open={open}
      onClose={onClose}
      breadcrumb="Pólizas"
      title={editando ? `Editar póliza · ${venta.producto}` : 'Nueva póliza'}
      subtitle={editando ? 'Edición y detalle técnico de la póliza' : 'Ficha técnica y captura manual de póliza'}
      headerActions={(
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ficha-poliza"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <svg className="animate-spin -ml-0.5 w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Guardando…</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Guardar póliza</span>
              </>
            )}
          </button>
        </div>
      )}
    >
      <form id="ficha-poliza" onSubmit={submit} className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Columna Principal Izquierda (Formulario) */}
          <div className="lg:col-span-8 space-y-8 divide-y divide-slate-200 dark:divide-slate-700/60">
            
            {/* Banner sugerencia Lector IA cuando es nueva póliza */}
            {!editando && !form.documentoTmp && (
              <div className="rounded-2xl border border-emerald-200/90 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-white dark:from-emerald-950/40 dark:via-slate-800/90 dark:to-slate-800/40 p-4 sm:p-5 shadow-xs transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          ¿Tienes la carátula en PDF?
                        </h4>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                          Lector IA
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                        Sube el PDF emitido por la compañía y la inteligencia artificial extraerá y rellenará los datos automáticamente por ti.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubiendo(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm hover:shadow-md cursor-pointer shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Súbela al Lector IA</span>
                  </button>
                </div>
              </div>
            )}

            {form.documentoTmp && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 sm:px-5 py-3.5 text-sm shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
                    Prellenado con éxito desde <strong>{form.documentoTmp.nombre}</strong>. Revisa los campos antes de guardar.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => set('documentoTmp', null)}
                  className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white underline shrink-0 cursor-pointer"
                >
                  Quitar documento
                </button>
              </div>
            )}

            {/* 1 · Contratante */}
            <div className="pt-2 first:pt-0">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                <div className="sm:w-56 shrink-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Contratante</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Busca un cliente existente antes de crear uno nuevo.
                  </p>
                </div>
                <div className="flex-1 space-y-4">
                  {!editando && !clienteId ? (
                    <div>
                      <Field label="Cliente*">
                        <div className="flex gap-2">
                          <select
                            className="input flex-1"
                            required
                            value={form.clienteId}
                            onChange={(e) => set('clienteId', e.target.value)}
                          >
                            <option value="">— Seleccionar cliente —</option>
                            {clientes?.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre} {c.apellidoP} {c.apellidoM || ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </Field>
                    </div>
                  ) : (
                    <div>
                      <Field label="Cliente asociado">
                        <ValorFijo title="Cliente en cuya ficha se registra la póliza">
                          {nombreDelCliente || 'Cliente seleccionado'}
                        </ValorFijo>
                      </Field>
                    </div>
                  )}

                  <Field label="Nombre del contratante">
                    <input
                      className="input"
                      placeholder={nombreDelCliente || 'Nombre completo'}
                      value={form.contratante}
                      onChange={(e) => set('contratante', e.target.value)}
                    />
                    {contratanteEsOtro && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Distinto del cliente ({nombreDelCliente}).{' '}
                        <button
                          type="button"
                          onClick={() => set('contratante', nombreDelCliente)}
                          className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          Usar el del cliente
                        </button>
                      </p>
                    )}
                  </Field>
                </div>
              </div>
            </div>

            {/* 2 · Datos de la póliza */}
            <div className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                <div className="sm:w-56 shrink-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Datos de la póliza</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Tal como aparecen en la carátula.
                  </p>
                </div>
                <div className="flex-1 space-y-4">
                  {/* Fila 1: Aseguradora & Número */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Aseguradora">
                      <ValorFijo title="La promotoría opera Seguros Monterrey NYL">{ASEGURADORA}</ValorFijo>
                    </Field>
                    <Field label="Número de póliza">
                      <input
                        className="input"
                        placeholder="Ej. GMM-2026-001"
                        value={form.numeroPoliza}
                        onChange={(e) => set('numeroPoliza', e.target.value)}
                      />
                    </Field>
                  </div>

                  {/* Fila 2: RAMO (Pills segmentados estilo mockup) */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Ramo*
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {RAMOS.map((r) => {
                        const activo = form.ramo === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                ramo: r,
                                productoCatalogoId: '',
                                producto: editando ? f.producto : '',
                                redMedica: r === 'GMM' ? f.redMedica : '',
                              }));
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              activo
                                ? 'bg-[#234932] dark:bg-emerald-600 text-white shadow-sm ring-1 ring-[#234932] dark:ring-emerald-500'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                            }`}
                          >
                            {RAMOS_LABEL[r] || r}
                          </button>
                        );
                      })}
                    </div>
                    <label className="inline-flex items-center gap-2 mt-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={form.esColectiva}
                        onChange={(e) => set('esColectiva', e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                      />
                      <span>Es colectiva</span>
                    </label>
                  </div>

                  {/* Fila 3: Producto & Clave de Agente */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Producto del catálogo">
                      <select
                        className="input"
                        value={form.productoCatalogoId}
                        onChange={(e) => onProductoCatalogo(e.target.value)}
                      >
                        <option value="">— Personalizado / Opcional —</option>
                        {productosPorRamo.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}{p.comisionPct != null ? ` (${p.comisionPct}%)` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Nombre del producto*">
                      {nombreBloqueado ? (
                        <ValorFijo title="Definido por el catálogo">{form.producto}</ValorFijo>
                      ) : (
                        <input
                          className="input"
                          required
                          placeholder="Nombre comercial"
                          value={form.producto}
                          onChange={(e) => set('producto', e.target.value)}
                        />
                      )}
                    </Field>
                  </div>

                  {/* Fila 4: Plazo & Clave de agente */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Plazo">
                      <input
                        className="input"
                        placeholder="Ej. 20 pagos, Anual renovable"
                        value={form.plazo}
                        onChange={(e) => set('plazo', e.target.value)}
                      />
                    </Field>
                    <Field label="Clave de agente">
                      <ValorFijo title="Clave oficial de agente SMNYL">{claveAgente || 'Opcional'}</ValorFijo>
                    </Field>
                  </div>

                  {/* Fila 5: Estado de póliza & Estado administrativo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Estado de la póliza">
                      <select
                        className="input"
                        value={form.situacion}
                        onChange={(e) => set('situacion', e.target.value)}
                      >
                        {SITUACIONES.map((x) => (
                          <option key={x.value} value={x.value}>{x.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Estado administrativo">
                      <select
                        className="input"
                        value={form.estado}
                        onChange={(e) => set('estado', e.target.value)}
                      >
                        {ESTADOS_VENTA.map((x) => (
                          <option key={x} value={x}>{ESTADOS_VENTA_LABEL[x]}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 · Vigencia y pago */}
            <div className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                <div className="sm:w-56 shrink-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Vigencia y pago</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    De aquí salen los recordatorios de la Bandeja.
                  </p>
                </div>
                <div className="flex-1 space-y-4">
                  {/* Fila 1: Inicio y Fin de vigencia */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Inicio de vigencia">
                      <DatePicker
                        value={form.fechaInicioVigencia}
                        onChange={(v) => setForm((f) => ({
                          ...f,
                          fechaInicioVigencia: v,
                          fechaFinVigencia: f.fechaFinVigencia || finDeVigenciaSugerido(v, aniosDePlazo(f.plazo)),
                        }))}
                      />
                    </Field>
                    <Field label="Fin de vigencia">
                      <DatePicker
                        value={form.fechaFinVigencia}
                        onChange={(v) => set('fechaFinVigencia', v)}
                      />
                      {form.fechaInicioVigencia && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {aniosDelPlazo
                            ? <>Sugerido a {aniosDelPlazo} {aniosDelPlazo === 1 ? 'año' : 'años'} del inicio{form.plazo ? <> (plazo: {form.plazo})</> : null}.</>
                            : <>Vigencia anual por defecto.</>}
                        </p>
                      )}
                    </Field>
                  </div>

                  {/* Fila 2: Prima Anual & Forma de pago */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Prima anual* (moneda de la póliza)">
                      <MontoMoneda
                        value={necesitaTC ? form.primaMoneda : form.primaAnual}
                        onChange={(v) => set(necesitaTC ? 'primaMoneda' : 'primaAnual', v)}
                        moneda={form.moneda}
                        onMoneda={(moneda) => setForm((f) => ({
                          ...f,
                          moneda,
                          primaMoneda: requiereTipoCambio(moneda) ? (f.primaMoneda || f.primaAnual) : '',
                          primaAnual: !requiereTipoCambio(moneda) ? (f.primaAnual || f.primaMoneda) : f.primaAnual,
                        }))}
                        monedas={monedasDelProducto ? monedasDelProducto.map((m) => m.value) : null}
                        tipos={tipos}
                        placeholder="Ej. 20,000"
                      />
                    </Field>
                    <Field label="Financiamiento / plazo de pago">
                      <select
                        className="input"
                        value={form.formaPago}
                        onChange={(e) => set('formaPago', e.target.value)}
                      >
                        {FORMAS_PAGO_LIST.map((f) => (
                          <option key={f} value={f}>{FORMAS_PAGO[f]}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {/* Fila 3: Día de pago & Monto por pago */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Día de pago recurrente (1-28)">
                      <input
                        type="number"
                        min="1"
                        max="28"
                        className="input"
                        placeholder="Ej. 15"
                        value={form.diaPago}
                        onChange={(e) => set('diaPago', e.target.value)}
                      />
                    </Field>
                    <Field label="Monto por pago">
                      <MontoMoneda
                        value={form.montoPago}
                        onChange={(v) => set('montoPago', v)}
                        moneda={form.montoPagoMoneda}
                        onMoneda={(m) => set('montoPagoMoneda', m)}
                        tipos={tipos}
                        placeholder="Ej. 12,500"
                      />
                    </Field>
                  </div>

                  {/* Fila 4: Próximo pago, Fecha de emisión, Fecha de firma */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Próximo pago">
                      <DatePicker
                        value={form.fechaProximoPago}
                        onChange={(v) => set('fechaProximoPago', v)}
                      />
                    </Field>
                    <Field label="Fecha de emisión">
                      <DatePicker
                        value={form.fechaEmision}
                        onChange={(v) => set('fechaEmision', v)}
                      />
                    </Field>
                    <Field label="Fecha de firma">
                      <DatePicker
                        value={form.fechaFirma}
                        onChange={(v) => set('fechaFirma', v)}
                      />
                    </Field>
                  </div>

                  {/* Fila 5: Método de pago & Domiciliación */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <Field label="Medio de pago">
                      <select
                        className="input"
                        value={form.metodoPago}
                        onChange={(e) => set('metodoPago', e.target.value)}
                      >
                        <option value="">Sin especificar</option>
                        {METODOS_PAGO.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="pt-5">
                      <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                          checked={form.domiciliada}
                          onChange={(e) => set('domiciliada', e.target.checked)}
                        />
                        <span className="text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block">Póliza domiciliada</span>
                          <span className="text-slate-500 dark:text-slate-400 block mt-0.5">
                            Cargo automático: no genera recordatorios de cobro.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 · Comisión */}
            <div className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                <div className="sm:w-56 shrink-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Comisión</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    El porcentaje viene del catálogo del producto y se puede ajustar.
                  </p>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Comisión (%)">
                      <input
                        type="number"
                        step="0.1"
                        className="input"
                        value={form.comisionPct}
                        onChange={(e) => set('comisionPct', e.target.value)}
                      />
                    </Field>
                    <Field label="Comisión estimada">
                      <ValorFijo
                        title="Calculada sobre la prima anual en pesos."
                        vacio="Captura la prima anual"
                      >
                        {comisionEstimada != null ? (
                          <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                            {mxn(comisionEstimada)}
                          </span>
                        ) : ''}
                      </ValorFijo>
                      {necesitaTC && comisionEstimada != null && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Sobre el equivalente en pesos al tipo de cambio del día.
                        </p>
                      )}
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {/* 5 · Detalle del ramo */}
            <div className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                <div className="sm:w-56 shrink-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Detalle del ramo</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Lo específico de una póliza de {RAMOS_LABEL[form.ramo] || form.ramo}.
                  </p>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Plan">
                      <input
                        className="input"
                        placeholder="Ej. Plan A, Nacional, Elite"
                        value={form.plan}
                        onChange={(e) => set('plan', e.target.value)}
                      />
                    </Field>
                    <Field label="Suma asegurada">
                      <MontoMoneda
                        value={form.sumaAsegurada}
                        onChange={(v) => set('sumaAsegurada', v)}
                        moneda={form.sumaAseguradaMoneda}
                        onMoneda={(m) => set('sumaAseguradaMoneda', m)}
                        tipos={tipos}
                        placeholder="Ej. 350,000"
                      />
                    </Field>
                    {conDeducible && (
                      <>
                        <Field label="Deducible">
                          <MontoMoneda
                            value={form.deducible}
                            onChange={(v) => set('deducible', v)}
                            moneda={form.deducibleMoneda}
                            onMoneda={(m) => set('deducibleMoneda', m)}
                            tipos={tipos}
                            placeholder="Ej. 25,000"
                          />
                        </Field>
                        <Field label="Coaseguro">
                          <input
                            className="input"
                            placeholder="Ej. 10% (tope $50,000)"
                            value={form.coaseguro}
                            onChange={(e) => set('coaseguro', e.target.value)}
                          />
                        </Field>
                      </>
                    )}
                    {esGMM && (
                      <Field label="Red médica">
                        <input
                          className="input"
                          placeholder="Ej. Red Alfa, Nacional, Preferente"
                          value={form.redMedica}
                          onChange={(e) => set('redMedica', e.target.value)}
                        />
                      </Field>
                    )}
                  </div>

                  {/* Asegurados */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Asegurados
                      </label>
                      <button
                        type="button"
                        onClick={() => set('asegurados', [...form.asegurados, { nombre: '', parentesco: '', fechaNacimiento: '' }])}
                        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                      >
                        + Agregar asegurado
                      </button>
                    </div>
                    {form.asegurados.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Personas cubiertas por la póliza. Sin filas se entiende que el asegurado es el contratante.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {form.asegurados.map((a, i) => (
                          <div key={i} className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2">
                            <input
                              className="input"
                              placeholder="Nombre completo*"
                              value={a.nombre || ''}
                              onChange={(e) => setFila('asegurados', i, 'nombre', e.target.value)}
                            />
                            <input
                              className="input"
                              placeholder="Parentesco"
                              value={a.parentesco || ''}
                              onChange={(e) => setFila('asegurados', i, 'parentesco', e.target.value)}
                            />
                            <DatePicker
                              value={a.fechaNacimiento || ''}
                              onChange={(v) => setFila('asegurados', i, 'fechaNacimiento', v)}
                              placeholder="Nacimiento"
                            />
                            <button
                              type="button"
                              onClick={() => quitarFila('asegurados', i)}
                              className="text-slate-400 hover:text-red-500 px-1"
                              aria-label="quitar asegurado"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coberturas */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Coberturas
                      </label>
                      <button
                        type="button"
                        onClick={() => set('coberturas', [...form.coberturas, { nombre: '', detalle: '', monto: '', costo: '' }])}
                        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                      >
                        + Agregar cobertura personalizada
                      </button>
                    </div>
                    {productoCatalogoActual && (
                      <select
                        className="input mb-2"
                        value=""
                        disabled={coberturasDisponibles.length === 0}
                        onChange={(e) => agregarCoberturaDelCatalogo(e.target.value)}
                      >
                        <option value="">
                          {coberturasDisponibles.length > 0 ? 'Agregar cobertura del catálogo…' : 'Ya agregaste todas las coberturas del catálogo'}
                        </option>
                        {coberturasDisponibles.map((c) => (
                          <option key={c.nombre} value={c.nombre}>{c.nombre} — {c.monto}</option>
                        ))}
                      </select>
                    )}
                    {form.coberturas.length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Ej. Fallecimiento (básica) · Suma asegurada · $2,000,000 · sin costo extra
                      </p>
                    )}
                    {form.coberturas.length > 0 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1.3fr_1fr_0.8fr_0.7fr_auto] gap-2 mb-1 px-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cobertura</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Detalle</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Suma asegurada</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" title="Vacío = incluida sin costo extra">Costo extra</span>
                          <span />
                        </div>
                        {form.coberturas.map((c, i) => {
                          const bloqueada = esCoberturaDeCatalogo(c);
                          return (
                            <div key={i} className="grid grid-cols-[1.3fr_1fr_0.8fr_0.7fr_auto] gap-2">
                              {bloqueada ? (
                                <ValorFijo title="Definida por el catálogo">{c.nombre}</ValorFijo>
                              ) : (
                                <input
                                  className="input"
                                  placeholder="Cobertura*"
                                  value={c.nombre || ''}
                                  onChange={(e) => setFila('coberturas', i, 'nombre', e.target.value)}
                                />
                              )}
                              {bloqueada ? (
                                <div className="input flex items-center bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 text-xs">
                                  {c.detalle}
                                </div>
                              ) : (
                                <input
                                  className="input"
                                  placeholder="Detalle"
                                  value={c.detalle || ''}
                                  onChange={(e) => setFila('coberturas', i, 'detalle', e.target.value)}
                                />
                              )}
                              <input
                                className="input"
                                placeholder="$ / Incluida"
                                value={c.monto || ''}
                                onChange={(e) => setFila('coberturas', i, 'monto', e.target.value)}
                              />
                              <div className="flex gap-1">
                                <NumeroFormateado
                                  className="flex-1 min-w-0"
                                  placeholder="Incluida"
                                  value={c.costo ?? ''}
                                  onChange={(v) => setFila('coberturas', i, 'costo', v)}
                                />
                                <select
                                  className="input w-[4.5rem] shrink-0 px-1 text-xs"
                                  value={c.costoMoneda || 'MXN'}
                                  onChange={(e) => setFila('coberturas', i, 'costoMoneda', e.target.value)}
                                >
                                  {MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.sufijo}</option>)}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => quitarFila('coberturas', i)}
                                className="text-slate-400 hover:text-red-500 px-1"
                                aria-label="quitar cobertura"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {costoCoberturas > 0 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        Costo extra de coberturas: <strong className="tabular-nums">{mxn(costoCoberturas)}</strong>
                      </p>
                    )}
                    {costosSinConvertir && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Hay coberturas con costo en moneda extranjera sin tipo de cambio disponible.
                      </p>
                    )}
                  </div>

                  {/* Beneficiarios */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Beneficiarios
                      </label>
                      <button
                        type="button"
                        onClick={() => set('beneficiarios', [...form.beneficiarios, { nombre: '', porcentaje: '' }])}
                        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                      >
                        + Agregar beneficiario
                      </button>
                    </div>
                    {form.beneficiarios.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Quiénes cobran el siniestro. Los porcentajes deben sumar 100%.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {form.beneficiarios.map((b, i) => (
                          <div key={i} className="grid grid-cols-[1.6fr_0.5fr_auto] gap-2">
                            <input
                              className="input"
                              placeholder="Nombre (parentesco)*"
                              value={b.nombre || ''}
                              onChange={(e) => setFila('beneficiarios', i, 'nombre', e.target.value)}
                            />
                            <input
                              type="number"
                              min="0"
                              max="100"
                              className="input"
                              placeholder="%"
                              value={b.porcentaje ?? ''}
                              onChange={(e) => setFila('beneficiarios', i, 'porcentaje', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => quitarFila('beneficiarios', i)}
                              className="text-slate-400 hover:text-red-500 px-1"
                              aria-label="quitar beneficiario"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {form.beneficiarios.length > 0 && sumaPct !== 100 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Los porcentajes suman {sumaPct}% (deben sumar 100%).
                      </p>
                    )}
                  </div>

                  {/* Notas */}
                  <div className="pt-2">
                    <Field label="Notas y observaciones">
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Observaciones adicionales de la póliza..."
                        value={form.notas}
                        onChange={(e) => set('notas', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {err && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400">
                {err}
              </div>
            )}
          </div>

          {/* Columna Derecha (Sidebar Resumen fijo como en el mockup) */}
          <div className="lg:col-span-4 sticky top-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-5 shadow-sm space-y-4">
              <div>
                <span className="text-[11px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase block mb-3">
                  RESUMEN
                </span>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <dt className="text-slate-500 dark:text-slate-400 text-xs">Contratante</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-200 text-right truncate max-w-[160px]">
                      {form.contratante || nombreDelCliente || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <dt className="text-slate-500 dark:text-slate-400 text-xs">Ramo</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-200">
                      {RAMOS_LABEL[form.ramo] || form.ramo}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <dt className="text-slate-500 dark:text-slate-400 text-xs">Vigencia</dt>
                    <dd className="font-medium text-slate-800 dark:text-slate-200 text-xs text-right">
                      {form.fechaInicioVigencia && form.fechaFinVigencia
                        ? `${fechaCorta(form.fechaInicioVigencia)} – ${fechaCorta(form.fechaFinVigencia)}`
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <dt className="text-slate-500 dark:text-slate-400 text-xs">Prima</dt>
                    <dd className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {primaEnPesos ? mxn(primaEnPesos) : '$0'}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <dt className="text-slate-500 dark:text-slate-400 text-xs">Comisión</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      {comisionEstimada != null ? mxn(comisionEstimada) : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700/80 pt-3">
                {camposFaltantes > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Faltan <strong className="text-slate-700 dark:text-slate-300">{camposFaltantes}</strong> campos obligatorios.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <span>✓</span> Todos los campos listos para guardar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
      <SubirPolizaModal
        open={subiendo}
        onClose={() => setSubiendo(false)}
        clienteId={clienteId || form.clienteId}
        onListo={(datos) => {
          setForm((f) => ({ ...f, ...datos }));
          setSubiendo(false);
        }}
      />
    </PantallaCompleta>
  );
}
