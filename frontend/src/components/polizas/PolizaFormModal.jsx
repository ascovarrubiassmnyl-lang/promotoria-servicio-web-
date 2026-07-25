import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import {
  RAMOS, RAMOS_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST,
  ESTADOS_VENTA, ESTADOS_VENTA_LABEL, isoLocalDateInput,
} from '../../lib/format.js';

const VACIO = {
  clienteId: '', ramo: 'VIDA', producto: '', productoCatalogoId: '',
  primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR', formaPago: 'ANUAL',
  sumaAsegurada: '', plazo: '', deducible: '', coaseguro: '',
  fechaFirma: '', fechaInicioVigencia: '', fechaFinVigencia: '',
  fechaProximoPago: '', diaPago: '', montoPago: '', notas: '',
  coberturas: [], beneficiarios: [],
};

const d = (v) => (v ? isoLocalDateInput(new Date(v)) : '');

// Modal único para crear (venta=null) o editar (venta=objeto) una póliza.
// asesorId (opcional): scope de promotor — la póliza nueva se asigna a ese
// asesor y el selector de clientes se limita a su cartera.
export default function PolizaFormModal({ open, onClose, venta = null, asesorId = null, onSaved }) {
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
      sumaAsegurada: venta.sumaAsegurada ?? '',
      plazo: venta.plazo || '',
      deducible: venta.deducible ?? '',
      coaseguro: venta.coaseguro || '',
      fechaFirma: d(venta.fechaFirma),
      fechaInicioVigencia: d(venta.fechaInicioVigencia),
      fechaFinVigencia: d(venta.fechaFinVigencia),
      fechaProximoPago: d(venta.fechaProximoPago),
      diaPago: venta.diaPago ?? '',
      montoPago: venta.montoPago ?? '',
      notas: venta.notas || '',
      coberturas: Array.isArray(venta.coberturas) ? venta.coberturas : [],
      beneficiarios: Array.isArray(venta.beneficiarios) ? venta.beneficiarios : [],
    } : VACIO);
  }, [open, venta]);

  const { data: clientes } = useQuery({
    queryKey: ['clientes-min', asesorId || 'self'],
    queryFn: async () => (await api.get('/clientes', { params: { asesorId: asesorId || undefined } })).data,
    enabled: open && !editando,
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
    setForm((f) => ({ ...f, productoCatalogoId: id, producto: p?.nombre || f.producto, comisionPct: p?.comisionPct ?? f.comisionPct }));
  };

  // Editores de filas dinámicas
  const setFila = (lista, i, campo, valor) => {
    const copia = [...form[lista]];
    copia[i] = { ...copia[i], [campo]: valor };
    set(lista, copia);
  };
  const quitarFila = (lista, i) => set(lista, form[lista].filter((_, x) => x !== i));

  const sumaPct = form.beneficiarios.reduce((s, b) => s + (+b.porcentaje || 0), 0);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      const payload = {
        ramo: form.ramo,
        producto: form.producto,
        productoCatalogoId: form.productoCatalogoId || null,
        primaAnual: form.primaAnual !== '' ? +form.primaAnual : undefined,
        comisionPct: form.comisionPct !== '' ? +form.comisionPct : undefined,
        estado: form.estado,
        formaPago: form.formaPago,
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
        {!editando && (
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
            <input className="input" required value={form.producto} onChange={(e) => set('producto', e.target.value)} />
          </Field>
          <Field label="Prima anual (MXN)*">
            <input type="number" step="0.01" className="input" required value={form.primaAnual} onChange={(e) => set('primaAnual', e.target.value)} />
          </Field>
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
          <Field label="Fecha de firma"><input type="date" className="input" value={form.fechaFirma} onChange={(e) => set('fechaFirma', e.target.value)} /></Field>
          <Field label="Inicio de vigencia"><input type="date" className="input" value={form.fechaInicioVigencia} onChange={(e) => set('fechaInicioVigencia', e.target.value)} /></Field>
          <Field label="Fin de vigencia"><input type="date" className="input" value={form.fechaFinVigencia} onChange={(e) => set('fechaFinVigencia', e.target.value)} /></Field>
          <Field label="Próximo pago"><input type="date" className="input" value={form.fechaProximoPago} onChange={(e) => set('fechaProximoPago', e.target.value)} /></Field>
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

        {/* Coberturas */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Coberturas</label>
            <button type="button" onClick={() => set('coberturas', [...form.coberturas, { nombre: '', detalle: '', monto: '' }])} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">+ Agregar cobertura</button>
          </div>
          {form.coberturas.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">Ej. Fallecimiento (básica) · Suma asegurada · $2,000,000</p>}
          <div className="space-y-2">
            {form.coberturas.map((c, i) => (
              <div key={i} className="grid grid-cols-[1.3fr_1fr_0.8fr_auto] gap-2">
                <input className="input" placeholder="Cobertura*" value={c.nombre || ''} onChange={(e) => setFila('coberturas', i, 'nombre', e.target.value)} />
                <input className="input" placeholder="Detalle" value={c.detalle || ''} onChange={(e) => setFila('coberturas', i, 'detalle', e.target.value)} />
                <input className="input" placeholder="$ / Incluida" value={c.monto || ''} onChange={(e) => setFila('coberturas', i, 'monto', e.target.value)} />
                <button type="button" onClick={() => quitarFila('coberturas', i)} className="text-slate-400 hover:text-red-500 px-1" aria-label="quitar cobertura">✕</button>
              </div>
            ))}
          </div>
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
