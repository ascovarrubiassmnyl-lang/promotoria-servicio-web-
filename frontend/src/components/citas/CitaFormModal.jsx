import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Modal, Field } from '../ui.jsx';
import { CANALES, TIPOS_CITA, CLASIFICACIONES, CITA_VIVA, MODALIDADES_PROMOTOR, infoCanal } from './tipos.js';
import { hora, fechaCorta, isoLocalInput } from '../../lib/format.js';

const DURACION_DEFAULT_MIN = 30;

const sumarMinutos = (isoLocal, min) => {
  const d = new Date(isoLocal);
  d.setMinutes(d.getMinutes() + min);
  return isoLocalInput(d);
};

// Modal único para agendar y reagendar citas, compartido por calendario y
// ficha de cliente. El estado NO se pide: toda cita nace PROGRAMADA.
//  - clienteId: fija el cliente y oculta su selector (ficha de cliente).
//  - asesorId: scope admin — la cita/el listado de clientes es de ese asesor.
//  - cita: modo edición/reagendar (PATCH); sin ella es alta (POST).
//  - preFecha: Date para prellenar el inicio (día seleccionado en el calendario).
//  - candidatoId: fija el candidato y oculta su selector (perfil del candidato).
//  - preModalidad: modalidad preseleccionada (entrevista según la etapa del candidato).
export default function CitaFormModal({ open, onClose, onSaved, cita = null, clienteId = null, asesorId = null, preFecha = null, candidatoId = null, preModalidad = null }) {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const editando = !!cita;

  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editando) {
      setForm({
        asesorId: cita.asesorId,
        clienteId: cita.clienteId,
        candidatoId: cita.candidatoId || '',
        // Evento personal = sin cliente (bloqueo de agenda, clasificación roja).
        // La agenda propia del promotor (PRP/entrevistas) también vive sin
        // cliente pero NO es un evento personal: debe conservar su selector
        // de Tipo de cita y Clasificación al editar.
        esPersonal: !cita.clienteId && !MODALIDADES_PROMOTOR.includes(cita.modalidad),
        titulo: cita.titulo,
        descripcion: cita.descripcion || '',
        modalidad: cita.modalidad || 'CITA_UNICA',
        clasificacion: cita.clasificacion || 'PRODUCTIVA',
        promotorId: cita.promotorId || '',
        tipo: cita.tipo || 'PRESENCIAL',
        fechaHoraInicio: isoLocalInput(new Date(cita.fechaHoraInicio)),
        fechaHoraFin: isoLocalInput(new Date(cita.fechaHoraFin)),
        ubicacion: cita.ubicacion || '',
      });
    } else {
      // Inicio prellenado: día seleccionado a las 10:00, o la próxima media hora si es hoy/no hay día.
      const base = preFecha ? new Date(preFecha) : new Date();
      if (preFecha && preFecha.getHours() === 0) base.setHours(10, 0, 0, 0);
      else { base.setMinutes(base.getMinutes() + (30 - (base.getMinutes() % 30)) % 30 || 30, 0, 0); }
      const inicio = isoLocalInput(base);
      setForm({
        asesorId: asesorId || '',
        clienteId: clienteId || '',
        candidatoId: candidatoId || '',
        esPersonal: false,
        titulo: '',
        descripcion: '',
        modalidad: preModalidad || 'CITA_UNICA',
        // Las entrevistas de reclutamiento no generan dinero directo: nacen
        // como Gestión (el color puede cambiarse antes de guardar).
        clasificacion: preModalidad && MODALIDADES_PROMOTOR.includes(preModalidad) ? 'GESTION' : 'PRODUCTIVA',
        promotorId: '',
        tipo: 'PRESENCIAL',
        fechaHoraInicio: inicio,
        fechaHoraFin: sumarMinutos(inicio, DURACION_DEFAULT_MIN),
        ubicacion: '',
      });
    }
    setErr('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selector de asesor solo para admin en alta sin scope fijo. Las modalidades
  // de agenda propia del promotor (PRP, entrevistas) nunca lo requieren: son
  // eventos del propio promotor, no de un asesor.
  const necesitaAsesor = esAdmin() && !editando && !clienteId && !asesorId && !MODALIDADES_PROMOTOR.includes(form?.modalidad);
  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: open && necesitaAsesor,
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes-cita', form?.asesorId || 'propios'],
    queryFn: async () => (await api.get('/clientes', { params: { asesorId: form?.asesorId || undefined } })).data,
    enabled: open && !editando && !clienteId && !MODALIDADES_PROMOTOR.includes(form?.modalidad) && (!necesitaAsesor || !!form?.asesorId),
  });

  const { data: promotores } = useQuery({
    queryKey: ['promotores-list'],
    queryFn: async () => (await api.get('/usuarios/promotores')).data,
    enabled: open,
  });

  // Candidatos para citas de reclutamiento (opcional: una PRP grupal puede no
  // llevar candidato). Solo admin — las modalidades propias no existen para asesor.
  const { data: candidatos } = useQuery({
    queryKey: ['candidatos-cita'],
    queryFn: async () => (await api.get('/candidatos')).data,
    enabled: open && esAdmin() && !candidatoId && MODALIDADES_PROMOTOR.includes(form?.modalidad),
  });

  // Detección de empalme en vivo: citas vivas del mismo asesor alrededor del inicio.
  const inicioValido = form?.fechaHoraInicio && !Number.isNaN(new Date(form.fechaHoraInicio).getTime());
  const finValido = form?.fechaHoraFin && !Number.isNaN(new Date(form.fechaHoraFin).getTime());
  const finDespuesDeInicio = inicioValido && finValido && new Date(form.fechaHoraFin) > new Date(form.fechaHoraInicio);

  const diaInicio = inicioValido ? form.fechaHoraInicio.slice(0, 10) : null;
  const { data: citasDia } = useQuery({
    queryKey: ['citas-empalme', diaInicio, form?.asesorId || 'yo'],
    queryFn: async () => {
      const desde = new Date(`${diaInicio}T00:00`); const hasta = new Date(`${diaInicio}T23:59:59`);
      const params = { desde: desde.toISOString(), hasta: hasta.toISOString() };
      if (esAdmin() && form?.asesorId) params.asesorId = form.asesorId;
      return (await api.get('/citas', { params })).data;
    },
    enabled: open && !!diaInicio,
  });

  const empalme = useMemo(() => {
    if (!inicioValido || !finValido || !citasDia) return null;
    const ini = new Date(form.fechaHoraInicio); const fin = new Date(form.fechaHoraFin);
    return citasDia.find((c) =>
      c.id !== cita?.id &&
      CITA_VIVA.includes(c.estado) &&
      (!esAdmin() || !form.asesorId || c.asesorId === form.asesorId) &&
      new Date(c.fechaHoraInicio) < fin && new Date(c.fechaHoraFin) > ini
    ) || null;
  }, [citasDia, form?.fechaHoraInicio, form?.fechaHoraFin, inicioValido, finValido]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null;

  const canal = infoCanal(form.tipo);

  const cambiarInicio = (v) => {
    // El fin se recalcula conservando la duración vigente (30 min por defecto).
    let dur = DURACION_DEFAULT_MIN;
    if (inicioValido && finValido && finDespuesDeInicio) {
      dur = Math.round((new Date(form.fechaHoraFin) - new Date(form.fechaHoraInicio)) / 60000);
    }
    setForm((f) => ({ ...f, fechaHoraInicio: v, fechaHoraFin: v ? sumarMinutos(v, dur) : f.fechaHoraFin }));
  };

  const esPersonal = !!form.esPersonal;
  const modalidadPropia = MODALIDADES_PROMOTOR.includes(form.modalidad);

  const submit = async (e) => {
    e.preventDefault();
    if (!editando && !esPersonal && !modalidadPropia && !form.clienteId) { setErr('Selecciona el cliente'); return; }
    if (!form.titulo || !form.fechaHoraInicio) { setErr('Título e inicio son requeridos'); return; }
    if (!finDespuesDeInicio) { setErr('El fin debe ser posterior al inicio'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        titulo: form.titulo,
        descripcion: form.descripcion,
        modalidad: esPersonal ? 'CITA_UNICA' : form.modalidad,
        // El candidato solo viaja en citas de reclutamiento; en cualquier otra
        // modalidad se limpia (el backend rechaza la combinación inválida).
        ...(editando || modalidadPropia ? { candidatoId: !esPersonal && modalidadPropia ? (form.candidatoId || null) : null } : {}),
        clasificacion: esPersonal ? 'PERSONAL' : form.clasificacion,
        promotorId: !esPersonal && form.modalidad === 'ACOMPANAMIENTO' ? (form.promotorId || undefined) : null,
        tipo: form.tipo,
        fechaHoraInicio: new Date(form.fechaHoraInicio).toISOString(),
        fechaHoraFin: new Date(form.fechaHoraFin).toISOString(),
        ubicacion: form.ubicacion,
        // Si el usuario ya vio la advertencia de empalme y guarda, se respeta su decisión.
        ignorarEmpalme: !!empalme,
      };
      if (editando) {
        await api.patch(`/citas/${cita.id}`, payload);
      } else {
        if (payload.candidatoId === null) delete payload.candidatoId;
        if (!esPersonal && !modalidadPropia) payload.clienteId = form.clienteId;
        if (esAdmin() && form.asesorId) payload.asesorId = form.asesorId;
        if (payload.promotorId === null) delete payload.promotorId;
        await api.post('/citas', payload);
      }
      qc.invalidateQueries(['citas']);
      qc.invalidateQueries(['citas-cal']);
      onSaved?.();
      onClose();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editando ? (esPersonal ? 'Editar evento personal' : 'Reagendar / editar cita') : 'Agendar cita'}>
      <form onSubmit={submit} className="space-y-3">
        {/* Evento personal: bloqueo de agenda sin cliente (rojo). Desde la
            ficha de un cliente no aplica; al editar, el carácter no cambia. */}
        {!clienteId && !editando && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={esPersonal}
              onChange={(e) => setForm({ ...form, esPersonal: e.target.checked, clienteId: e.target.checked ? '' : form.clienteId })}
            />
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${CLASIFICACIONES.PERSONAL.dot}`} />
              Evento personal (sin cliente — bloquea tu agenda)
            </span>
          </label>
        )}
        {necesitaAsesor && !esPersonal && (
          <Field label="Asesor*">
            <select className="input" required value={form.asesorId} onChange={(e) => setForm({ ...form, asesorId: e.target.value, clienteId: '' })}>
              <option value="">Selecciona…</option>
              <option value={user?.id}>Sin asesor (mi propia cita)</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">No toda cita es con un asesor: elige "Sin asesor" si es tuya.</p>
          </Field>
        )}
        {!editando && !clienteId && !esPersonal && !modalidadPropia && (
          <Field label="Cliente*">
            <select className="input" required value={form.clienteId} disabled={necesitaAsesor && !form.asesorId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">{necesitaAsesor && !form.asesorId ? 'Elige asesor primero' : 'Selecciona…'}</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP} {c.apellidoM || ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Título*">
          <input className="input" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Presentación de póliza" />
        </Field>

        {!esPersonal && (
          <>
            <Field label="Tipo de cita*">
              <select
                className="input"
                value={form.modalidad}
                onChange={(e) => {
                  const propia = MODALIDADES_PROMOTOR.includes(e.target.value);
                  setForm({
                    ...form,
                    modalidad: e.target.value,
                    clienteId: propia ? '' : form.clienteId,
                    asesorId: propia ? '' : form.asesorId,
                    candidatoId: propia ? form.candidatoId : '',
                    promotorId: e.target.value === 'ACOMPANAMIENTO' ? form.promotorId : '',
                  });
                }}
              >
                {Object.values(TIPOS_CITA).filter((t) => esAdmin() || !MODALIDADES_PROMOTOR.includes(t.value)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {modalidadPropia ? 'Agenda propia: no necesita asesor ni cliente.' : '"Acompañamiento" = el promotor asiste contigo a la cita.'}
              </p>
            </Field>
            {form.modalidad === 'ACOMPANAMIENTO' && (
              <Field label="Promotor que acompaña">
                <select className="input" value={form.promotorId} onChange={(e) => setForm({ ...form, promotorId: e.target.value })}>
                  <option value="">Sin asignar (luego lo elige el promotor)</option>
                  {promotores?.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidoP}</option>)}
                </select>
              </Field>
            )}
            {modalidadPropia && !candidatoId && (
              <Field label="Candidato (opcional)">
                <select className="input" value={form.candidatoId} onChange={(e) => setForm({ ...form, candidatoId: e.target.value })}>
                  <option value="">Sin candidato (ej. sesión grupal)</option>
                  {candidatos?.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP} {c.apellidoM || ''}</option>)}
                </select>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">La cita quedará ligada al expediente del candidato.</p>
              </Field>
            )}

            <Field label="Clasificación (color en el calendario)">
              <div className="grid grid-cols-3 gap-2">
                {Object.values(CLASIFICACIONES).map((cl) => (
                  <button
                    key={cl.value}
                    type="button"
                    onClick={() => setForm({ ...form, clasificacion: cl.value })}
                    className={`rounded-lg border px-2 py-2.5 text-xs font-medium flex flex-col items-center gap-1.5 transition ${
                      form.clasificacion === cl.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                        : 'border-slate-200 text-slate-500 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cl.dot}`} />
                    {cl.label}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {!esPersonal && (
          <Field label="Canal*">
            <div className="grid grid-cols-3 gap-2">
              {Object.values(CANALES).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm({ ...form, tipo: c.value })}
                  className={`rounded-lg border px-2 py-2.5 text-xs font-medium flex flex-col items-center gap-1.5 transition ${
                    form.tipo === c.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-slate-200 text-slate-500 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio*">
            <input type="datetime-local" className="input" required value={form.fechaHoraInicio} onChange={(e) => cambiarInicio(e.target.value)} />
          </Field>
          <Field label="Fin*">
            <input type="datetime-local" className="input" required value={form.fechaHoraFin} onChange={(e) => setForm({ ...form, fechaHoraFin: e.target.value })} />
          </Field>
        </div>
        {inicioValido && finValido && !finDespuesDeInicio ? (
          <p className="text-xs text-red-600 dark:text-red-400">El fin debe ser posterior al inicio.</p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1">Duración por defecto: 30 min. El fin se ajusta solo al cambiar el inicio.</p>
        )}

        {empalme && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            ⚠ Se empalma con <strong>{empalme.titulo}</strong> el {fechaCorta(empalme.fechaHoraInicio)} de {hora(empalme.fechaHoraInicio)} a {hora(empalme.fechaHoraFin)}. Puedes guardar de todas formas, pero revisa el horario.
          </div>
        )}

        <Field label={esPersonal ? 'Ubicación (opcional)' : canal.ubicacionLabel}>
          <input className="input" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder={esPersonal ? 'Ubicación (opcional)' : canal.ubicacionLabel} />
        </Field>
        <Field label="Notas">
          <textarea className="input" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Objetivo de la cita" />
        </Field>

        {!editando && (
          <p className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            Se guardará como <strong>Programada</strong>. El estado cambia después con las acciones de la cita (completar, cancelar, no asistió).
          </p>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : empalme ? 'Guardar de todas formas' : editando ? 'Guardar cambios' : 'Agendar cita'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
