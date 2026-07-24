import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { Card, Modal, Field, CitaBadge, VentaBadge, EmptyState } from '../components/ui.jsx';
import { mxn, fechaHora, fechaCorta, isoLocalInput, isoLocalDateInput, RAMOS, RAMOS_LABEL, ESTADOS_CLIENTE, ESTADOS_CLIENTE_LABEL } from '../lib/format.js';

const TIPO_CITA = { TELEFONICA: 'Telefónica', VIDEO: 'Videollamada', PRESENCIAL: 'Presencial' };
const MODALIDAD_CITA_LABEL = { CITA_UNICA: 'Cita única', ACOMPANAMIENTO: 'Acompañamiento' };
// Pólizas en estado PAGADA o FIRMADA se consideran "activas"
const POLIZA_ACTIVA = new Set(['PAGADA', 'FIRMADA', 'APROBADA']);
const ESTADO_CITA = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'];

export default function ClienteDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toDeleteClient, setToDeleteClient] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  // Nota modal
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaForm, setNotaForm] = useState({ tipo: 'NOTA', texto: '', fechaAviso: '' });
  const [notaSaving, setNotaSaving] = useState(false);

  // Cita modal
  const [citaOpen, setCitaOpen] = useState(false);
  const [citaForm, setCitaForm] = useState({ titulo: '', descripcion: '', tipo: 'TELEFONICA', fechaHoraInicio: '', fechaHoraFin: '', ubicacion: '', estado: 'PROGRAMADA' });
  const [citaSaving, setCitaSaving] = useState(false);

  // Producto modal (interés)
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoForm, setProductoForm] = useState(null);
  const [productoSaving, setProductoSaving] = useState(false);

  // Eliminar
  const [delCitaId, setDelCitaId] = useState(null);
  const [delNotaId, setDelNotaId] = useState(null);

  const { data: c, isLoading } = useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => (await api.get(`/clientes/${id}`)).data,
  });

  if (isLoading) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>;
  if (!c) return <EmptyState message="Cliente no encontrado" />;

  const startEdit = () => setForm({
    nombre: c.nombre, apellidoP: c.apellidoP, apellidoM: c.apellidoM || '',
    email: c.email || '', telefono: c.telefono || '', estado: c.estado,
    notas: c.notas || '', fuente: c.fuente || '', direccion: c.direccion || '', rfc: c.rfc || '',
  });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await api.patch(`/clientes/${id}`, form);
      setEditing(false);
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  // Cambiar estado inline
  const cambiarEstado = async (estado) => {
    try {
      await api.patch(`/clientes/${id}`, { estado });
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Agregar nota o recordatorio
  const abrirNota = (tipo) => {
    setNotaForm({ tipo, texto: '', fechaAviso: tipo === 'RECORDATORIO' ? isoLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)) : '' });
    setNotaOpen(true);
  };

  const guardarNota = async (e) => {
    e.preventDefault();
    setNotaSaving(true);
    try {
      await api.post('/notas', {
        clienteId: id,
        tipo: notaForm.tipo,
        texto: notaForm.texto,
        fechaAviso: notaForm.fechaAviso || null,
      });
      setNotaOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setNotaSaving(false); }
  };

  const eliminarNota = async () => {
    try {
      await api.delete(`/notas/${delNotaId}`);
      setDelNotaId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Agendar cita
  const abrirCita = () => {
    const ahora = new Date(); ahora.setHours(ahora.getHours() + 1, 0, 0, 0);
    setCitaForm({ titulo: '', descripcion: '', tipo: 'TELEFONICA', fechaHoraInicio: isoLocalInput(ahora), fechaHoraFin: '', ubicacion: '', estado: 'PROGRAMADA' });
    setCitaOpen(true);
  };

  const guardarCita = async (e) => {
    e.preventDefault();
    if (!citaForm.titulo || !citaForm.fechaHoraInicio) { alert('Título y fecha de inicio son requeridos'); return; }
    setCitaSaving(true);
    try {
      await api.post('/citas', { clienteId: id, ...citaForm });
      setCitaOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setCitaSaving(false); }
  };

  const eliminarCita = async () => {
    try {
      await api.delete(`/citas/${delCitaId}`);
      setDelCitaId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Producto
  const abrirProducto = () => {
    setProductoForm({
      productoInteres: c.productoInteres || '',
      detalleInteres: c.detalleInteres || '',
    });
    setProductoOpen(true);
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    setProductoSaving(true);
    try {
      const payload = {
        productoInteres: productoForm.productoInteres || null,
        detalleInteres: productoForm.detalleInteres || null,
      };
      await api.patch(`/clientes/${id}`, payload);
      setProductoOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setProductoSaving(false); }
  };

  const confirmarEliminarCliente = async () => {
    setDeleting(true);
    try {
      await api.delete(`/clientes/${id}`);
      qc.invalidateQueries(['clientes']);
      navigate('/clientes');
    } catch (e) {
      alert(handleError(e));
    } finally {
      setDeleting(false);
    }
  };

  // Separar notas y recordatorios
  const notas = c.notasItems?.filter((n) => n.tipo === 'NOTA') || [];
  const recordatorios = c.notasItems?.filter((n) => n.tipo === 'RECORDATORIO') || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/clientes" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Volver a clientes</Link>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">{c.nombre} {c.apellidoP} {c.apellidoM || ''}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Asesor: {c.asesor?.nombre} {c.asesor?.apellidoP} · Creado {fechaCorta(c.creadoEn)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto"
            value={c.estado}
            onChange={(e) => cambiarEstado(e.target.value)}
            title="Cambiar estado del cliente"
          >
            {ESTADOS_CLIENTE.map((e) => <option key={e} value={e}>{ESTADOS_CLIENTE_LABEL[e]}</option>)}
          </select>
          <button onClick={() => { startEdit(); setEditing(true); }} className="btn-secondary">Editar</button>
          <button onClick={() => setToDeleteClient(true)} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Contacto */}
        <Card title="Contacto">
          <dl className="text-sm space-y-1">
            <div><dt className="text-slate-400 dark:text-slate-500">Teléfono</dt><dd className="text-slate-700 dark:text-slate-300">{c.telefono || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">Email</dt><dd className="text-slate-700 dark:text-slate-300">{c.email || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">RFC</dt><dd className="text-slate-700 dark:text-slate-300">{c.rfc || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">Dirección</dt><dd className="text-slate-700 dark:text-slate-300">{c.direccion || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">Fuente</dt><dd className="text-slate-700 dark:text-slate-300">{c.fuente || '—'}</dd></div>
          </dl>
        </Card>

        {/* Notas libres */}
        <Card title="Notas generales" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => abrirNota('NOTA')}>+ Nota</button>}>
          {c.notas && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap border-l-2 border-slate-200 dark:border-slate-700 pl-3 italic">{c.notas}</p>}
          {notas.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {notas.map((n) => (
                <li key={n.id} className="group flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <p className="text-slate-600 dark:text-slate-300">{n.texto}</p>
                  <button
                    onClick={() => setDelNotaId(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity shrink-0"
                    title="Eliminar nota"
                  >Eliminar</button>
                </li>
              ))}
            </ul>
          ) : !c.notas && <EmptyState message="Sin notas" />}
        </Card>

        {/* Recordatorios */}
        <Card title="Recordatorios" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => abrirNota('RECORDATORIO')}>+ Recordatorio</button>}>
          {recordatorios.length ? (
            <ul className="space-y-2 text-sm">
              {recordatorios.map((n) => (
                <li key={n.id} className="group flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <div>
                    <p className="text-slate-700 dark:text-slate-300">{n.texto}</p>
                    {n.fechaAviso && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Avisar: {fechaHora(n.fechaAviso)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setDelNotaId(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity shrink-0"
                    title="Eliminar recordatorio"
                  >Eliminar</button>
                </li>
              ))}
            </ul>
          ) : <EmptyState message="Sin recordatorios" />}
        </Card>
      </div>

      {/* Pólizas del cliente */}
      <Card
        title={`Póliza${(c.ventas?.length || 0) === 1 ? '' : 's'}${c.ventas?.length ? ` (${c.ventas.length})` : ''}`}
        className="md:col-span-3"
      >
        {/* Producto de interés (cuando aún no hay pólizas) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Producto de interés</h4>
            <button onClick={() => abrirProducto()} className="btn-secondary text-xs py-1 px-2">
              {c.productoInteres ? 'Editar' : 'Agregar'}
            </button>
          </div>
          {c.productoInteres ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/40">
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">{RAMOS_LABEL[c.productoInteres]}</p>
              {c.detalleInteres && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.detalleInteres}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Sin producto de interés registrado</p>
          )}
        </div>

        {/* Lista de Pólizas (Ventas) con ramo + producto + estado activo/inactivo */}
        {c.ventas?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Ramo</th>
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4 text-right">Prima anual</th>
                  <th className="py-2 pr-4 text-right">Comisión</th>
                  <th className="py-2 pr-4">Forma de pago</th>
                  <th className="py-2 pr-4">Póliza</th>
                  <th className="py-2 pr-4">Estado</th>
                </tr>
              </thead>
              <tbody>
                {c.ventas.map((v) => {
                  const activa = POLIZA_ACTIVA.has(v.estado);
                  return (
                    <tr key={v.id} className="border-b border-slate-50 dark:border-slate-700/50">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{RAMOS_LABEL[v.ramo] || v.ramo}</span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {v.productoCatalogo?.nombre || v.producto || '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">{mxn(v.primaAnual)}</td>
                      <td className="py-2 pr-4 text-right text-emerald-600 dark:text-emerald-400">{mxn(v.comisionMonto)}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {v.formaPago ? ({ MENSUAL: 'Mensual', TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual', UNICO: 'Único' }[v.formaPago] || v.formaPago) : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${activa ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          <span className={`w-2 h-2 rounded-full ${activa ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          {activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="py-2 pr-4"><VentaBadge estado={v.estado} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="Sin pólizas registradas · si el cliente cerró venta, créala desde Pólizas" />
        )}
      </Card>

      {/* Próximas citas */}
      <Card
        title="Próximas citas"
        actions={<button onClick={abrirCita} className="btn-primary text-xs py-1 px-2">+ Agendar cita</button>}
      >
        {c.citas?.length ? (
          <ul className="space-y-2 text-sm">
            {c.citas.slice(0, 10).map((ci) => (
              <li key={ci.id} className="group flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{ci.titulo}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {TIPO_CITA[ci.tipo] || ci.tipo}
                    {ci.modalidad === 'ACOMPANAMIENTO' && ' · Acompañamiento'}
                    {ci.promotor && ` con promotor ${ci.promotor.nombre} ${ci.promotor.apellidoP}`}
                    {' · '}
                    {fechaHora(ci.fechaHoraInicio)}
                    {ci.ubicacion && ` · ${ci.ubicacion}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CitaBadge estado={ci.estado} />
                  <button
                    onClick={() => setDelCitaId(ci.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity"
                    title="Eliminar cita"
                  >Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState message="Sin citas programadas" />}
      </Card>

      {/* Modal editar cliente */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Editar cliente">
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
              <Field label="Apellido paterno"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
              <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
              <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Estado"><select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS_CLIENTE.map((e) => <option key={e} value={e}>{ESTADOS_CLIENTE_LABEL[e]}</option>)}</select></Field>
              <Field label="RFC"><input className="input" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} /></Field>
              <Field label="Fuente"><input className="input" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} /></Field>
            </div>
            <Field label="Dirección"><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></Field>
            <Field label="Notas generales"><textarea className="input" rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal nota / recordatorio */}
      <Modal open={notaOpen} onClose={() => setNotaOpen(false)} title={notaForm.tipo === 'NOTA' ? 'Agregar nota' : 'Agregar recordatorio'}>
        <form onSubmit={guardarNota} className="space-y-3">
          <Field label={notaForm.tipo === 'NOTA' ? 'Nota' : 'Recordatorio'}>
            <textarea
              className="input"
              rows={4}
              required
              value={notaForm.texto}
              onChange={(e) => setNotaForm({ ...notaForm, texto: e.target.value })}
              placeholder={notaForm.tipo === 'NOTA' ? 'Escribe aquí…' : 'Qué quieres recordar…'}
            />
          </Field>
          {notaForm.tipo === 'RECORDATORIO' && (
            <Field label="Fecha y hora de aviso">
              <input
                type="datetime-local"
                className="input"
                required
                value={notaForm.fechaAviso}
                onChange={(e) => setNotaForm({ ...notaForm, fechaAviso: e.target.value })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Te avisaremos mediante notificación push cuando se acerque esta fecha.
              </p>
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setNotaOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={notaSaving} className="btn-primary">{notaSaving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal cita */}
      <Modal open={citaOpen} onClose={() => setCitaOpen(false)} title="Agendar cita">
        <form onSubmit={guardarCita} className="space-y-3">
          <Field label="Título"><input className="input" required value={citaForm.titulo} onChange={(e) => setCitaForm({ ...citaForm, titulo: e.target.value })} /></Field>
          <Field label="Descripción"><textarea className="input" rows={2} value={citaForm.descripcion} onChange={(e) => setCitaForm({ ...citaForm, descripcion: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo"><select className="input" value={citaForm.tipo} onChange={(e) => setCitaForm({ ...citaForm, tipo: e.target.value })}>{Object.entries(TIPO_CITA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Estado"><select className="input" value={citaForm.estado} onChange={(e) => setCitaForm({ ...citaForm, estado: e.target.value })}>{ESTADO_CITA.map((e) => <option key={e} value={e}>{e}</option>)}</select></Field>
            <Field label="Inicio"><input type="datetime-local" className="input" required value={citaForm.fechaHoraInicio} onChange={(e) => setCitaForm({ ...citaForm, fechaHoraInicio: e.target.value })} /></Field>
            <Field label="Fin (opcional)"><input type="datetime-local" className="input" value={citaForm.fechaHoraFin} onChange={(e) => setCitaForm({ ...citaForm, fechaHoraFin: e.target.value })} /></Field>
          </div>
          <Field label="Ubicación"><input className="input" value={citaForm.ubicacion} onChange={(e) => setCitaForm({ ...citaForm, ubicacion: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCitaOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={citaSaving} className="btn-primary">{citaSaving ? 'Agendando…' : 'Agendar'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal producto interés */}
      <Modal
        open={productoOpen}
        onClose={() => setProductoOpen(false)}
        title="Producto de interés"
      >
        {productoForm && (
          <form onSubmit={guardarProducto} className="space-y-3">
            <Field label="Ramo de interés">
              <select className="input" required value={productoForm.productoInteres} onChange={(e) => setProductoForm({ ...productoForm, productoInteres: e.target.value })}>
                <option value="">Selecciona…</option>
                {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field label="Detalle / observaciones">
              <textarea className="input" rows={4} value={productoForm.detalleInteres} onChange={(e) => setProductoForm({ ...productoForm, detalleInteres: e.target.value })} placeholder="Ej. Busca protección para su familia, 2 hijos, ingreso aproximado $35K mensual…" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setProductoOpen(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={productoSaving} className="btn-primary">{productoSaving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Referidos */}
      <ReferidosBlock clienteId={c.id} referidoPor={c.referidoPor} referidos={c.referidos} />

      {/* Confirmación eliminar cliente */}
      <Modal open={toDeleteClient} onClose={() => setToDeleteClient(false)} title="Eliminar cliente">
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            ¿Seguro que deseas eliminar a <strong>{c.nombre} {c.apellidoP}</strong>?
            Esta acción también borrará sus citas, notas y ventas asociadas y no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setToDeleteClient(false)} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={confirmarEliminarCliente} disabled={deleting} className="btn-primary bg-red-600 hover:bg-red-700">
              {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmación eliminar nota/recordatorio */}
      <Modal open={!!delNotaId} onClose={() => setDelNotaId(null)} title="Eliminar nota">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar esta nota/recordatorio?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelNotaId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarNota} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </Modal>

      {/* Confirmación eliminar cita */}
      <Modal open={!!delCitaId} onClose={() => setDelCitaId(null)} title="Eliminar cita">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar esta cita?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelCitaId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarCita} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </Modal>
    </div>
  );
}

function ReferidosBlock({ clienteId, referidoPor, referidos }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ nombreReferido: '', telefonoReferido: '', emailReferido: '' });

  const { data: referidosLista } = useQuery({
    queryKey: ['referidos-cliente', clienteId],
    queryFn: async () => (await api.get('/referidos', { params: { clienteOrigenId: clienteId } })).data,
  });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await api.post('/referidos', { clienteOrigenId: clienteId, ...form });
      setOpen(false);
      setForm({ nombreReferido: '', telefonoReferido: '', emailReferido: '' });
      qc.invalidateQueries(['referidos-cliente', clienteId]);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const actualizarEstado = async (id, estado) => {
    await api.patch(`/referidos/${id}`, { estado });
    qc.invalidateQueries(['referidos-cliente', clienteId]);
  };

  const lista = referidosLista || [];
  return (
    <div className="space-y-3">
      <Card title="Referidos" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => setOpen(true)}>+ Registrar referido</button>}>
        {referidoPor && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
            Referido por: <Link to={`/clientes/${referidoPor.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">{referidoPor.nombre} {referidoPor.apellidoP}</Link>
          </p>
        )}
        {lista.length === 0 ? (
          <EmptyState message="Aún no hay referidos registrados por este cliente" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Referido</th>
                  <th className="py-2 pr-4">Contacto</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/60">
                    <td className="py-2 pr-4">
                      {r.clienteReferido ? (
                        <Link to={`/clientes/${r.clienteReferido.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">{r.clienteReferido.nombre} {r.clienteReferido.apellidoP}</Link>
                      ) : (
                        <span className="font-medium text-slate-700 dark:text-slate-300">{r.nombreReferido || '—'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                      {r.telefonoReferido && <p>{r.telefonoReferido}</p>}
                      {r.emailReferido && <p className="text-xs">{r.emailReferido}</p>}
                      {!r.telefonoReferido && !r.emailReferido && <p className="text-xs text-slate-400">—</p>}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        className="input w-auto text-xs"
                        value={r.estado}
                        onChange={(e) => actualizarEstado(r.id, e.target.value)}
                      >
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="CONTACTADO">Contactado</option>
                        <option value="CONVERTIDO">Convertido</option>
                        <option value="DESCARTADO">Descartado</option>
                      </select>
                    </td>
                    <td className="py-2 pr-4 text-right text-xs text-slate-400 dark:text-slate-500">
                      {new Date(r.fecha).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar referido">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Agrega a alguien referido por este cliente para gestionar su conversión.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre del referido*"><input className="input" required value={form.nombreReferido} onChange={(e) => setForm({ ...form, nombreReferido: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefonoReferido} onChange={(e) => setForm({ ...form, telefonoReferido: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input className="input" type="email" value={form.emailReferido} onChange={(e) => setForm({ ...form, emailReferido: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar referido'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
