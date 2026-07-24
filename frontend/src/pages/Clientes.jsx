import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Field, EmptyState, ClienteBadge } from '../components/ui.jsx';
import { ESTADOS_CLIENTE, ESTADOS_CLIENTE_LABEL, RAMOS_LABEL } from '../lib/format.js';

const ESTADOS = ESTADOS_CLIENTE;

export default function Clientes() {
  const { esAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [asesorId, setAsesorId] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellidoP: '', apellidoM: '', email: '', telefono: '', estado: 'PROSPECTO', notas: '', fuente: '', productoInteres: '', productoCatalogoId: '', detalleInteres: '', referidoPorId: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { data: clientes, refetch, isFetching } = useQuery({
    queryKey: ['clientes', q, estado, asesorId],
    queryFn: async () => {
      const params = {};
      if (q) params.q = q;
      if (estado) params.estado = estado;
      if (asesorId) params.asesorId = asesorId;
      const { data } = await api.get('/clientes', { params });
      return data;
    },
  });

  const { data: productosCatalogo } = useQuery({
    queryKey: ['productos-catalogo'],
    queryFn: async () => (await api.get('/productos-catalogo')).data,
  });

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = { ...form };
      if (!payload.productoInteres) delete payload.productoInteres;
      if (!payload.referidoPorId) delete payload.referidoPorId;
      delete payload.productoCatalogoId;
      delete payload.__editId;
      await api.post('/clientes', { ...payload, asesorId: asesorId || undefined });
      setOpen(false);
      setForm({ nombre: '', apellidoP: '', apellidoM: '', email: '', telefono: '', estado: 'PROSPECTO', notas: '', fuente: '', productoInteres: '', productoCatalogoId: '', detalleInteres: '', referidoPorId: '' });
      refetch();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/clientes/${toDelete.id}`);
      setToDelete(null);
      qc.invalidateQueries(['clientes']);
    } catch (e) {
      alert(handleError(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Clientes</h2>
        <button onClick={() => setOpen(true)} className="btn-primary">+ Nuevo cliente</button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3">
          <input className="input flex-1 min-w-[200px]" placeholder="Buscar por nombre, email, teléfono, RFC…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS_CLIENTE_LABEL[e]}</option>)}
          </select>
          {esAdmin() && (
            <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
              <option value="">Todos los asesores</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          )}
        </div>
      </Card>

      <Card>
        {isFetching ? (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : !clientes || clientes.length === 0 ? (
          <EmptyState message="No hay clientes que mostrar" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Contacto</th>
                  {esAdmin() && <th className="py-2 pr-4">Asesor</th>}
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Citas</th>
                  <th className="py-2 pr-4 text-right">Ventas</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                    <td className="py-2 pr-4">
                      <Link to={`/clientes/${c.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{c.nombre} {c.apellidoP} {c.apellidoM || ''}</Link>
                      {c.fuente && <p className="text-xs text-slate-400 dark:text-slate-500">Fuente: {c.fuente}</p>}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                      {c.telefono && <p>{c.telefono}</p>}
                      {c.email && <p className="text-xs">{c.email}</p>}
                    </td>
                    {esAdmin() && <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{c.asesor?.nombre} {c.asesor?.apellidoP}</td>}
                    <td className="py-2 pr-4"><ClienteBadge estado={c.estado} /></td>
                    <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-300">{c._count?.citas || 0}</td>
                    <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-300">{c._count?.ventas || 0}</td>
                    <td className="py-2 pr-4 text-right">
                      <button
                        onClick={() => setToDelete(c)}
                        className="text-red-600 hover:text-red-700 hover:underline text-xs"
                        title="Eliminar cliente"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cliente">
        <form onSubmit={submit} className="space-y-3">
          {esAdmin() && asesores?.length > 0 && (
            <Field label="Asesor asignado">
              <select className="input" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
                <option value="">Sin especificar</option>
                {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre*"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Apellido paterno*"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
            <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Estado"><select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS_CLIENTE_LABEL[e]}</option>)}</select></Field>
            <Field label="Fuente"><input className="input" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} placeholder="Referido, Facebook, etc." /></Field>
          </div>

          {/* Producto de interés — catálogo de productos NYL */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mt-1">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Producto de interés (Seguros Monterrey NYL)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ramo">
                <select
                  className="input"
                  value={form.productoInteres || ''}
                  onChange={(e) => setForm({ ...form, productoInteres: e.target.value, productoCatalogoId: '' })}
                >
                  <option value="">Sin seleccionar</option>
                  {Object.entries(RAMOS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Producto específico">
                <select
                  className="input"
                  value={form.productoCatalogoId || ''}
                  onChange={(e) => {
                    const prod = productosCatalogo?.find((p) => p.id === e.target.value);
                    setForm({ ...form, productoCatalogoId: e.target.value, detalleInteres: prod ? `${prod.nombre} (${RAMOS_LABEL[prod.ramo]})` : form.detalleInteres });
                  }}
                  disabled={!form.productoInteres}
                >
                  <option value="">{form.productoInteres ? '— elegir producto —' : 'Primero elige ramo'}</option>
                  {productosCatalogo?.filter((p) => p.ramo === form.productoInteres).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.comisionPct ? ` · comisión ${p.comisionPct}%` : ''}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Detalle de interés">
              <textarea className="input" rows={2} value={form.detalleInteres || ''} onChange={(e) => setForm({ ...form, detalleInteres: e.target.value })} placeholder="Ej: Busca protección familiar, prima mensual estimada $1,500" />
            </Field>
          </div>

          {/* Referidos */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mt-1">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Referido por</p>
            <Field label="¿Quién lo refirió? (opcional)">
              <select className="input" value={form.referidoPorId || ''} onChange={(e) => setForm({ ...form, referidoPorId: e.target.value })}>
                <option value="">Ninguno / captación directa</option>
                {clientes?.filter((c) => c.id !== form.__editId).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP} {c.apellidoM || ''}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notas"><textarea className="input" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cliente">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Seguro que deseas eliminar a <strong>{toDelete.nombre} {toDelete.apellidoP}</strong>?
              Esta acción también borrará sus citas y ventas asociadas y no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setToDelete(null)} className="btn-secondary">Cancelar</button>
              <button
                type="button"
                onClick={confirmarEliminar}
                disabled={deleting}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
