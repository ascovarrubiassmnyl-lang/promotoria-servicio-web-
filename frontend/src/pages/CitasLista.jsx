import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Field, CitaBadge, EmptyState } from '../components/ui.jsx';
import { fechaHora, hora } from '../lib/format.js';

const TIPOS = ['TELEFONICA', 'VIDEO', 'PRESENCIAL'];
const ESTADOS = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'];

function isoLocalInput(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 16);
}

export function CitasLista() {
  const { esAdmin } = useAuth();
  const qc = useQueryClient();
  const [asesorId, setAsesorId] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ clienteId: '', titulo: '', descripcion: '', tipo: 'TELEFONICA', fechaHoraInicio: '', fechaHoraFin: '', ubicacion: '', estado: 'PROGRAMADA' });

  const { data: citas } = useQuery({
    queryKey: ['citas', asesorId],
    queryFn: async () => (await api.get('/citas', { params: asesorId ? { asesorId } : {} })).data,
  });
  const { data: clientes } = useQuery({
    queryKey: ['clientes-min'],
    queryFn: async () => (await api.get('/clientes')).data,
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
      const inicio = new Date(form.fechaHoraInicio);
      const fin = form.fechaHoraFin ? new Date(form.fechaHoraFin) : null;
      await api.post('/citas', { ...form, fechaHoraInicio: inicio.toISOString(), fechaHoraFin: fin ? fin.toISOString() : undefined });
      setOpen(false);
      setForm({ clienteId: '', titulo: '', descripcion: '', tipo: 'TELEFONICA', fechaHoraInicio: '', fechaHoraFin: '', ubicacion: '', estado: 'PROGRAMADA' });
      qc.invalidateQueries(['citas']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const cambiarEstado = async (cita, estado) => {
    try { await api.patch(`/citas/${cita.id}`, { estado }); qc.invalidateQueries(['citas']); } catch (e) { alert(handleError(e)); }
  };

  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/citas/${toDelete.id}`);
      setToDelete(null);
      qc.invalidateQueries(['citas']);
    } catch (e) {
      alert(handleError(e));
    } finally {
      setDeleting(false);
    }
  };

  const prox = citas?.filter((c) => new Date(c.fechaHoraInicio) >= new Date() && ['PROGRAMADA', 'CONFIRMADA'].includes(c.estado)) || [];
  const pas = citas?.filter((c) => !['PROGRAMADA', 'CONFIRMADA'].includes(c.estado) || new Date(c.fechaHoraInicio) < new Date()) || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Citas</h2>
        <div className="flex gap-2">
          {esAdmin() && (
            <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
              <option value="">Todos los asesores</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          )}
          <button onClick={() => setOpen(true)} className="btn-primary">+ Nueva cita</button>
        </div>
      </div>

      <Card title="Próximas citas">
        {prox.length ? (
          <ul className="divide-y divide-slate-100">
            {prox.sort((a, b) => new Date(a.fechaHoraInicio) - new Date(b.fechaHoraInicio)).map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{c.titulo}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{c.cliente?.nombre} {c.cliente?.apellidoP} · {fechaHora(c.fechaHoraInicio)} ({hora(c.fechaHoraFin)}) · {c.tipo}</p>
                  {c.ubicacion && <p className="text-xs text-slate-400 dark:text-slate-500">{c.ubicacion}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <CitaBadge estado={c.estado} />
                  <select className="input w-auto py-1" value={c.estado} onChange={(e) => cambiarEstado(c, e.target.value)}>
                    {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <button
                    onClick={() => setToDelete(c)}
                    className="text-red-600 hover:text-red-700 text-xs"
                    title="Eliminar cita"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState message="Sin citas próximas" />}
      </Card>

      <Card title="Histórico">
        {pas.length ? (
          <ul className="divide-y divide-slate-100">
            {pas.sort((a, b) => new Date(b.fechaHoraInicio) - new Date(a.fechaHoraInicio)).map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.titulo}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{c.cliente?.nombre} {c.cliente?.apellidoP} · {fechaHora(c.fechaHoraInicio)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <CitaBadge estado={c.estado} />
                  <button
                    onClick={() => setToDelete(c)}
                    className="text-red-600 hover:text-red-700 text-xs"
                    title="Eliminar cita"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState message="Sin historial" />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva cita">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Cliente*">
            <select className="input" required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Selecciona…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP}</option>)}
            </select>
          </Field>
          <Field label="Título*"><input className="input" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio*"><input type="datetime-local" className="input" required value={form.fechaHoraInicio} onChange={(e) => setForm({ ...form, fechaHoraInicio: e.target.value })} /></Field>
            <Field label="Fin"><input type="datetime-local" className="input" value={form.fechaHoraFin} onChange={(e) => setForm({ ...form, fechaHoraFin: e.target.value })} /></Field>
            <Field label="Tipo"><select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
            <Field label="Ubicación"><input className="input" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} /></Field>
          </div>
          <Field label="Descripción"><textarea className="input" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cita">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Seguro que deseas eliminar la cita <strong>{toDelete.titulo}</strong>
              {toDelete.cliente ? <> de {toDelete.cliente.nombre} {toDelete.cliente.apellidoP}</> : null}?
              Esta acción no se puede deshacer.
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
