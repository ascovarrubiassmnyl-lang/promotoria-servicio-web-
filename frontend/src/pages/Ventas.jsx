import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Drawer, Field, VentaBadge, EmptyState, Badge, Stat } from '../components/ui.jsx';
import { mxn, fechaCorta, fechaHora, ESTADOS_VENTA_LABEL, ESTADOS_VENTA, RAMOS, RAMOS_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST, isoLocalDateInput } from '../lib/format.js';

export default function Ventas() {
  const { esAdmin } = useAuth();
  const qc = useQueryClient();
  const [asesorId, setAsesorId] = useState('');
  const [estado, setEstado] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    clienteId: '', ramo: 'VIDA', producto: '', productoCatalogoId: '',
    primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR',
    formaPago: 'ANUAL', fechaInicioVigencia: '', fechaFinVigencia: '',
    fechaProximoPago: '', diaPago: '', montoPago: '', notas: '',
  });

  const [polizaSel, setPolizaSel] = useState(null);

  const { data: ventas } = useQuery({
    queryKey: ['ventas', asesorId, estado],
    queryFn: async () => (await api.get('/ventas', { params: { asesorId: asesorId || undefined, estado: estado || undefined } })).data,
  });
  const { data: clientes } = useQuery({ queryKey: ['clientes-min'], queryFn: async () => (await api.get('/clientes')).data });
  const { data: asesores } = useQuery({ queryKey: ['asesores-list'], queryFn: async () => (await api.get('/usuarios/asesores')).data, enabled: esAdmin() });
  const { data: catalogo } = useQuery({ queryKey: ['productos-catalogo'], queryFn: async () => (await api.get('/productos-catalogo', { params: { soloActivos: true } })).data });

  // Productos del catálogo filtrados por ramo seleccionado en el form
  const productosPorRamo = useMemo(() => (catalogo || []).filter((p) => p.ramo === form.ramo), [catalogo, form.ramo]);

  const onRamoChange = (ramo) => {
    setForm({ ...form, ramo, productoCatalogoId: '', producto: '' });
  };
  const onProductoCatalogo = (id) => {
    const p = catalogo?.find((x) => x.id === id);
    setForm({
      ...form,
      productoCatalogoId: id,
      producto: p?.nombre || '',
      comisionPct: p?.comisionPct ?? form.comisionPct,
    });
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      const payload = {
        ...form,
        primaAnual: form.primaAnual ? +form.primaAnual : undefined,
        comisionPct: form.comisionPct ? +form.comisionPct : undefined,
        diaPago: form.diaPago ? +form.diaPago : undefined,
        montoPago: form.montoPago ? +form.montoPago : undefined,
        fechaInicioVigencia: form.fechaInicioVigencia || undefined,
        fechaFinVigencia: form.fechaFinVigencia || undefined,
        fechaProximoPago: form.fechaProximoPago || undefined,
      };
      await api.post('/ventas', payload);
      setOpen(false);
      setForm({ clienteId: '', ramo: 'VIDA', producto: '', productoCatalogoId: '', primaAnual: '', comisionPct: 10, estado: 'PENDIENTE_PAGAR', formaPago: 'ANUAL', fechaInicioVigencia: '', fechaFinVigencia: '', fechaProximoPago: '', diaPago: '', montoPago: '', notas: '' });
      qc.invalidateQueries(['ventas']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const cambiarEstado = async (v, estado) => {
    try { await api.patch(`/ventas/${v.id}`, { estado }); qc.invalidateQueries(['ventas']); } catch (e) { alert(handleError(e)); }
  };

  const aprobada = ventas?.filter((v) => v.estado === 'APROBADA' || v.estado === 'PAGADA') || [];
  const totalPrima = aprobada.reduce((a, v) => a + v.primaAnual, 0);
  const totalCom = aprobada.reduce((a, v) => a + (v.comisionMonto || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Pólizas</h2>
        <button onClick={() => setOpen(true)} className="btn-primary">+ Nueva póliza</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat title="Aprobadas / Pagadas" value={aprobada.length} color="green" subtitle={`${ventas?.length || 0} pólizas en total`} />
        <Stat title="Prima anual total" value={mxn(totalPrima)} color="brand" />
        <Stat title="Comisión total" value={mxn(totalCom)} color="green" />
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <select className="input w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
                  {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{ESTADOS_VENTA_LABEL[e]}</option>)}
          </select>
          {esAdmin() && (
            <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
              <option value="">Todos los asesores</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          )}
        </div>

        {!ventas || ventas.length === 0 ? <EmptyState message="Sin pólizas" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Producto (ramo)</th>
                <th className="py-2 pr-4">Cliente</th>
                {esAdmin() && <th className="py-2 pr-4">Asesor</th>}
                <th className="py-2 pr-4 text-right">Prima</th>
                <th className="py-2 pr-4 text-right">Comisión</th>
                <th className="py-2 pr-4">Forma pago</th>
                <th className="py-2 pr-4">Próx. pago</th>
                <th className="py-2 pr-4">Estado</th>
              </tr></thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                    <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{fechaCorta(v.creadoEn)}</td>
                    <td className="py-2 pr-4">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{v.producto}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{RAMOS_LABEL[v.ramo] || v.ramo}</p>
                    </td>
                    <td className="py-2 pr-4">
                      <button onClick={() => setPolizaSel(v)} className="text-left hover:text-brand-600 dark:hover:text-brand-400">
                        <p className="font-medium">{v.cliente?.nombre} {v.cliente?.apellidoP}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Ver ficha técnica ↗</p>
                      </button>
                    </td>
                    {esAdmin() && <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{v.asesor?.nombre} {v.asesor?.apellidoP}</td>}
                    <td className="py-2 pr-4 text-right">{mxn(v.primaAnual)}</td>
                    <td className="py-2 pr-4 text-right text-emerald-600">{mxn(v.comisionMonto)}</td>
                    <td className="py-2 pr-4"><span className="badge bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300">{FORMAS_PAGO[v.formaPago] || v.formaPago}</span></td>
                    <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{v.fechaProximoPago ? fechaCorta(v.fechaProximoPago) : '—'}</td>
                    <td className="py-2 pr-4">
                      {esAdmin() ? (
                        <select className="input w-auto py-1 text-xs" value={v.estado} onChange={(e) => cambiarEstado(v, e.target.value)}>
            {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{ESTADOS_VENTA_LABEL[e]}</option>)}
                        </select>
                      ) : <VentaBadge estado={v.estado} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva póliza">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Cliente*">
            <select className="input" required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Selecciona…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ramo*">
              <select className="input" required value={form.ramo} onChange={(e) => onRamoChange(e.target.value)}>
                {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Producto del catálogo">
              <select className="input" value={form.productoCatalogoId} onChange={(e) => onProductoCatalogo(e.target.value)}>
                <option value="">— Personalizado —</option>
                {productosPorRamo.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.comisionPct != null ? ` (comisión ${p.comisionPct}%)` : ''}</option>)}
              </select>
            </Field>
            <Field label="Nombre del producto*" >
              <input className="input" required value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} placeholder={productosPorRamo.length ? 'Viene del catálogo' : 'Ej. Póliza personalizada'} />
            </Field>
            <Field label="Prima anual (MXN)*">
              <input type="number" step="0.01" className="input" required value={form.primaAnual} onChange={(e) => setForm({ ...form, primaAnual: e.target.value })} />
            </Field>
            <Field label="Comisión (%)">
              <input type="number" step="0.1" className="input" value={form.comisionPct} onChange={(e) => setForm({ ...form, comisionPct: e.target.value })} />
            </Field>
            <Field label="Forma de pago">
              <select className="input" value={form.formaPago} onChange={(e) => setForm({ ...form, formaPago: e.target.value })}>
                {FORMAS_PAGO_LIST.map((f) => <option key={f} value={f}>{FORMAS_PAGO[f]}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{ESTADOS_VENTA_LABEL[e]}</option>)}
              </select>
            </Field>
            <Field label="Inicio de vigencia"><input type="date" className="input" value={form.fechaInicioVigencia} onChange={(e) => setForm({ ...form, fechaInicioVigencia: e.target.value })} /></Field>
            <Field label="Fin de vigencia"><input type="date" className="input" value={form.fechaFinVigencia} onChange={(e) => setForm({ ...form, fechaFinVigencia: e.target.value })} /></Field>
            <Field label="Día de pago recurrente (1-28)">
              <input type="number" min="1" max="28" className="input" value={form.diaPago} onChange={(e) => setForm({ ...form, diaPago: e.target.value })} />
            </Field>
            <Field label="Monto por pago (MXN)">
              <input type="number" step="0.01" className="input" value={form.montoPago} onChange={(e) => setForm({ ...form, montoPago: e.target.value })} />
            </Field>
            <Field label="Próximo pago">
              <input type="date" className="input" value={form.fechaProximoPago} onChange={(e) => setForm({ ...form, fechaProximoPago: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Si capturas <strong>forma de pago</strong> recurrente (mensual/trimestral/semestral/anual) y <strong>próximo pago</strong>, el sistema generará automáticamente recordatorios push cuando se acerque cada fecha y encadenará el siguiente recordatorio según el periodo.
          </p>
          <Field label="Notas">
            <textarea className="input" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <FichaTecnicaPoliza poliza={polizaSel} onClose={() => setPolizaSel(null)} esAdmin={esAdmin} />
    </div>
  );
}

function FichaTecnicaPoliza({ poliza, onClose, esAdmin }) {
  const qc = useQueryClient();
  const open = !!poliza;
  const [edit, setEdit] = useState(false);
  const [patch, setPatch] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Siempre cargar la póliza completa con sus recordatorios
  const { data: polizaFull } = useQuery({
    queryKey: ['poliza', poliza?.id],
    queryFn: async () => (await api.get(`/ventas/${poliza?.id}`)).data,
    enabled: !!poliza,
  });

  if (!open) return null;
  const data = polizaFull || poliza;

  const startEdit = () => {
    setEdit(true);
    setPatch({
      formaPago: data.formaPago,
      fechaInicioVigencia: data.fechaInicioVigencia ? isoLocalDateInput(new Date(data.fechaInicioVigencia)) : '',
      fechaFinVigencia: data.fechaFinVigencia ? isoLocalDateInput(new Date(data.fechaFinVigencia)) : '',
      fechaProximoPago: data.fechaProximoPago ? isoLocalDateInput(new Date(data.fechaProximoPago)) : '',
      diaPago: data.diaPago ?? '',
      montoPago: data.montoPago ?? '',
      estado: data.estado,
      notas: data.notas || '',
      comisionPct: data.comisionPct,
      primaAnual: data.primaAnual,
    });
  };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const payload = {
        ...patch,
        primaAnual: patch.primaAnual ? +patch.primaAnual : undefined,
        comisionPct: patch.comisionPct ? +patch.comisionPct : undefined,
        diaPago: patch.diaPago ? +patch.diaPago : undefined,
        montoPago: patch.montoPago ? +patch.montoPago : undefined,
        fechaInicioVigencia: patch.fechaInicioVigencia || null,
        fechaFinVigencia: patch.fechaFinVigencia || null,
        fechaProximoPago: patch.fechaProximoPago || null,
      };
      await api.patch(`/ventas/${data.id}`, payload);
      setEdit(false);
      qc.invalidateQueries(['poliza', poliza?.id]);
      qc.invalidateQueries(['ventas']);
    } catch (e) { setErr(handleError(e)); } finally { setSaving(false); }
  };

  const confirmarCobro = async () => {
    if (!confirm('¿Confirmas que el cliente pagó este período? Se generará el siguiente recordatorio de pago automáticamente.')) return;
    try {
      await api.post(`/ventas/${data.id}/cobroconfirmado`);
      qc.invalidateQueries(['poliza', poliza?.id]);
      qc.invalidateQueries(['ventas']);
    } catch (e) { alert(handleError(e)); }
  };

  const productoCatalogo = data.productoCatalogo;
  const recordatorios = data.recordatoriosPago || [];

  return (
    <Drawer open={open} onClose={onClose} title="Ficha técnica de póliza" wide>
      <div className="space-y-5">
        {/* Header producto */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{RAMOS_LABEL[data.ramo] || data.ramo}</p>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{data.producto}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Seguros Monterrey New York Life</p>
          </div>
          <VentaBadge estado={data.estado} />
        </div>

        {/* Cliente */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Cliente</p>
          <p className="font-medium text-slate-800 dark:text-slate-100">{data.cliente?.nombre} {data.cliente?.apellidoP} {data.cliente?.apellidoM || ''}</p>
          {data.cliente?.telefono && <p className="text-sm text-slate-600 dark:text-slate-300">📞 {data.cliente.telefono}</p>}
          {data.cliente?.email && <p className="text-sm text-slate-600 dark:text-slate-300">✉ {data.cliente.email}</p>}
          {data.cliente?.rfc && <p className="text-sm text-slate-600 dark:text-slate-300">RFC: {data.cliente.rfc}</p>}
          {data.cliente?.direccion && <p className="text-sm text-slate-600 dark:text-slate-300">{data.cliente.direccion}</p>}
        </div>

        {/* Ficha técnica del catálogo */}
        {productoCatalogo && (
          <div className="rounded-lg border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Descripción del producto</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{productoCatalogo.descripcion || '—'}</p>
            {productoCatalogo.codigo && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Código interno: {productoCatalogo.codigo}</p>}
          </div>
        )}

        {/* Datos financieros */}
        <div className="grid grid-cols-2 gap-4">
          <Card><p className="text-xs uppercase text-slate-500 dark:text-slate-400">Prima anual</p><p className="text-xl font-bold text-brand-600 dark:text-brand-400">{mxn(data.primaAnual)}</p></Card>
          <Card><p className="text-xs uppercase text-slate-500 dark:text-slate-400">Comisión ({data.comisionPct}%)</p><p className="text-xl font-bold text-emerald-600">{mxn(data.comisionMonto)}</p></Card>
        </div>

        {/* Vigencia y pagos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Vigencia y pagos</h4>
            {!edit ? (
              <button onClick={startEdit} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Editar</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEdit(false)} className="btn-secondary !py-1 !px-2 text-xs">Cancelar</button>
                <button onClick={save} disabled={saving} className="btn-primary !py-1 !px-2 text-xs">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            )}
          </div>

          {!edit ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detalle label="Forma de pago" valor={FORMAS_PAGO[data.formaPago] || data.formaPago} />
              <Detalle label="Monto por pago" valor={data.montoPago ? mxn(data.montoPago) : '—'} />
              <Detalle label="Día de pago" valor={data.diaPago ? `Día ${data.diaPago}` : '—'} />
              <Detalle label="Estado actual" valor={<VentaBadge estado={data.estado} />} />
              <Detalle label="Inicio vigencia" valor={data.fechaInicioVigencia ? fechaCorta(data.fechaInicioVigencia) : '—'} />
              <Detalle label="Fin vigencia" valor={data.fechaFinVigencia ? fechaCorta(data.fechaFinVigencia) : '—'} />
              <Detalle label="Fecha firma" valor={data.fechaFirma ? fechaCorta(data.fechaFirma) : '—'} />
              <Detalle label="Fecha pago inicial" valor={data.fechaPago ? fechaCorta(data.fechaPago) : '—'} />
              <Detalle label="Entrega póliza" valor={data.fechaEntregaPoliza ? fechaCorta(data.fechaEntregaPoliza) : '—'} />
              <Detalle label="Próximo pago" valor={data.fechaProximoPago ? fechaCorta(data.fechaProximoPago) : '—'} highlight />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Forma de pago">
                <select className="input" value={patch.formaPago} onChange={(e) => setPatch({ ...patch, formaPago: e.target.value })}>
                  {FORMAS_PAGO_LIST.map((f) => <option key={f} value={f}>{FORMAS_PAGO[f]}</option>)}
                </select>
              </Field>
              <Field label="Estado">
                <select className="input" value={patch.estado} onChange={(e) => setPatch({ ...patch, estado: e.target.value })}>
                          {ESTADOS_VENTA.map((e) => <option key={e} value={e}>{ESTADOS_VENTA_LABEL[e]}</option>)}
                </select>
              </Field>
              <Field label="Prima anual"><input type="number" step="0.01" className="input" value={patch.primaAnual} onChange={(e) => setPatch({ ...patch, primaAnual: e.target.value })} /></Field>
              <Field label="Comisión (%)"><input type="number" step="0.1" className="input" value={patch.comisionPct} onChange={(e) => setPatch({ ...patch, comisionPct: e.target.value })} /></Field>
              <Field label="Inicio vigencia"><input type="date" className="input" value={patch.fechaInicioVigencia} onChange={(e) => setPatch({ ...patch, fechaInicioVigencia: e.target.value })} /></Field>
              <Field label="Fin vigencia"><input type="date" className="input" value={patch.fechaFinVigencia} onChange={(e) => setPatch({ ...patch, fechaFinVigencia: e.target.value })} /></Field>
              <Field label="Día de pago (1-28)"><input type="number" min="1" max="28" className="input" value={patch.diaPago} onChange={(e) => setPatch({ ...patch, diaPago: e.target.value })} /></Field>
              <Field label="Monto por pago"><input type="number" step="0.01" className="input" value={patch.montoPago} onChange={(e) => setPatch({ ...patch, montoPago: e.target.value })} /></Field>
              <Field label="Próximo pago"><input type="date" className="input" value={patch.fechaProximoPago} onChange={(e) => setPatch({ ...patch, fechaProximoPago: e.target.value })} /></Field>
              <Field label="Notas"><textarea className="input" rows={2} value={patch.notas} onChange={(e) => setPatch({ ...patch, notas: e.target.value })} /></Field>
              {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
            </div>
          )}
        </div>

        {/* Próximo pago: llamada a la acción */}
        {data.formaPago !== 'UNICO' && data.fechaProximoPago && (
          <div className="rounded-lg bg-brand-50 dark:bg-brand-900/30 p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase text-brand-700 dark:text-brand-300">Próximo cobro al cliente</p>
              <p className="text-lg font-bold text-brand-700 dark:text-brand-200">{fechaCorta(data.fechaProximoPago)}</p>
              <p className="text-xs text-brand-700/80 dark:text-brand-300/80">
                Recibirás una notificación push automática el día del cobro; tras notificar el sistema agenda el siguiente recordatorio según la forma de pago.
              </p>
            </div>
            <button onClick={confirmarCobro} className="btn-primary text-sm">Confirmar cobro recibido</button>
          </div>
        )}

        {/* Recordatorios asociados */}
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Recordatorios de pago ({recordatorios.length})</h4>
          {recordatorios.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No se han generado recordatorios. Configura "Próximo pago" para activarlos.</p>
          ) : (
            <div className="space-y-1.5">
              {recordatorios.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm rounded-md border border-slate-100 dark:border-slate-700 p-2">
                  <div>
                    <p className="text-slate-700 dark:text-slate-200">{r.texto}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Fecha aviso: {r.fechaAviso ? fechaHora(r.fechaAviso) : '—'}</p>
                  </div>
                  <Badge color={r.completada ? 'green' : (r.notificacionEnviada ? 'blue' : 'amber')}>
                    {r.completada ? 'Completado' : (r.notificacionEnviada ? 'Notificado' : 'Pendiente')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asesor (solo admin) */}
        {esAdmin() && data.asesor && (
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Asesor responsable</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{data.asesor.nombre} {data.asesor.apellidoP}</p>
            {data.validador && <p className="text-xs text-slate-500 dark:text-slate-400">Validado por {data.validador.nombre}</p>}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
        </div>
      </div>
    </Drawer>
  );
}

function Detalle({ label, valor, highlight = false }) {
  return (
    <div className={`rounded-md p-2.5 ${highlight ? 'bg-brand-50 dark:bg-brand-900/30' : 'bg-slate-50 dark:bg-slate-700/40'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{valor}</div>
    </div>
  );
}
