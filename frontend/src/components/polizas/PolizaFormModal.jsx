import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field, DatePicker, NumeroFormateado } from '../ui.jsx';
import {
  RAMOS, RAMOS_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST,
  ESTADOS_VENTA, ESTADOS_VENTA_LABEL, isoLocalDateInput, mxn,
} from '../../lib/format.js';
import { MONEDAS, METODOS_PAGO, requiereTipoCambio, infoMoneda, equivalenteMXN } from './tipos.js';
import MontoMoneda from './MontoMoneda.jsx';
import SubirPolizaModal from './SubirPolizaModal.jsx';

const VACIO = {
  clienteId: '', ramo: 'VIDA', producto: '', productoCatalogoId: '',
  primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR', formaPago: 'ANUAL',
  moneda: 'MXN', primaMoneda: '', tipoCambio: '',
  domiciliada: false, metodoPago: '',
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
export default function PolizaFormModal({ open, onClose, venta = null, asesorId = null, clienteId = null, onSaved }) {
  const qc = useQueryClient();
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
  // prellena este mismo formulario) o capturar todo a mano, como ya existía.
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
              Sube el PDF emitido por la compañía: se analiza con IA y este formulario se prellena con los datos que encuentre. Tú revisas y confirmas antes de guardar.
            </span>
          </button>
          <button
            type="button"
            disabled={!clienteElegido}
            onClick={() => setEligiendoOrigen(false)}
            className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500 px-4 py-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="block font-medium text-slate-800 dark:text-slate-100">Capturar los datos manualmente</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Llena el formulario tú mismo, como hoy.</span>
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

  return (
    <Modal open={open} onClose={onClose} title={editando ? `Editar póliza · ${venta.producto}` : 'Nueva póliza'} wide>
      <form onSubmit={submit} className="space-y-3">
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
        {!editando && !clienteId && (
          <Field label="Cliente*">
            <select className="input" required value={form.clienteId} onChange={(e) => set('clienteId', e.target.value)}>
              <option value="">Selecciona…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ramo*">
            <select className="input" required value={form.ramo} onChange={(e) => setForm((f) => ({ ...f, ramo: e.target.value, productoCatalogoId: '', producto: editando ? f.producto : '' }))}>
              {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r] || r}</option>)}
            </select>
          </Field>
          <Field label="Producto del catálogo">
            <select className="input" value={form.productoCatalogoId} onChange={(e) => onProductoCatalogo(e.target.value)}>
              <option value="">— Personalizado —</option>
              {productosPorRamo.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.comisionPct != null ? ` (comisión ${p.comisionPct}%)` : ''}</option>)}
            </select>
          </Field>
          <Field label="Nombre del producto*">
            {nombreBloqueado ? (
              <div
                className="input flex items-center bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-200"
                title="Definido por el catálogo de la compañía. Elige «Personalizado» para escribirlo a mano."
              >{form.producto}</div>
            ) : (
              <input className="input" required value={form.producto} onChange={(e) => set('producto', e.target.value)} />
            )}
          </Field>
          {/* Un solo control de moneda para la prima: MontoMoneda trae su
              propio selector (igual que suma asegurada/deducible/monto por
              pago), así que no se duplica un <select> de "Moneda de la
              póliza" aparte. Cambiar la moneda aquí mueve el monto capturado
              entre `primaAnual` (MXN) y `primaMoneda` (divisa); el tipo de
              cambio para convertir a MXN lo resuelve el servidor al guardar,
              nunca lo captura el asesor. */}
          <Field label="Prima anual*">
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
          <Field label="Comisión (%)">
            <input type="number" step="0.1" className="input" value={form.comisionPct} onChange={(e) => set('comisionPct', e.target.value)} />
          </Field>
          <Field label="Estado">
            <select className="input" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
              {ESTADOS_VENTA.map((x) => <option key={x} value={x}>{ESTADOS_VENTA_LABEL[x]}</option>)}
            </select>
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
          <Field label="Plazo">
            <input className="input" placeholder="Ej. 20 pagos, Anual renovable" value={form.plazo} onChange={(e) => set('plazo', e.target.value)} />
          </Field>
          <Field label="Forma de pago">
            <select className="input" value={form.formaPago} onChange={(e) => set('formaPago', e.target.value)}>
              {FORMAS_PAGO_LIST.map((f) => <option key={f} value={f}>{FORMAS_PAGO[f]}</option>)}
            </select>
          </Field>
          <Field label="Método de pago">
            <select className="input" value={form.metodoPago} onChange={(e) => set('metodoPago', e.target.value)}>
              <option value="">Sin especificar</option>
              {METODOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Fecha de firma"><DatePicker value={form.fechaFirma} onChange={(v) => set('fechaFirma', v)} /></Field>
          <Field label="Fecha de emisión"><DatePicker value={form.fechaEmision} onChange={(v) => set('fechaEmision', v)} /></Field>
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
          <Field label="Próximo pago"><DatePicker value={form.fechaProximoPago} onChange={(v) => set('fechaProximoPago', v)} /></Field>
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
          {(form.ramo === 'GMM' || form.ramo === 'SALUD') && (
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
        </div>

        {/* Domiciliación: apaga los recordatorios de cobro de esta póliza */}
        <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5">
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

        {/* Coberturas */}
        <div>
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
                    <div className="input flex items-center bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-200" title="Definida por el catálogo de la compañía">{c.nombre}</div>
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
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Beneficiarios</label>
            <button type="button" onClick={() => set('beneficiarios', [...form.beneficiarios, { nombre: '', porcentaje: '' }])} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">+ Agregar beneficiario</button>
          </div>
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

        <Field label="Notas">
          <textarea className="input" rows={2} value={form.notas} onChange={(e) => set('notas', e.target.value)} />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
