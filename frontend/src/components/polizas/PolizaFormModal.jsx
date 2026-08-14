import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field, DatePicker } from '../ui.jsx';
import {
  RAMOS, RAMOS_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST,
  ESTADOS_VENTA, ESTADOS_VENTA_LABEL, isoLocalDateInput, mxn,
} from '../../lib/format.js';
import { MONEDAS, METODOS_PAGO, requiereTipoCambio, infoMoneda } from './tipos.js';

const VACIO = {
  clienteId: '', ramo: 'VIDA', producto: '', productoCatalogoId: '',
  primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR', formaPago: 'ANUAL',
  moneda: 'MXN', primaMoneda: '', tipoCambio: '',
  domiciliada: false, metodoPago: '',
  sumaAsegurada: '', plazo: '', deducible: '', coaseguro: '',
  fechaFirma: '', fechaEmision: '', fechaInicioVigencia: '', fechaFinVigencia: '',
  fechaProximoPago: '', diaPago: '', montoPago: '', notas: '',
  coberturas: [], beneficiarios: [],
};

const d = (v) => (v ? isoLocalDateInput(new Date(v)) : '');

// Fin de vigencia sugerido a partir del inicio. Los seguros de la promotoría
// son de vigencia anual (se renuevan cada año); el plazo del producto ("20
// pagos") es el periodo de PAGO, no el de cobertura. El asesor puede
// sobrescribir la fecha: esto solo evita teclearla a mano en el caso normal.
function finDeVigenciaSugerido(inicioISO) {
  if (!inicioISO) return '';
  const [a, m, dia] = inicioISO.split('-').map(Number);
  if (!a || !m || !dia) return '';
  const fin = new Date(a + 1, m - 1, dia);
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

  useEffect(() => {
    if (!open) return;
    setErr('');
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
      plazo: venta.plazo || '',
      deducible: venta.deducible ?? '',
      coaseguro: venta.coaseguro || '',
      fechaFirma: d(venta.fechaFirma),
      fechaEmision: d(venta.fechaEmision),
      fechaInicioVigencia: d(venta.fechaInicioVigencia),
      fechaFinVigencia: d(venta.fechaFinVigencia),
      fechaProximoPago: d(venta.fechaProximoPago),
      diaPago: venta.diaPago ?? '',
      montoPago: venta.montoPago ?? '',
      notas: venta.notas || '',
      coberturas: Array.isArray(venta.coberturas) ? venta.coberturas : [],
      beneficiarios: Array.isArray(venta.beneficiarios) ? venta.beneficiarios : [],
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
      return {
        ...f,
        productoCatalogoId: id,
        producto: p?.nombre || f.producto,
        comisionPct: p?.comisionPct ?? f.comisionPct,
        // El plazo del producto elegido manda: si el nombre lo declara, se
        // actualiza aunque ya hubiera un valor (el anterior era de otro plazo).
        plazo: plazoSugerido || f.plazo,
        moneda,
        // Al cambiar a divisa, el monto capturado pasa al campo de moneda original.
        primaMoneda: requiereTipoCambio(moneda) ? (f.primaMoneda || f.primaAnual) : '',
        tipoCambio: requiereTipoCambio(moneda) ? f.tipoCambio : '',
      };
    });
  };

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

  // Conversión de moneda. `primaAnual` viaja SIEMPRE en MXN al backend; aquí
  // solo se calcula la vista previa de lo que se va a guardar.
  const necesitaTC = requiereTipoCambio(form.moneda);
  const primaEnPesos = necesitaTC
    ? (+form.primaMoneda || 0) * (+form.tipoCambio || 0)
    : (+form.primaAnual || 0);
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
  // Costo extra sumado de las coberturas marcadas con costo (informativo: la
  // prima la captura el asesor, no se deriva de aquí).
  const costoCoberturas = form.coberturas.reduce((s, c) => s + (+c.costo || 0), 0);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    if (necesitaTC && !(+form.tipoCambio > 0)) {
      setSaving(false);
      setErr('Captura el tipo de cambio para convertir la prima a pesos.');
      return;
    }
    try {
      const payload = {
        ramo: form.ramo,
        producto: form.producto,
        productoCatalogoId: form.productoCatalogoId || null,
        // La prima siempre viaja en MXN; el backend recalcula con el TC.
        primaAnual: necesitaTC
          ? (primaEnPesos || undefined)
          : (form.primaAnual !== '' ? +form.primaAnual : undefined),
        moneda: form.moneda,
        primaMoneda: necesitaTC && form.primaMoneda !== '' ? +form.primaMoneda : null,
        tipoCambio: necesitaTC && form.tipoCambio !== '' ? +form.tipoCambio : null,
        comisionPct: form.comisionPct !== '' ? +form.comisionPct : undefined,
        estado: form.estado,
        formaPago: form.formaPago,
        domiciliada: form.domiciliada === true,
        metodoPago: form.metodoPago || null,
        fechaEmision: form.fechaEmision || null,
        sumaAsegurada: form.sumaAsegurada !== '' ? +form.sumaAsegurada : null,
        plazo: form.plazo || null,
        deducible: form.deducible !== '' ? +form.deducible : null,
        coaseguro: form.coaseguro || null,
        fechaFirma: form.fechaFirma || null,
        fechaInicioVigencia: form.fechaInicioVigencia || null,
        fechaFinVigencia: form.fechaFinVigencia || null,
        fechaProximoPago: form.fechaProximoPago || null,
        diaPago: form.diaPago !== '' ? +form.diaPago : null,
        montoPago: form.montoPago !== '' ? +form.montoPago : null,
        notas: form.notas || null,
        coberturas: form.coberturas,
        beneficiarios: form.beneficiarios,
      };
      if (editando) {
        await api.patch(`/ventas/${venta.id}`, payload);
        qc.invalidateQueries(['poliza', venta.id]);
      } else {
        await api.post('/ventas', { ...payload, clienteId: form.clienteId, asesorId: asesorId || undefined });
      }
      qc.invalidateQueries(['ventas']);
      qc.invalidateQueries(['equipo-resumen']);
      onSaved?.();
      onClose();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editando ? `Editar póliza · ${venta.producto}` : 'Nueva póliza'} wide>
      <form onSubmit={submit} className="space-y-3">
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
          <Field label="Moneda de la póliza">
            <select
              className="input"
              title={monedasDelProducto ? 'Monedas en que la compañía ofrece este producto' : undefined}
              value={form.moneda}
              onChange={(e) => {
                const moneda = e.target.value;
                setForm((f) => ({
                  ...f,
                  moneda,
                  // Al pasar a divisa, el monto capturado se mueve al campo de
                  // la moneda original; al volver a pesos se limpian TC y monto.
                  primaMoneda: requiereTipoCambio(moneda) ? (f.primaMoneda || f.primaAnual) : '',
                  tipoCambio: requiereTipoCambio(moneda) ? f.tipoCambio : '',
                }));
              }}
            >
              {(monedasDelProducto || MONEDAS).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          {necesitaTC ? (
            <>
              <Field label={`Prima anual (${infoMoneda(form.moneda).sufijo})*`}>
                <input type="number" step="0.01" className="input" required value={form.primaMoneda} onChange={(e) => set('primaMoneda', e.target.value)} />
              </Field>
              <Field label={`Tipo de cambio (1 ${infoMoneda(form.moneda).sufijo} = MXN)*`}>
                <input type="number" step="0.0001" className="input" required value={form.tipoCambio} onChange={(e) => set('tipoCambio', e.target.value)} placeholder="Ej. 17.50" />
              </Field>
            </>
          ) : (
            <Field label="Prima anual (MXN)*">
              <input type="number" step="0.01" className="input" required value={form.primaAnual} onChange={(e) => set('primaAnual', e.target.value)} />
            </Field>
          )}
          <Field label="Comisión (%)">
            <input type="number" step="0.1" className="input" value={form.comisionPct} onChange={(e) => set('comisionPct', e.target.value)} />
          </Field>
          <Field label="Estado">
            <select className="input" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
              {ESTADOS_VENTA.map((x) => <option key={x} value={x}>{ESTADOS_VENTA_LABEL[x]}</option>)}
            </select>
          </Field>
          <Field label="Suma asegurada (MXN)">
            <input type="number" step="0.01" className="input" value={form.sumaAsegurada} onChange={(e) => set('sumaAsegurada', e.target.value)} />
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
                // Fin de vigencia automático: solo si aún está vacío, para no
                // pisar un ajuste manual del asesor.
                fechaFinVigencia: f.fechaFinVigencia || finDeVigenciaSugerido(v),
              }))}
            />
          </Field>
          <Field label="Fin de vigencia">
            <DatePicker value={form.fechaFinVigencia} onChange={(v) => set('fechaFinVigencia', v)} />
          </Field>
          <Field label="Próximo pago"><DatePicker value={form.fechaProximoPago} onChange={(v) => set('fechaProximoPago', v)} /></Field>
          <Field label="Día de pago recurrente (1-28)">
            <input type="number" min="1" max="28" className="input" value={form.diaPago} onChange={(e) => set('diaPago', e.target.value)} />
          </Field>
          <Field label="Monto por pago (MXN)">
            <input type="number" step="0.01" className="input" value={form.montoPago} onChange={(e) => set('montoPago', e.target.value)} />
          </Field>
          {(form.ramo === 'GMM' || form.ramo === 'SALUD') && (
            <>
              <Field label="Deducible (MXN)">
                <input type="number" step="0.01" className="input" value={form.deducible} onChange={(e) => set('deducible', e.target.value)} />
              </Field>
              <Field label="Coaseguro">
                <input className="input" placeholder="Ej. 10% (tope $50,000)" value={form.coaseguro} onChange={(e) => set('coaseguro', e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {/* Conversión de moneda: se guarda en pesos porque es la cifra que
            suman comisiones, metas y ranking. */}
        {necesitaTC && primaEnPesos > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
            Se guardará como <strong className="tabular-nums">{mxn(primaEnPesos)}</strong> en pesos
            (la comisión y las metas siempre se calculan en MXN).
          </p>
        )}

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
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="Incluida"
                    title="Costo adicional en MXN. Déjalo vacío si la cobertura va incluida en la prima."
                    value={c.costo ?? ''}
                    onChange={(e) => setFila('coberturas', i, 'costo', e.target.value)}
                  />
                  <button type="button" onClick={() => quitarFila('coberturas', i)} className="text-slate-400 hover:text-red-500 px-1" aria-label="quitar cobertura">✕</button>
                </div>
              );
            })}
          </div>
          {costoCoberturas > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Costo extra de coberturas: <strong className="tabular-nums">{mxn(costoCoberturas)}</strong>
              {' '}· es informativo, la prima anual la capturas arriba.
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
