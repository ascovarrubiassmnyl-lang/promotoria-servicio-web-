import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Field, CitaBadge, EmptyState } from '../components/ui.jsx';
import { hora, nombreMes, isoLocalInput } from '../lib/format.js';

const TIPO_COLOR = { TELEFONICA: 'bg-blue-500', VIDEO: 'bg-purple-500', PRESENCIAL: 'bg-emerald-500' };
const TIPO_CITA = { TELEFONICA: 'Telefónica', VIDEO: 'Videollamada', PRESENCIAL: 'Presencial' };
const MODALIDAD_CITA = { CITA_UNICA: 'Cita única de asesor', ACOMPANAMIENTO: 'Acompañamiento (con promotor)' };
const ESTADO_CITA = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'];

function startOfMonth(y, m) { return new Date(y, m, 1); }
function endOfMonth(y, m) { return new Date(y, m + 1, 0); }

function toDiaLocal(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function CalendarioMio() {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [asesorId, setAsesorId] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Modal agendar
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    clienteId: '',
    titulo: '',
    descripcion: '',
    tipo: 'TELEFONICA',
    modalidad: 'CITA_UNICA',
    promotorId: '',
    fechaHoraInicio: '',
    fechaHoraFin: '',
    ubicacion: '',
    estado: 'PROGRAMADA',
  });

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });

  // Promotores (admins) para acompañamiento — accesible para todo autenticado.
  const { data: promotores } = useQuery({
    queryKey: ['promotores-list'],
    queryFn: async () => (await api.get('/usuarios/promotores')).data,
  });

  const ini = startOfMonth(year, month);
  const fin = endOfMonth(year, month);
  const { data: citas, isLoading } = useQuery({
    queryKey: ['citas-cal', year, month, asesorId],
    queryFn: async () => (await api.get('/citas', { params: { desde: ini.toISOString(), hasta: fin.toISOString(), asesorId: asesorId || undefined } })).data,
  });

  // Clientes del asesor (para el select del modal)
  const { data: misClientes } = useQuery({
    queryKey: ['clientes-asesor-self'],
    queryFn: async () => (await api.get('/clientes', { params: { asesorId: user?.id } })).data,
    enabled: !esAdmin() && !!user?.id,
  });

  const grid = [];
  const primerDiaSemana = ini.getDay();
  const diasEnMes = fin.getDate();
  for (let i = 0; i < primerDiaSemana; i++) grid.push(null);
  for (let d = 1; d <= diasEnMes; d++) grid.push(new Date(year, month, d));
  while (grid.length % 7 !== 0) grid.push(null);

  const porDia = {};
  citas?.forEach((c) => {
    const k = toDiaLocal(c.fechaHoraInicio);
    if (!porDia[k]) porDia[k] = [];
    porDia[k].push(c);
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const hoy = new Date();
  const esHoy = (d) => d && d.toDateString() === hoy.toDateString();

  const prev = () => { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); setSelectedDay(null); };
  const next = () => { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); setSelectedDay(null); };
  const goHoy = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(null); };

  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const citasDiaSel = selectedDay ? (porDia[dayKey(selectedDay)] || []) : [];

  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/citas/${toDelete.id}`);
      setToDelete(null);
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
    } catch (e) {
      alert(handleError(e));
    } finally {
      setDeleting(false);
    }
  };

  // ---------- Agendar ----------
  const abrirAgendar = (preFecha = null) => {
    const fIni = preFecha ? isoLocalInput(preFecha) : '';
    setForm({
      clienteId: '',
      titulo: '',
      descripcion: '',
      tipo: 'TELEFONICA',
      modalidad: 'CITA_UNICA',
      promotorId: '',
      fechaHoraInicio: fIni,
      fechaHoraFin: '',
      ubicacion: '',
      estado: 'PROGRAMADA',
    });
    setErr('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clienteId || !form.titulo || !form.fechaHoraInicio) {
      setErr('Cliente, título e inicio son requeridos');
      return;
    }
    setSaving(true); setErr('');
    try {
      const inicio = new Date(form.fechaHoraInicio);
      const fin = form.fechaHoraFin ? new Date(form.fechaHoraFin) : null;
      const payload = {
        ...form,
        fechaHoraInicio: inicio.toISOString(),
        fechaHoraFin: fin ? fin.toISOString() : undefined,
      };
      if (!payload.promotorId) delete payload.promotorId;
      // El backend ignora asesorId si vienes como ASESOR (usa req.user.id). Admin usa asesorId.
      if (esAdmin() && asesorId) payload.asesorId = asesorId;
      await api.post('/citas', payload);
      setOpen(false);
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Calendario</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {esAdmin() && (
            <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
              <option value="">Todos los asesores</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1">
            <button onClick={prev} className="btn-secondary px-3">←</button>
            <button onClick={goHoy} className="btn-secondary px-3">Hoy</button>
            <button onClick={next} className="btn-secondary px-3">→</button>
            <span className="px-3 text-sm font-medium text-slate-700 dark:text-slate-300 min-w-[140px] text-center">{nombreMes(month + 1)} {year}</span>
          </div>
          <button onClick={() => abrirAgendar()} className="btn-primary">+ Agendar cita</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="grid grid-cols-7 text-center text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <div key={i} className="min-h-[80px] rounded-lg border border-transparent" />;
              const k = dayKey(d);
              const items = porDia[k] || [];
              const sel = selectedDay && selectedDay.toDateString() === d.toDateString();
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(d)}
                  onDoubleClick={(e) => { e.preventDefault(); const dt = new Date(d); dt.setHours(9, 0, 0, 0); abrirAgendar(dt); }}
                  className={`min-h-[80px] rounded-lg border p-1.5 text-left transition ${sel ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                  title="Doble clic para agendar"
                >
                  <div className={`text-xs ${esHoy(d) ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center' : 'text-slate-600 dark:text-slate-300'}`}>{d.getDate()}</div>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map((c, idx) => (
                      <div key={c.id} className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.modalidad === 'ACOMPANAMIENTO' ? 'bg-amber-500' : TIPO_COLOR[c.tipo] || 'bg-slate-400'}`} />
                        <span className="truncate">{hora(c.fechaHoraInicio)} {c.cliente?.nombre}</span>
                      </div>
                    ))}
                    {items.length > 3 && <p className="text-[10px] text-slate-400 dark:text-slate-500">+{items.length - 3} más</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title={selectedDay ? `Citas · ${selectedDay.toLocaleDateString('es-MX')}` : 'Selecciona un día'}>
          {isLoading ? <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div> :
            !selectedDay ? <EmptyState message="Selecciona un día del calendario" /> :
            citasDiaSel.length === 0 ? (
              <div className="space-y-3">
                <EmptyState message="Sin citas este día" />
                <button onClick={() => abrirAgendar(selectedDay)} className="btn-primary text-xs w-full">Agendar para este día</button>
              </div>
            ) : (
              <ul className="space-y-3">
                {citasDiaSel.sort((a, b) => new Date(a.fechaHoraInicio) - new Date(b.fechaHoraInicio)).map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.titulo}</p>
                      <CitaBadge estado={c.estado} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)} · {TIPO_CITA[c.tipo] || c.tipo}
                      {c.modalidad === 'ACOMPANAMIENTO' && (
                        <span className="ml-1 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">· Acompañamiento {c.promotor ? `con ${c.promotor.nombre} ${c.promotor.apellidoP}` : ''}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{c.cliente?.nombre} {c.cliente?.apellidoP} {c.cliente?.telefono ? `· ${c.cliente.telefono}` : ''}</p>
                    {c.ubicacion && <p className="text-xs text-slate-400 dark:text-slate-500">{c.ubicacion}</p>}
                    {esAdmin() && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Asesor: {c.asesor?.nombre} {c.asesor?.apellidoP}</p>}
                    <div className="mt-2 text-right">
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
            )}
        </Card>
      </div>

      {/* Modal Agendar */}
      <Modal open={open} onClose={() => setOpen(false)} title="Agendar cita">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Cliente*">
            <select className="input" required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Selecciona…</option>
              {misClientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP} {c.apellidoM || ''}</option>)}
            </select>
          </Field>
          <Field label="Título*"><input className="input" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Presentación de póliza" /></Field>
          <Field label="Modalidad*">
            <select className="input" value={form.modalidad} onChange={(e) => setForm({ ...form, modalidad: e.target.value, promotorId: e.target.value === 'ACOMPANAMIENTO' ? form.promotorId : '' })}>
              {Object.entries(MODALIDAD_CITA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {form.modalidad === 'ACOMPANAMIENTO' && (
            <Field label="Promotor (admin) que acompaña">
              <select className="input" value={form.promotorId} onChange={(e) => setForm({ ...form, promotorId: e.target.value })}>
                <option value="">Sin asignar (luego lo elige el promotor)</option>
                {promotores?.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidoP}</option>)}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Indica qué promotor te acompañará. Si no lo sabes, lo puede asignar luego.</p>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPO_CITA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {ESTADO_CITA.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Inicio*"><input type="datetime-local" className="input" required value={form.fechaHoraInicio} onChange={(e) => setForm({ ...form, fechaHoraInicio: e.target.value })} /></Field>
            <Field label="Fin"><input type="datetime-local" className="input" value={form.fechaHoraFin} onChange={(e) => setForm({ ...form, fechaHoraFin: e.target.value })} /></Field>
          </div>
          <Field label="Ubicación"><input className="input" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Dirección o link de videollamada" /></Field>
          <Field label="Notas">
            <textarea className="input" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Objetivo de la cita" />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Agendar'}</button>
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
