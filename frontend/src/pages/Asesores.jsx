import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { TendenciaMes, VentasAsesor, CitasAsesor } from '../components/VistasAsesor.jsx';
import { Card, Modal, Field, Badge, EmptyState } from '../components/ui.jsx';
import ClientesView from '../components/clientes/ClientesView.jsx';
import { mxn, num, fechaCorta } from '../lib/format.js';

const ROLES = ['SUPERADMIN', 'ADMIN', 'ASESOR'];
const rolColor = { SUPERADMIN: 'red', ADMIN: 'blue', ASESOR: 'slate' };
const iniciales = (nombre = '') => nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function Asesores() {
  const [tab, setTab] = useState('crm');
  const tabs = [
    { id: 'crm', label: 'CRM por asesor' },
    { id: 'equipo', label: 'Equipo' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Asesores</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Gestión del equipo. Revisa el CRM de cada asesor o administra sus cuentas.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'crm' && <CrmTab />}
      {tab === 'equipo' && <EquipoTab />}
    </div>
  );
}

//.Tab "CRM por asesor": ranking → detalle con tabs (cliáficas/citas/ventas)
function CrmTab() {
  const [selected, setSelected] = useState(null);
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard-asesores'],
    queryFn: async () => (await api.get('/metricas/dashboard')).data,
  });
  const ranking = dashboard?.ranking || [];

  if (!selected) {
    return (
      <div className="card overflow-hidden">
        {ranking.length === 0 ? <EmptyState message="Sin asesores" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-3 px-4 font-semibold">Asesor</th>
                  <th className="py-3 px-4 font-semibold text-center">Clientes</th>
                  <th className="py-3 px-4 font-semibold text-center">Citas mes</th>
                  <th className="py-3 px-4 font-semibold text-center">Ventas mes</th>
                  <th className="py-3 px-4 font-semibold text-right">Prima mes</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-slate-50 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="avatar">{iniciales(r.nombre)}</div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{r.nombre}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums">{num(r.clientes)}</td>
                    <td className="py-3 px-4 text-center tabular-nums">{num(r.citas)}</td>
                    <td className="py-3 px-4 text-center tabular-nums">{num(r.ventas)}</td>
                    <td className="py-3 px-4 text-right"><span className="money-earned">{mxn(r.prima)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 dark:text-slate-500">
        <button onClick={() => setSelected(null)} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition">CRM por asesor</button>
        <span> / </span>
        <span>{selected.nombre}</span>
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi kpi-accent">
          <p className="kpi-label">Clientes</p>
          <p className="kpi-val">{num(selected.clientes)}</p>
          <p className="kpi-note">cartera activa</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Citas del mes</p>
          <p className="kpi-val">{num(selected.citas)}</p>
          <p className="kpi-note">agendadas</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Ventas del mes</p>
          <p className="kpi-val">{num(selected.ventas)}</p>
          <p className="kpi-note">pólizas del periodo</p>
        </div>
        <div className="kpi kpi-green">
          <p className="kpi-label">Prima del mes</p>
          <p className="kpi-val">{mxn(selected.prima)}</p>
          <p className="kpi-note">aprobada / pagada</p>
        </div>
      </div>

      <DetalleTabs asesor={selected} />
    </div>
  );
}

function DetalleTabs({ asesor }) {
  const [tab, setTab] = useState('clientes');
  const tabs = [{ id: 'clientes', label: 'Clientes' }, { id: 'citas', label: 'Citas' }, { id: 'calendario', label: 'Calendario' }, { id: 'ventas', label: 'Ventas' }, { id: 'tendencia', label: 'Tendencia' }];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'clientes' && (
        <ClientesView
          asesorId={asesor.id}
          titulo={`Clientes de ${asesor.nombre}`}
          subtitulo="vista de promotor · control total de la cartera"
          banner={
            <div className="scope-banner">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
              <span>Estás gestionando los clientes de <strong>{asesor.nombre}</strong> como promotor: los clientes que crees aquí se asignan a este asesor.</span>
            </div>
          }
        />
      )}
      {tab === 'citas' && <CitasAsesor asesorId={asesor.id} />}
      {tab === 'calendario' && <CitasAsesor asesorId={asesor.id} vistaCalendario />}
      {tab === 'ventas' && <VentasAsesor asesorId={asesor.id} />}
      {tab === 'tendencia' && <TendenciaMes asesorId={asesor.id} />}
    </div>
  );
}

//.Tab "Equipo": CRUD de usuarios similar a la antigua Usuarios.jsx
function EquipoTab() {
  const qc = useQueryClient();
  const [rol, setRol] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nombre: '', apellidoP: '', apellidoM: '', email: '', password: '', telefono: '', rol: 'ASESOR' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const { data: usuarios } = useQuery({
    queryKey: ['usuarios', rol],
    queryFn: async () => (await api.get('/usuarios', { params: rol ? { rol } : {} })).data,
  });

  const openNew = () => { setEditing(null); setForm({ nombre: '', apellidoP: '', apellidoM: '', email: '', password: '', telefono: '', rol: 'ASESOR' }); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ nombre: u.nombre, apellidoP: u.apellidoP, apellidoM: u.apellidoM || '', email: u.email, password: '', telefono: u.telefono || '', rol: u.rol, activo: u.activo }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) {
        await api.patch(`/usuarios/${editing.id}`, payload);
      } else {
        await api.post('/usuarios', payload);
      }
      setOpen(false);
      qc.invalidateQueries(['usuarios']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const toggleActivo = async (u) => {
    try { await api.patch(`/usuarios/${u.id}`, { activo: !u.activo }); qc.invalidateQueries(['usuarios']); } catch (e) { alert(handleError(e)); }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <select className="input w-auto" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={openNew} className="btn-primary">+ Nuevo usuario</button>
      </div>
      {!usuarios || usuarios.length === 0 ? <EmptyState message="Sin usuarios" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700"><th className="py-2 pr-4">Nombre</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Teléfono</th><th className="py-2 pr-4">Rol</th><th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Creado</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                  <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">{u.nombre} {u.apellidoP} {u.apellidoM || ''}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{u.telefono || '—'}</td>
                  <td className="py-2 pr-4"><Badge color={rolColor[u.rol]}>{u.rol}</Badge></td>
                  <td className="py-2 pr-4"><Badge color={u.activo ? 'green' : 'red'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                  <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{fechaCorta(u.creadoEn)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <button onClick={() => openEdit(u)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline mr-2">Editar</button>
                    <button onClick={() => toggleActivo(u)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">{u.activo ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar usuario' : 'Nuevo usuario'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre*"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Apellido paterno*"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
            <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
            <Field label="Email*"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} /></Field>
            <Field label="Rol"><select className="input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          </div>
          <Field label={editing ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña*'}><input className="input" type="password" required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
