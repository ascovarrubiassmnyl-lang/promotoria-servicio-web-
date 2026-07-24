import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Field, CitaBadge, EmptyState } from '../components/ui.jsx';
import { hora, nombreMes } from '../lib/format.js';

const TIPOS = ['TELEFONICA', 'VIDEO', 'PRESENCIAL'];
const ESTADOS = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'];

const ASESOR_COLORS = [
  'bg-brand-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-rose-500',
  'bg-teal-500',
];

const TIPO_COLOR = { TELEFONICA: 'bg-blue-500', VIDEO: 'bg-purple-500', PRESENCIAL: 'bg-emerald-500' };

const DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function startOfMonth(y, m) { return new Date(y, m, 1); }
function endOfMonth(y, m) { return new Date(y, m + 1, 0); }
function toISO(d) { return d.toISOString().slice(0, 10); }
function toDiaLocal(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isoLocalInput(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 16);
}

function startOfWeek(d) {
  const day = d.getDay();
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - day);
  return r;
}

export function CalendarioGeneral() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState('mes');
  const [weekRef, setWeekRef] = useState(startOfWeek(today));
  const [asesorId, setAsesorId] = useState('__yo__');
  const [selectedDay, setSelectedDay] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    asesorId: '',
    clienteId: '',
    titulo: '',
    descripcion: '',
    tipo: 'TELEFONICA',
    fechaHoraInicio: '',
    fechaHoraFin: '',
    ubicacion: '',
    estado: 'PROGRAMADA',
  });

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
  });

  const colorPorAsesor = useMemo(() => {
    const map = {};
    asesores?.forEach((a, i) => { map[a.id] = ASESOR_COLORS[i % ASESOR_COLORS.length]; });
    return map;
  }, [asesores]);

  // Rango visible según vista
  const ini = view === 'mes' ? startOfMonth(year, month) : weekRef;
  const fin = view === 'mes'
    ? endOfMonth(year, month)
    : new Date(weekRef.getFullYear(), weekRef.getMonth(), weekRef.getDate() + 6, 23, 59, 59);

  const { data: citas, isLoading } = useQuery({
    queryKey: ['citas-general', view, year, month, weekRef.toISOString(), asesorId, user?.id],
    queryFn: async () => {
      const params = { desde: ini.toISOString(), hasta: fin.toISOString() };
      if (asesorId === '__yo__') {
        // Vista limpia del propio promotor (admin)
        if (user?.id) params.asesorId = user.id;
      } else if (asesorId === '__todos__' || !asesorId) {
        // Todas las citas (admin)
      } else {
        params.asesorId = asesorId;
      }
      return (await api.get('/citas', { params })).data;
    },
  });

  const { data: clientesAsesor } = useQuery({
    queryKey: ['clientes-asesor', form.asesorId],
    queryFn: async () => (await api.get('/clientes', { params: { asesorId: form.asesorId } })).data,
    enabled: !!form.asesorId,
  });

  const porDia = {};
  citas?.forEach((c) => {
    const k = toDiaLocal(c.fechaHoraInicio);
    if (!porDia[k]) porDia[k] = [];
    porDia[k].push(c);
  });

  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const hoy = new Date();
  const esHoy = (d) => d && d.toDateString() === hoy.toDateString();

  // ---------- Navegación ----------
  const prev = () => {
    if (view === 'mes') {
      if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1);
    } else {
      const r = new Date(weekRef);
      r.setDate(r.getDate() - 7);
      setWeekRef(r);
    }
    setSelectedDay(null);
  };
  const next = () => {
    if (view === 'mes') {
      if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1);
    } else {
      const r = new Date(weekRef);
      r.setDate(r.getDate() + 7);
      setWeekRef(r);
    }
    setSelectedDay(null);
  };
  const goHoy = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekRef(startOfWeek(today));
    setSelectedDay(null);
  };

  const citasDiaSel = selectedDay ? (porDia[dayKey(selectedDay)] || []) : [];

  // ---------- Grid mes ----------
  const gridMes = [];
  const primerDiaSemana = view === 'mes' ? ini.getDay() : 0;
  if (view === 'mes') {
    for (let i = 0; i < primerDiaSemana; i++) gridMes.push(null);
    for (let d = 1; d <= fin.getDate(); d++) gridMes.push(new Date(year, month, d));
    while (gridMes.length % 7 !== 0) gridMes.push(null);
  }

  // ---------- Grid semana ----------
  const diasSemana = [];
  if (view === 'semana') {
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekRef);
      d.setDate(d.getDate() + i);
      diasSemana.push(d);
    }
  }
  const HORAS = Array.from({ length: 24 }, (_, i) => i);

  // ---------- Agendar ----------
  const abrirAgendar = (preAsesor = '', preFecha = null) => {
    const fIni = preFecha ? isoLocalInput(preFecha) : '';
    setForm({
      asesorId: preAsesor || asesorId || '',
      clienteId: '',
      titulo: '',
      descripcion: '',
      tipo: 'TELEFONICA',
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
    if (!form.asesorId || !form.clienteId || !form.titulo || !form.fechaHoraInicio) {
      setErr('Asesor, cliente, título e inicio son requeridos');
      return;
    }
    setSaving(true); setErr('');
    try {
      const inicio = new Date(form.fechaHoraInicio);
      const fin = form.fechaHoraFin ? new Date(form.fechaHoraFin) : null;
      await api.post('/citas', {
        ...form,
        fechaHoraInicio: inicio.toISOString(),
        fechaHoraFin: fin ? fin.toISOString() : undefined,
      });
      setOpen(false);
      qc.invalidateQueries(['citas-general']);
      qc.invalidateQueries(['citas']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  // ---------- Eliminar ----------
  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/citas/${toDelete.id}`);
      setToDelete(null);
      qc.invalidateQueries(['citas-general']);
      qc.invalidateQueries(['citas']);
    } catch (e) { alert(handleError(e)); } finally { setDeleting(false); }
  };

  const tituloPeriodo = view === 'mes'
    ? `${nombreMes(month + 1)} ${year}`
    : `${nombreMes(weekRef.getMonth() + 1)} ${weekRef.getDate()} – ${nombreMes(diasSemana[6].getMonth() + 1)} ${diasSemana[6].getDate()}, ${diasSemana[6].getFullYear()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {asesorId === '__yo__' ? 'Mi Calendario' : asesorId === '__todos__' ? 'Calendario General' : 'Calendario de Asesor'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {asesorId === '__yo__'
              ? 'Tu agenda limpia · tus propias citas de acompañamiento'
              : asesorId === '__todos__'
              ? 'Visión de toda la promotoría · acompaña a tus asesores'
              : 'Acompañando a un asesor específico'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
            <option value="__yo__">Promotor (yo)</option>
            <option value="__todos__">Todos los asesores</option>
            {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setView('mes')}
              className={`px-3 py-1.5 text-sm ${view === 'mes' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >Mes</button>
            <button
              onClick={() => setView('semana')}
              className={`px-3 py-1.5 text-sm ${view === 'semana' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >Semana</button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prev} className="btn-secondary px-3">←</button>
            <button onClick={goHoy} className="btn-secondary px-3">Hoy</button>
            <button onClick={next} className="btn-secondary px-3">→</button>
            <span className="px-3 text-sm font-medium text-slate-700 dark:text-slate-300 min-w-[140px] text-center">{tituloPeriodo}</span>
          </div>
          <button onClick={() => abrirAgendar()} className="btn-primary">+ Agendar acompañamiento</button>
        </div>
      </div>

      {/* Leyenda de colores por asesor */}
      {asesorId === '__todos__' && asesores?.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-medium">Asesores:</span>
          {asesores.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPorAsesor[a.id] || 'bg-slate-400'}`} />
              {a.nombre} {a.apellidoP}
            </span>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {view === 'mes' ? (
          <Card className="lg:col-span-2">
            <div className="grid grid-cols-7 text-center text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
              {DIAS_SEM.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridMes.map((d, i) => {
                if (!d) return <div key={i} className="min-h-[80px] rounded-lg border border-transparent" />;
                const k = dayKey(d);
                const items = porDia[k] || [];
                const sel = selectedDay && selectedDay.toDateString() === d.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(d)}
                    onDoubleClick={(e) => { e.preventDefault(); const dt = new Date(d); dt.setHours(9, 0, 0, 0); abrirAgendar('', dt); }}
                    className={`min-h-[80px] rounded-lg border p-1.5 text-left transition ${sel ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                    title="Doble clic para agendar"
                  >
                    <div className={`text-xs ${esHoy(d) ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center' : 'text-slate-600 dark:text-slate-300'}`}>{d.getDate()}</div>
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 3).map((c) => (
                        <div key={c.id} className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                          <span className={`w-1.5 h-1.5 rounded-full ${colorPorAsesor[c.asesorId] || TIPO_COLOR[c.tipo] || 'bg-slate-400'}`} />
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
        ) : (
          <Card className="lg:col-span-2">
            <div className="grid grid-cols-[60px_repeat(7,1fr)] text-center text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
              <div className="py-1">Hora</div>
              {diasSemana.map((d) => (
                <div key={dayKey(d)} className={`py-1 ${esHoy(d) ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''}`}>
                  {DIAS_SEM[d.getDay()]} {d.getDate()}
                </div>
              ))}
            </div>
            <div className="overflow-y-auto max-h-[500px]">
              {HORAS.map((h) => (
                <div key={h} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-slate-50 dark:border-slate-800">
                  <div className="py-2 px-2 text-[10px] text-slate-400 dark:text-slate-500 text-right">{h.toString().padStart(2, '0')}:00</div>
                  {diasSemana.map((d) => {
                    const k = dayKey(d);
                    const items = (porDia[k] || []).filter((c) => new Date(c.fechaHoraInicio).getHours() === h);
                    return (
                      <div
                        key={k}
                        onClick={() => {
                          const dt = new Date(d); dt.setHours(h, 0, 0, 0);
                          if (items.length) setSelectedDay(d);
                          else abrirAgendar('', dt);
                        }}
                        className="min-h-[40px] p-1 border-l border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                      >
                        {items.map((c) => (
                          <div key={c.id} className="text-[10px] rounded px-1 py-0.5 mb-0.5 truncate" style={{}}
                            onClick={(e) => { e.stopPropagation(); setSelectedDay(d); }}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${colorPorAsesor[c.asesorId] || 'bg-slate-400'}`} />
                            {hora(c.fechaHoraInicio)} {c.cliente?.nombre}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title={selectedDay ? `Citas · ${selectedDay.toLocaleDateString('es-MX')}` : 'Selecciona un día'}>
          {isLoading ? <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div> :
            !selectedDay ? <EmptyState message="Selecciona un día del calendario" /> :
            citasDiaSel.length === 0 ? <EmptyState message="Sin citas este día" /> : (
              <ul className="space-y-3">
                {citasDiaSel.sort((a, b) => new Date(a.fechaHoraInicio) - new Date(b.fechaHoraInicio)).map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.titulo}</p>
                      <CitaBadge estado={c.estado} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)} · {c.tipo}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${colorPorAsesor[c.asesorId] || 'bg-slate-400'}`} />
                      {c.asesor?.nombre} {c.asesor?.apellidoP} · {c.cliente?.nombre} {c.cliente?.apellidoP} {c.cliente?.telefono ? `· ${c.cliente.telefono}` : ''}
                    </p>
                    {c.ubicacion && <p className="text-xs text-slate-400 dark:text-slate-500">{c.ubicacion}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Asesor: {c.asesor?.nombre} {c.asesor?.apellidoP}</span>
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
      <Modal open={open} onClose={() => setOpen(false)} title="Agendar acompañamiento">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asesor*">
              <select
                className="input"
                required
                value={form.asesorId}
                onChange={(e) => setForm({ ...form, asesorId: e.target.value, clienteId: '' })}
              >
                <option value="">Selecciona…</option>
                {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
              </select>
            </Field>
            <Field label="Cliente*">
              <select className="input" required value={form.clienteId} disabled={!form.asesorId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">{form.asesorId ? 'Selecciona…' : 'Elige asesor primero'}</option>
                {clientesAsesor?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Título*"><input className="input" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Acompañamiento venta de póliza" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio*"><input type="datetime-local" className="input" required value={form.fechaHoraInicio} onChange={(e) => setForm({ ...form, fechaHoraInicio: e.target.value })} /></Field>
            <Field label="Fin"><input type="datetime-local" className="input" value={form.fechaHoraFin} onChange={(e) => setForm({ ...form, fechaHoraFin: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Ubicación"><input className="input" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Dirección o link de videollamada" /></Field>
          <Field label="Notas">
            <textarea className="input" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Objetivo de la visita, qué errores corregir, etc." />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Agendar'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal Eliminar */}
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
