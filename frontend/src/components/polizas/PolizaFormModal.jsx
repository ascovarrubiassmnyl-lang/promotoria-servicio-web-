import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Modal, Field, DatePicker, NumeroFormateado,
  PantallaCompleta, SeccionFicha, ValorFijo,
} from '../ui.jsx';
import {
  RAMOS, RAMOS_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST,
  ESTADOS_VENTA, ESTADOS_VENTA_LABEL, isoLocalDateInput, mxn,
} from '../../lib/format.js';
import {
  MONEDAS, METODOS_PAGO, requiereTipoCambio, infoMoneda, equivalenteMXN,
  SITUACIONES, ASEGURADORA,
} from './tipos.js';
import MontoMoneda from './MontoMoneda.jsx';
import SubirPolizaModal from './SubirPolizaModal.jsx';

const VACIO = {
  clienteId: '', ramo: 'VIDA', producto: '', productoCatalogoId: '',
  primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR', formaPago: 'ANUAL',
  moneda: 'MXN', primaMoneda: '', tipoCambio: '',
  domiciliada: false, metodoPago: '',
  // Ficha técnica: contratante (por defecto el cliente, ver `nombreDelCliente`),
  // datos de la carátula de la compañía y detalle del plan.
  contratante: '', numeroPoliza: '', situacion: 'ACTIVA',
  plan: '', redMedica: '', asegurados: [],
  // La suma asegurada sigue la moneda de la póliza por defecto, pero es
  // independiente: una póliza en MXN puede tener una suma asegurada
  // capturada en UDIS si así viene en el contrato (frecuente en dotales).
  sumaAsegurada: '', sumaAseguradaMoneda: 'MXN', plazo: '',
  deducible: '', deducibleMoneda: 'MXN', coaseguro: '',
  fechaFirma: '', fechaEmision: '', fechaInicioVigencia: '', fechaFinVigencia: '',
  fechaProximoPago: '', diaPago: '', montoPago: '', montoPagoMoneda: 'MXN', notas: '',
  coberturas: [], beneficiarios: [],
  documentoTmp: null, // { archivo, nombre, mime, tamano, modelo } de /ventas/analizar-documento
};

const d = (v) => (v ? isoLocalDateInput(new Date(v)) : '');

// Fin de vigencia sugerido a partir del inicio, adelantando `anios` años y
// restando un día (vence la víspera del aniversario). Por defecto 1 año: los
// seguros son de vigencia anual y se renuevan cada año. Con un producto del
// catálogo cuyo plazo se conoce se usa ese plazo, para que el asesor no tenga
// que caminar el calendario hasta 2046 (ver `aniosDePlazo`). Siempre es una
// sugerencia: el campo queda editable.
function finDeVigenciaSugerido(inicioISO, anios = 1) {
  if (!inicioISO) return '';
  const [a, m, dia] = inicioISO.split('-').map(Number);
  if (!a || !m || !dia) return '';
  const fin = new Date(a + (anios || 1), m - 1, dia);
  fin.setDate(fin.getDate() - 1); // vence el día previo al aniversario
  return isoLocalDateInput(fin);
}

// Plazo de PAGO por producto del catálogo. En la mayoría ya viene codificado en
// el nombre ("Orvi 10 pagos", "Star Dotal 20 años", "Imagina Ser PPR — Pagos
// Limitados 15") porque cada plazo es una variante distinta del catálogo, no un
// campo aparte. Los 5 que no lo declaran en el nombre se resuelven con este mapa
// explícito, con el plazo que fija el manual SMNYL de cada uno:
//  - Vida Mujer: 20 años de cobertura y de pago de primas (manual, §"Periodo de
//    cobertura"/"Periodo de pago de primas").
//  - SeguBeca: el plazo NO es fijo — son (18 − edad del menor) años, así que se
//    deja la fórmula como texto para que el asesor la sustituya por el número
//    del caso concreto.
//  - Alfa Medical (los 3): GMM anual renovable; no tiene plazo de pago en años.
const PLAZO_POR_PRODUCTO = {
  'Vida Mujer': '20 años',
  SeguBeca: '18 menos la edad del menor',
  'Alfa Medical': 'Anual renovable',
  'Alfa Medical Flex': 'Anual renovable',
  'Alfa Medical Internacional': 'Anual renovable',
};

// Devuelve el plazo sugerido para prellenar el campo, que sigue siendo editable.
// Si no se puede determinar devuelve '' y no se toca lo que el asesor escribió.
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

// Años que dura el plan, a partir del texto de plazo que produce
// `plazoDesdeNombre` ("20 pagos", "15 años", "Anual renovable"…). Solo sirve
// para posicionar el calendario del fin de vigencia cerca de la fecha real y
// ahorrarle al asesor decenas de clics; NO es un dato de negocio ni se guarda.
// Devuelve null cuando el plazo no se traduce a un número de años fijo:
//  - "Todos los pagos" / "Hasta edad 60": vitalicios o atados a la edad del
//    asegurado, que el modal no conoce.
//  - "18 menos la edad del menor" (SeguBeca): depende del caso concreto.
//  - "Anual renovable" (Alfa Medical): sí es un año, por eso devuelve 1.
// Con null se cae al año de vigencia estándar, que es el comportamiento previo.
function aniosDePlazo(plazoTexto) {
  if (!plazoTexto) return null;
  const t = String(plazoTexto);
  if (/anual renovable/i.test(t)) return 1;
  // Los rangos van primero: en "Plazo medio (10-19 años)" la regla de abajo
  // haría match con "19 años" y devolvería el tope en vez del piso.
  const rango = t.match(/\((\d+)/);
  if (rango) return Number(rango[1]);
  const n = t.match(/(\d+)\s*(pagos|años)/i);
  if (n) return Number(n[1]);
  return null;
}

// Modal único para crear (venta=null) o editar (venta=objeto) una póliza.
// asesorId (opcional): scope de promotor — la póliza nueva se asigna a ese
// asesor y el selector de clientes se limita a su cartera.
// clienteId (opcional): al crear desde la ficha de un cliente, fija el cliente
// y oculta el selector.
// nombreCliente (opcional): nombre ya conocido del cliente cuando `clienteId`
// viene fijo (ficha de cliente), para prellenar el contratante sin volver a
// pedir la lista de clientes.
//
// La captura vive en PANTALLA COMPLETA (PantallaCompleta), no en un recuadro
// centrado: es una ficha técnica de cinco secciones que se llena de arriba a
// abajo, no una pregunta corta. Lo único que sigue siendo un Modal es la
// elección inicial "subir documento / capturar a mano".
export default function PolizaFormModal({ open, onClose, venta = null, asesorId = null, clienteId = null, nombreCliente = '', onSaved }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const editando = !!venta;
  const [form, setForm] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Al crear (no editar), se pregunta primero si va a subir el PDF o
  // capturar a mano — igual que pediste: "primero la opción de subir
  // documento de póliza". Editar una póliza existente va directo al
  // formulario (no tiene sentido reabrir el flujo de subida ahí).
  const [eligiendoOrigen, setEligiendoOrigen] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setEligiendoOrigen(!venta);
    setForm(venta ? {
      clienteId: venta.clienteId,
      ramo: venta.ramo,
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
      metodoPago: venta.metodoPago || '',
      contratante: venta.contratante || '',
      numeroPoliza: venta.numeroPoliza || '',
      // Pólizas anteriores a la ficha técnica no traen situación: se dejan sin
      // marcar en vez de suponer que están activas.
      situacion: venta.situacion || '',
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

  // Clave de agente que va en la carátula: es un dato del ASESOR (se captura
  // una sola vez en Asesores → Equipo), no de la póliza — por eso no se
  // guarda en Venta, se lee siempre del dueño. Al capturar sobre la cartera de
  // otro asesor (promotor), la clave que aplica es la de ESE asesor, no la de
  // quien está tecleando.
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

  // Tipos de cambio oficiales del día (Banxico: FIX para USD, valor de la UDI).
  // Alimentan el equivalente en pesos de cada monto y prellenan el tipo de
  // cambio de la prima. Si el endpoint no trae datos (sin BANXICO_TOKEN o
  // Banxico caído), todo sigue funcionando con captura manual.
  const { data: tipos } = useQuery({
    queryKey: ['tipo-cambio'],
    queryFn: async () => (await api.get('/ventas/tipo-cambio')).data,
    enabled: open,
    staleTime: 60 * 60 * 1000, // el FIX se publica una vez al día
  });

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  // Nombre del cliente al que se le está registrando la póliza: viene por prop
  // desde su ficha (el caso normal, la póliza se crea desde ahí) o de la lista
  // cuando el asesor elige el cliente en este mismo formulario.
  const clienteDeLista = clientes?.find((c) => c.id === form.clienteId);
  const nombreDelCliente = (nombreCliente
    || (clienteDeLista ? `${clienteDeLista.nombre} ${clienteDeLista.apellidoP} ${clienteDeLista.apellidoM || ''}` : '')
    || (editando ? `${venta.cliente?.nombre || ''} ${venta.cliente?.apellidoP || ''} ${venta.cliente?.apellidoM || ''}` : '')
  ).replace(/\s+/g, ' ').trim();

  // El contratante arranca siendo el cliente (que es el caso normal) y queda
  // editable: a veces contrata otra persona — un padre para un hijo, un socio
  // para otro. Solo se rellena mientras el campo esté vacío, para no pisar un
  // nombre ya escrito a mano al cambiar de cliente o al cargar la lista.
  useEffect(() => {
    if (!open || !nombreDelCliente) return;
    setForm((f) => (f.contratante ? f : { ...f, contratante: nombreDelCliente }));
  }, [open, nombreDelCliente]);

  const contratanteEsOtro = Boolean(nombreDelCliente) && form.contratante.trim() !== nombreDelCliente;

  const onProductoCatalogo = (id) => {
    const p = catalogo?.find((x) => x.id === id);
    // Si el producto solo se ofrece en una moneda (ej. Orvi 6 pagos = USD),
    // se preselecciona; con varias se respeta lo que el asesor ya eligió si
    // es válido para ese producto.
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
        // El plazo del producto elegido manda: si el nombre lo declara, se
        // actualiza aunque ya hubiera un valor (el anterior era de otro plazo).
        plazo,
        // Si el inicio de vigencia ya estaba capturado (el asesor eligió el
        // producto después), se recalcula el fin con el plazo del producto
        // nuevo. Solo cuando el fin sigue siendo el que sugerimos con el plazo
        // anterior: si el asesor ya lo ajustó a mano, no se toca.
        fechaFinVigencia:
          f.fechaInicioVigencia
            && (!f.fechaFinVigencia
              || f.fechaFinVigencia === finDeVigenciaSugerido(f.fechaInicioVigencia, aniosDePlazo(f.plazo)))
            ? finDeVigenciaSugerido(f.fechaInicioVigencia, aniosDePlazo(plazo))
            : f.fechaFinVigencia,
        moneda,
        // Al cambiar a divisa, el monto capturado pasa al campo de moneda
        // original; el tipo de cambio ya NO lo captura el asesor, lo resuelve
        // el servidor (Banxico o el respaldo manual) al guardar.
        primaMoneda: requiereTipoCambio(moneda) ? (f.primaMoneda || f.primaAnual) : '',
        // La suma asegurada sigue a la moneda de la póliza por defecto (el
        // caso normal); su propio selector la puede cambiar después.
        sumaAseguradaMoneda: moneda,
      };
    });
  };

  // Años del plazo capturado, para el texto de ayuda del fin de vigencia.
  const aniosDelPlazo = aniosDePlazo(form.plazo);

  const productoCatalogoActual = catalogo?.find((x) => x.id === form.productoCatalogoId);
  // Con producto del catálogo elegido, el nombre lo define la compañía: se
  // autorrellena y queda de solo lectura (antes se podía teclear encima y la
  // misma póliza acababa registrada con tres nombres distintos).
  const nombreBloqueado = Boolean(productoCatalogoActual);

  // Monedas en que la compañía ofrece el producto elegido (dato del catálogo).
  // Sin producto de catálogo, se ofrecen las tres.
  const monedasDelProducto = Array.isArray(productoCatalogoActual?.monedas) && productoCatalogoActual.monedas.length
    ? MONEDAS.filter((m) => productoCatalogoActual.monedas.includes(m.value))
    : null;

  // `primaAnual` viaja SIEMPRE en MXN al backend, pero el asesor ya no
  // captura el tipo de cambio: el servidor lo resuelve solo (Banxico o el
  // respaldo manual) al guardar. El equivalente en pesos que se ve bajo el
  // campo (vía MontoMoneda) es solo vista previa informativa.
  const necesitaTC = requiereTipoCambio(form.moneda);
  // Coberturas del catálogo que aún no se agregaron a la póliza (para el selector).
  const coberturasDisponibles = (productoCatalogoActual?.coberturas || []).filter(
    (c) => !form.coberturas.some((fc) => fc.nombre === c.nombre)
  );
  const agregarCoberturaDelCatalogo = (nombre) => {
    const c = coberturasDisponibles.find((x) => x.nombre === nombre);
    if (c) set('coberturas', [...form.coberturas, { ...c }]);
  };
  // Una fila viene "bloqueada" (nombre/detalle de solo lectura, definidos por la
  // compañía) si coincide exactamente con una cobertura del catálogo del producto
  // elegido; el monto sí es editable (varía por edad/suma asegurada/suscripción).
  const esCoberturaDeCatalogo = (fila) => (productoCatalogoActual?.coberturas || []).some((c) => c.nombre === fila.nombre && c.detalle === fila.detalle);

  // Editores de filas dinámicas
  const setFila = (lista, i, campo, valor) => {
    const copia = [...form[lista]];
    copia[i] = { ...copia[i], [campo]: valor };
    set(lista, copia);
  };
  const quitarFila = (lista, i) => set(lista, form[lista].filter((_, x) => x !== i));

  const sumaPct = form.beneficiarios.reduce((s, b) => s + (+b.porcentaje || 0), 0);
  // Costo extra sumado de las coberturas (informativo: la prima la captura el
  // asesor, no se deriva de aquí). Cada fila puede estar en una moneda
  // distinta, así que se convierte todo a pesos ANTES de sumar — sumar dólares
  // con pesos daría un número sin significado. Una fila en divisa sin tipo de
  // cambio disponible no se puede convertir: se excluye del total y se avisa,
  // en vez de contarla como si fueran pesos.
  const costoCoberturas = form.coberturas.reduce((s, c) => {
    const m = c.costoMoneda || 'MXN';
    if (m === 'MXN') return s + (+c.costo || 0);
    return s + (equivalenteMXN(c.costo, m, tipos) || 0);
  }, 0);
  const costosSinConvertir = form.coberturas.some(
    (c) => +c.costo > 0 && (c.costoMoneda || 'MXN') !== 'MXN' && equivalenteMXN(c.costo, c.costoMoneda, tipos) == null
  );


  // Prima ya expresada en pesos, para la comisión estimada. Con la póliza en
  // divisa se usa el equivalente del día (mismo criterio que MontoMoneda);
  // null cuando no hay tipo de cambio disponible, y entonces no se muestra
  // ninguna cifra de comisión en vez de inventar una.
  const primaEnPesos = necesitaTC
    ? equivalenteMXN(form.primaMoneda, form.moneda, tipos)
    : (form.primaAnual !== '' && !Number.isNaN(+form.primaAnual) ? +form.primaAnual : null);
  const comisionEstimada = primaEnPesos != null && form.comisionPct !== '' && !Number.isNaN(+form.comisionPct)
    ? primaEnPesos * (+form.comisionPct) / 100
    : null;

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
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
        // Con moneda extranjera, la prima se manda en su moneda original
        // (primaMoneda) y el SERVIDOR calcula primaAnual en MXN con el tipo
        // de cambio del día (Banxico o el respaldo manual) — el asesor nunca
        // captura ni ve un tipo de cambio en este formulario. `primaAnual` en
        // pesos solo se manda directo cuando la póliza ya está en MXN.
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
        // Foto del tipo de cambio con el que se mostró el equivalente en pesos
        // de la suma asegurada (informativo, no alimenta métricas).
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
          // Vincula el PDF ya subido y analizado (si lo hubo) a esta póliza.
          documentoTmp: form.documentoTmp || undefined,
        });
      }
      qc.invalidateQueries(['ventas']);
      qc.invalidateQueries(['equipo-resumen']);
      onSaved?.();
      onClose();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  // Pantalla de elección al crear: subir el PDF de la compañía (se analiza y
  // prellena esta misma ficha) o capturar todo a mano, como ya existía. Sigue
  // siendo un Modal chico: es una pregunta de dos opciones, no una captura.
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
            className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500 px-4 py-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
            className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500 px-4 py-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
      title={editando ? `Ficha técnica · ${venta.producto}` : 'Ficha técnica de la póliza'}
      subtitle={nombreDelCliente ? `${nombreDelCliente} · ${ASEGURADORA}` : ASEGURADORA}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {err ? <span className="text-red-600 dark:text-red-400">{err}</span> : 'Los campos que no vengan en la carátula puedes dejarlos vacíos.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" form="ficha-poliza" disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : 'Guardar póliza'}
            </button>
          </div>
        </div>
      )}
    >
      <form id="ficha-poliza" onSubmit={submit} className="space-y-4">
        {form.documentoTmp && (
          <div className="flex items-start gap-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 px-3 py-2.5 text-sm">
            <span className="flex-1 text-brand-700 dark:text-brand-300">
              Prellenado desde <strong>{form.documentoTmp.nombre}</strong>. Revisa los campos antes de guardar — el documento se adjuntará a la póliza.
            </span>
            <button
              type="button"
              onClick={() => set('documentoTmp', null)}
              className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline shrink-0"
            >
              Quitar documento
            </button>
          </div>
        )}

        {/* 1 · Contratante --------------------------------------------------- */}
        <SeccionFicha
          numero={1}
          title="Contratante"
          subtitle="Quien firma y paga la póliza. Por defecto es el cliente de esta ficha; cámbialo si contrata otra persona."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!editando && !clienteId && (
              <Field label="Cliente*">
                <select className="input" required value={form.clienteId} onChange={(e) => set('clienteId', e.target.value)}>
                  <option value="">Selecciona…</option>
                  {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP}</option>)}
                </select>
              </Field>
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
                  >Usar el del cliente</button>
                </p>
              )}
            </Field>
          </div>
        </SeccionFicha>

        {/* 2 · Datos de la póliza -------------------------------------------- */}
        <SeccionFicha numero={2} title="Datos de la póliza" subtitle="Lo que identifica la póliza en la carátula de la compañía.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Aseguradora">
              <ValorFijo title="La promotoría opera una sola compañía">{ASEGURADORA}</ValorFijo>
            </Field>
            <Field label="Número de póliza">
              <input
                className="input"
                placeholder="Ej. 1234567"
                value={form.numeroPoliza}
                onChange={(e) => set('numeroPoliza', e.target.value)}
              />
            </Field>
            <Field label="Ramo*">
              <select className="input" required value={form.ramo} onChange={(e) => setForm((f) => ({ ...f, ramo: e.target.value, productoCatalogoId: '', producto: editando ? f.producto : '', redMedica: e.target.value === 'GMM' ? f.redMedica : '' }))}>
                {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Producto del catálogo">
              <select className="input" value={form.productoCatalogoId} onChange={(e) => onProductoCatalogo(e.target.value)}>
                <option value="">— Personalizado —</option>
                {productosPorRamo.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.comisionPct != null ? ` (comisión ${p.comisionPct}%)` : ''}</option>)}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Solo los productos del ramo elegido.</p>
            </Field>
            <Field label="Nombre del producto*">
              {nombreBloqueado ? (
                <ValorFijo title="Definido por el catálogo de la compañía. Elige «Personalizado» para escribirlo a mano.">{form.producto}</ValorFijo>
              ) : (
                <input className="input" required value={form.producto} onChange={(e) => set('producto', e.target.value)} />
              )}
            </Field>
            <Field label="Plazo">
              <input className="input" placeholder="Ej. 20 pagos, Anual renovable" value={form.plazo} onChange={(e) => set('plazo', e.target.value)} />
            </Field>
            <Field label="Clave del agente">
              <ValorFijo
                title="Se captura una sola vez en Asesores → Equipo; aquí solo se muestra."
                vacio="Sin clave registrada"
              >{claveAgente}</ValorFijo>
              {!claveAgente && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Captúrala en Asesores → Equipo → Editar; desde ahí aparece sola en cada póliza.
                </p>
              )}
            </Field>
            <Field label="Estado de la póliza">
              <select className="input" value={form.situacion} onChange={(e) => set('situacion', e.target.value)}>
                <option value="">Sin especificar</option>
                {SITUACIONES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Estado administrativo">
              <select className="input" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                {ESTADOS_VENTA.map((x) => <option key={x} value={x}>{ESTADOS_VENTA_LABEL[x]}</option>)}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Define si la comisión cuenta como ganada o en pipeline.
              </p>
            </Field>
          </div>
        </SeccionFicha>

        {/* 3 · Vigencia y pago ----------------------------------------------- */}
        <SeccionFicha numero={3} title="Vigencia y pago" subtitle="Cuándo corre la póliza y cómo se cobra.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Inicio de vigencia">
              <DatePicker
                value={form.fechaInicioVigencia}
                onChange={(v) => setForm((f) => ({
                  ...f,
                  fechaInicioVigencia: v,
                  // Fin de vigencia automático según el plazo del producto: solo
                  // si aún está vacío, para no pisar un ajuste manual del asesor.
                  fechaFinVigencia: f.fechaFinVigencia || finDeVigenciaSugerido(v, aniosDePlazo(f.plazo)),
                }))}
              />
            </Field>
            <Field label="Fin de vigencia">
              <DatePicker value={form.fechaFinVigencia} onChange={(v) => set('fechaFinVigencia', v)} />
              {form.fechaInicioVigencia && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {aniosDelPlazo
                    ? <>Sugerido a {aniosDelPlazo} {aniosDelPlazo === 1 ? 'año' : 'años'} del inicio{form.plazo ? <> (plazo: {form.plazo})</> : null}. Ajústalo si la póliza dice otra cosa.</>
                    : <>Vigencia anual por defecto: el plazo de este producto no es un número fijo de años.</>}
                </p>
              )}
            </Field>
            <Field label="Forma de pago">
              <select className="input" value={form.metodoPago} onChange={(e) => set('metodoPago', e.target.value)}>
                <option value="">Sin especificar</option>
                {METODOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Con qué medio paga el cliente.</p>
            </Field>
            {/* Un solo control de moneda para la prima: MontoMoneda trae su
                propio selector (igual que suma asegurada/deducible/monto por
                pago), así que no se duplica un <select> de "Moneda de la
                póliza" aparte. Cambiar la moneda aquí mueve el monto capturado
                entre `primaAnual` (MXN) y `primaMoneda` (divisa); el tipo de
                cambio para convertir a MXN lo resuelve el servidor al guardar,
                nunca lo captura el asesor. */}
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
              <select className="input" value={form.formaPago} onChange={(e) => set('formaPago', e.target.value)}>
                {FORMAS_PAGO_LIST.map((f) => <option key={f} value={f}>{FORMAS_PAGO[f]}</option>)}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cada cuánto se cobra la prima.</p>
            </Field>
            <Field label="Día de pago recurrente (1-28)">
              <input type="number" min="1" max="28" className="input" value={form.diaPago} onChange={(e) => set('diaPago', e.target.value)} />
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
            <Field label="Próximo pago"><DatePicker value={form.fechaProximoPago} onChange={(v) => set('fechaProximoPago', v)} /></Field>
            <Field label="Fecha de firma"><DatePicker value={form.fechaFirma} onChange={(v) => set('fechaFirma', v)} /></Field>
            <Field label="Fecha de emisión"><DatePicker value={form.fechaEmision} onChange={(v) => set('fechaEmision', v)} /></Field>
          </div>

          {/* Domiciliación: apaga los recordatorios de cobro de esta póliza */}
          <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 mt-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.domiciliada}
              onChange={(e) => set('domiciliada', e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Póliza domiciliada</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                El cargo es automático: no se generan recordatorios de cobro para esta póliza.
              </span>
            </span>
          </label>
        </SeccionFicha>

        {/* 4 · Comisión ------------------------------------------------------ */}
        <SeccionFicha numero={4} title="Comisión" subtitle="El porcentaje viene del catálogo del producto y se puede ajustar.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Comisión (%)">
              <input type="number" step="0.1" className="input" value={form.comisionPct} onChange={(e) => set('comisionPct', e.target.value)} />
            </Field>
            <Field label="Comisión estimada">
              <ValorFijo
                title="Calculada sobre la prima anual en pesos. La cifra definitiva la confirma la compañía."
                vacio="Captura la prima anual"
              >
                {comisionEstimada != null ? <span className="tabular-nums">{mxn(comisionEstimada)}</span> : ''}
              </ValorFijo>
              {necesitaTC && comisionEstimada != null && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sobre el equivalente en pesos de la prima al tipo de cambio del día.
                </p>
              )}
            </Field>
          </div>
        </SeccionFicha>

        {/* 5 · Detalle del ramo ---------------------------------------------- */}
        <SeccionFicha numero={5} title="Detalle del ramo" subtitle={`Lo específico de una póliza de ${RAMOS_LABEL[form.ramo] || form.ramo}.`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Plan">
              <input className="input" placeholder="Ej. Plan A, Nacional, Elite" value={form.plan} onChange={(e) => set('plan', e.target.value)} />
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
                  <input className="input" placeholder="Ej. 10% (tope $50,000)" value={form.coaseguro} onChange={(e) => set('coaseguro', e.target.value)} />
                </Field>
              </>
            )}
            {/* Red médica: solo tiene sentido en GMM (el backend la descarta
                en cualquier otro ramo). */}
            {esGMM && (
              <Field label="Red médica">
                <input className="input" placeholder="Ej. Red Alfa, Nacional, Preferente" value={form.redMedica} onChange={(e) => set('redMedica', e.target.value)} />
              </Field>
            )}
          </div>

          {/* Asegurados: quiénes están cubiertos. No confundir con los
              beneficiarios, que son quienes cobran el siniestro. */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Asegurados</label>
              <button type="button" onClick={() => set('asegurados', [...form.asegurados, { nombre: '', parentesco: '', fechaNacimiento: '' }])} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">+ Agregar asegurado</button>
            </div>
            {form.asegurados.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Personas cubiertas por la póliza. Sin filas se entiende que el asegurado es el propio contratante.
              </p>
            ) : (
              <div className="space-y-2">
                {form.asegurados.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2">
                    <input className="input" placeholder="Nombre completo*" value={a.nombre || ''} onChange={(e) => setFila('asegurados', i, 'nombre', e.target.value)} />
                    <input className="input" placeholder="Parentesco" value={a.parentesco || ''} onChange={(e) => setFila('asegurados', i, 'parentesco', e.target.value)} />
                    <DatePicker value={a.fechaNacimiento || ''} onChange={(v) => setFila('asegurados', i, 'fechaNacimiento', v)} placeholder="Nacimiento" />
                    <button type="button" onClick={() => quitarFila('asegurados', i)} className="text-slate-400 hover:text-red-500 px-1" aria-label="quitar asegurado">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coberturas */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Coberturas</label>
              <button type="button" onClick={() => set('coberturas', [...form.coberturas, { nombre: '', detalle: '', monto: '', costo: '' }])} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">+ Agregar cobertura personalizada</button>
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
            {form.coberturas.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">Ej. Fallecimiento (básica) · Suma asegurada · $2,000,000 · sin costo extra</p>}
            {form.coberturas.length > 0 && (
              <div className="grid grid-cols-[1.3fr_1fr_0.8fr_0.7fr_auto] gap-2 mb-1 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cobertura</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Detalle</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Suma asegurada</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" title="Vacío = incluida sin costo extra">Costo extra</span>
                <span />
              </div>
            )}
            <div className="space-y-2">
              {form.coberturas.map((c, i) => {
                const bloqueada = esCoberturaDeCatalogo(c);
                return (
                  <div key={i} className="grid grid-cols-[1.3fr_1fr_0.8fr_0.7fr_auto] gap-2">
                    {bloqueada ? (
                      <ValorFijo title="Definida por el catálogo de la compañía">{c.nombre}</ValorFijo>
                    ) : (
                      <input className="input" placeholder="Cobertura*" value={c.nombre || ''} onChange={(e) => setFila('coberturas', i, 'nombre', e.target.value)} />
                    )}
                    {bloqueada ? (
                      <div className="input flex items-center bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 text-xs" title="Definida por el catálogo de la compañía">{c.detalle}</div>
                    ) : (
                      <input className="input" placeholder="Detalle" value={c.detalle || ''} onChange={(e) => setFila('coberturas', i, 'detalle', e.target.value)} />
                    )}
                    <input className="input" placeholder="$ / Incluida" value={c.monto || ''} onChange={(e) => setFila('coberturas', i, 'monto', e.target.value)} />
                    <div className="flex gap-1">
                      <NumeroFormateado
                        className="flex-1 min-w-0"
                        placeholder="Incluida"
                        title="Costo adicional de contratar esta cobertura. Déjalo vacío si va incluida en la prima."
                        value={c.costo ?? ''}
                        onChange={(v) => setFila('coberturas', i, 'costo', v)}
                      />
                      <select
                        className="input w-[4.5rem] shrink-0 px-1 text-xs"
                        title="Moneda del costo extra"
                        value={c.costoMoneda || 'MXN'}
                        onChange={(e) => setFila('coberturas', i, 'costoMoneda', e.target.value)}
                      >
                        {MONEDAS.map((m) => <option key={m.value} value={m.value}>{m.sufijo}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => quitarFila('coberturas', i)} className="text-slate-400 hover:text-red-500 px-1" aria-label="quitar cobertura">✕</button>
                  </div>
                );
              })}
            </div>
            {costoCoberturas > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                Costo extra de coberturas: <strong className="tabular-nums">{mxn(costoCoberturas)}</strong>
                {' '}· convertido a pesos al tipo de cambio del día; es informativo, la prima anual la capturas arriba.
              </p>
            )}
            {costosSinConvertir && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Hay coberturas con costo en moneda extranjera sin tipo de cambio disponible: no se incluyen en el total.
              </p>
            )}
          </div>

          {/* Beneficiarios */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Beneficiarios</label>
              <button type="button" onClick={() => set('beneficiarios', [...form.beneficiarios, { nombre: '', porcentaje: '' }])} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">+ Agregar beneficiario</button>
            </div>
            {form.beneficiarios.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">Quiénes cobran el siniestro. Los porcentajes suelen sumar 100%.</p>
            )}
            <div className="space-y-2">
              {form.beneficiarios.map((b, i) => (
                <div key={i} className="grid grid-cols-[1.6fr_0.5fr_auto] gap-2">
                  <input className="input" placeholder="Nombre (parentesco)*" value={b.nombre || ''} onChange={(e) => setFila('beneficiarios', i, 'nombre', e.target.value)} />
                  <input type="number" min="0" max="100" className="input" placeholder="%" value={b.porcentaje ?? ''} onChange={(e) => setFila('beneficiarios', i, 'porcentaje', e.target.value)} />
                  <button type="button" onClick={() => quitarFila('beneficiarios', i)} className="text-slate-400 hover:text-red-500 px-1" aria-label="quitar beneficiario">✕</button>
                </div>
              ))}
            </div>
            {form.beneficiarios.length > 0 && sumaPct !== 100 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Los porcentajes suman {sumaPct}% (usualmente deben sumar 100%).</p>
            )}
          </div>

          <div className="mt-5">
            <Field label="Notas">
              <textarea className="input" rows={3} value={form.notas} onChange={(e) => set('notas', e.target.value)} />
            </Field>
          </div>
        </SeccionFicha>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </PantallaCompleta>
  );
}
