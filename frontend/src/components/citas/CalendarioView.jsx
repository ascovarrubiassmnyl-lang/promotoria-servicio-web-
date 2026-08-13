import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Modal, CitaBadge, EmptyState, MenuAcciones, Field } from '../ui.jsx';
import { CANALES, ESTADOS_CITA, CLASIFICACIONES, CITA_VIVA, MODALIDADES_PROMOTOR, DISPONIBILIDAD_ESTILO, infoCanal, infoTipoCita, colorCita, infoInvitacion } from './tipos.js';
import CitaFormModal from './CitaFormModal.jsx';
import CalendarioMovil from './CalendarioMovil.jsx';
import useIsMobile from '../../hooks/useIsMobile.js';
import { hora, nombreMes, fechaCorta } from '../../lib/format.js';

const DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HORA_INI = 8;
const HORA_FIN = 20;
const ALTO_HORA = 46; // px por hora en la vista Semana

const startOfWeek = (d) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
};
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const keyDeCita = (c) => dayKey(new Date(c.fechaHoraInicio));

// Calendario compartido por ambos roles (mismo patrón que PolizasView/ActividadView):
// el asesor ve solo su agenda (la API fuerza asesorId); el promotor ve al equipo
// con filtro por asesor y sus propios acompañamientos.
// En móvil (< md) se monta un árbol distinto (CalendarioMovil: Día/Agenda/Mes con
// timeline de una columna); el markup de escritorio de abajo no se toca.
export default function CalendarioView() {
  const esMovil = useIsMobile();
  return esMovil ? <CalendarioMovil /> : <CalendarioEscritorio />;
}

// Ficha técnica de una cita: se abre al hacer clic en el evento del calendario.
// Los campos rápidos (título, horario, canal, clasificación, estado, ubicación,
// notas) se editan aquí mismo; el cambio de cliente/asesor/modalidad sigue
// viviendo en CitaFormModal ("Reagendar / editar"), que es el formulario único.
function FichaCita({ cita, onClose, onReagendar, onEliminar, onCambiarEstado, esAdmin, usuarioId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');
  const [respondiendo, setRespondiendo] = useState(false);
  // Formulario inline de "sugerir otra hora" (visto solo por el promotor invitado).
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerencia, setSugerencia] = useState({ inicio: '', fin: '', nota: '' });

  const invalidarCitas = () => { qc.invalidateQueries(['citas-cal']); qc.invalidateQueries(['citas']); };

  // Responder la invitación de acompañamiento: solo la ve el promotor invitado
  // mientras esté pendiente (el backend vuelve a validarlo).
  const responder = async (respuesta) => {
    setRespondiendo(true);
    setErr('');
    try {
      try {
        await api.patch(`/citas/${cita.id}/invitacion`, { respuesta });
      } catch (e) {
        const empalme = e?.response?.status === 409 && e?.response?.data?.empalme;
        if (!empalme) throw e;
        const otra = e.response.data.empalme;
        const ok = window.confirm(`Ya tienes "${otra.titulo}" a esa hora (${hora(otra.fechaHoraInicio)} – ${hora(otra.fechaHoraFin)}).\n\n¿Aceptar de todos modos?`);
        if (!ok) { setRespondiendo(false); return; }
        await api.patch(`/citas/${cita.id}/invitacion`, { respuesta, ignorarEmpalme: true });
      }
      invalidarCitas();
      onClose();
    } catch (e2) {
      setErr(handleError(e2));
    } finally { setRespondiendo(false); }
  };

  // Enviar la propuesta de otro horario (promotor). La cita conserva su
  // horario original hasta que el asesor la acepte.
  const enviarSugerencia = async () => {
    if (!sugerencia.inicio || !sugerencia.fin) { setErr('Indica inicio y fin de la propuesta'); return; }
    if (new Date(sugerencia.fin) <= new Date(sugerencia.inicio)) { setErr('El fin debe ser posterior al inicio'); return; }
    setRespondiendo(true);
    setErr('');
    try {
      await api.patch(`/citas/${cita.id}/invitacion`, {
        respuesta: 'SUGERIDA',
        sugerenciaInicio: new Date(sugerencia.inicio).toISOString(),
        sugerenciaFin: new Date(sugerencia.fin).toISOString(),
        sugerenciaNota: sugerencia.nota.trim() || undefined,
      });
      invalidarCitas();
      onClose();
    } catch (e2) {
      setErr(handleError(e2));
    } finally { setRespondiendo(false); }
  };

  // Responder a la sugerencia del promotor (asesor dueño de la cita).
  const responderSugerencia = async (aceptar) => {
    setRespondiendo(true);
    setErr('');
    try {
      try {
        await api.patch(`/citas/${cita.id}/invitacion/sugerencia`, { aceptar });
      } catch (e) {
        const empalme = e?.response?.status === 409 && e?.response?.data?.empalme;
        if (!empalme) throw e;
        const otra = e.response.data.empalme;
        const ok = window.confirm(`Ya tienes "${otra.titulo}" a esa hora (${hora(otra.fechaHoraInicio)} – ${hora(otra.fechaHoraFin)}).\n\n¿Aceptar de todos modos?`);
        if (!ok) { setRespondiendo(false); return; }
        await api.patch(`/citas/${cita.id}/invitacion/sugerencia`, { aceptar, ignorarEmpalme: true });
      }
      invalidarCitas();
      onClose();
    } catch (e2) {
      setErr(handleError(e2));
    } finally { setRespondiendo(false); }
  };

  const paraInput = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // Se re-inicializa al abrir otra cita (o al refrescarse la que está abierta).
  useEffect(() => {
    if (!cita) { setForm(null); return; }
    setErr('');
    setSugiriendo(false);
    setForm({
      titulo: cita.titulo || '',
      fechaHoraInicio: paraInput(cita.fechaHoraInicio),
      fechaHoraFin: paraInput(cita.fechaHoraFin),
      tipo: cita.tipo || 'PRESENCIAL',
      clasificacion: cita.clasificacion || 'PRODUCTIVA',
      estado: cita.estado,
      ubicacion: cita.ubicacion || '',
      descripcion: cita.descripcion || '',
    });
  }, [cita?.id, cita?.actualizadoEn, cita?.estado, cita?.fechaHoraInicio]);

  if (!cita || !form) return null;

  const color = colorCita(cita);
  const viva = CITA_VIVA.includes(cita.estado);
  const soyElInvitado = !!usuarioId && cita.promotorId === usuarioId;
  const sucio = (
    form.titulo !== (cita.titulo || '') ||
    form.fechaHoraInicio !== paraInput(cita.fechaHoraInicio) ||
    form.fechaHoraFin !== paraInput(cita.fechaHoraFin) ||
    form.tipo !== (cita.tipo || 'PRESENCIAL') ||
    form.clasificacion !== (cita.clasificacion || 'PRODUCTIVA') ||
    form.estado !== cita.estado ||
    form.ubicacion !== (cita.ubicacion || '') ||
    form.descripcion !== (cita.descripcion || '')
  );

  const guardar = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.titulo.trim()) { setErr('El título es obligatorio'); return; }
    if (new Date(form.fechaHoraFin) <= new Date(form.fechaHoraInicio)) { setErr('El fin debe ser posterior al inicio'); return; }
    setGuardando(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        fechaHoraInicio: new Date(form.fechaHoraInicio).toISOString(),
        fechaHoraFin: new Date(form.fechaHoraFin).toISOString(),
        tipo: form.tipo,
        clasificacion: form.clasificacion,
        estado: form.estado,
        ubicacion: form.ubicacion.trim() || null,
        descripcion: form.descripcion.trim() || null,
      };
      try {
        await api.patch(`/citas/${cita.id}`, payload);
      } catch (e2) {
        // Empalme con otra cita viva: se advierte, no se bloquea (misma
        // convención que el alta en CitaFormModal).
        const empalme = e2?.response?.status === 409 && e2?.response?.data?.empalme;
        if (!empalme) throw e2;
        const otra = e2.response.data.empalme;
        const ok = window.confirm(`Se empalma con "${otra.titulo}" (${hora(otra.fechaHoraInicio)} – ${hora(otra.fechaHoraFin)}).\n\n¿Guardar de todos modos?`);
        if (!ok) { setGuardando(false); return; }
        await api.patch(`/citas/${cita.id}`, { ...payload, ignorarEmpalme: true });
      }
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
      onClose();
    } catch (e3) {
      setErr(handleError(e3));
    } finally { setGuardando(false); }
  };

  const canal = infoCanal(form.tipo);

  return (
    <Modal open={!!cita} onClose={onClose} title="Ficha de la cita">
      <form onSubmit={guardar} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${color.chip}`}>
            <span className={`w-2 h-2 rounded-full ${color.dot}`} />{color.label}
          </span>
          <CitaBadge estado={cita.estado} />
          {cita.serieId && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              ↻ Parte de una serie repetida
            </span>
          )}
        </div>

        {/* Invitación de acompañamiento: el promotor invitado responde (aceptar /
            rechazar / sugerir otra hora); el asesor dueño responde una sugerencia
            del promotor; los demás solo ven en qué estado va. */}
        {cita.invitacionEstado && (
          soyElInvitado && cita.invitacionEstado === 'PENDIENTE' ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-700 dark:bg-amber-900/25">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {cita.asesor?.nombre} {cita.asesor?.apellidoP} te invitó a acompañar esta cita.
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                Hasta que la aceptes no ocupa tu agenda.
              </p>
              {!sugiriendo ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={respondiendo} onClick={() => responder('ACEPTADA')} className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-transparent dark:text-emerald-400">✓ Aceptar</button>
                  <button type="button" disabled={respondiendo} onClick={() => responder('RECHAZADA')} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300">Rechazar</button>
                  <button type="button" disabled={respondiendo} onClick={() => { setSugiriendo(true); setSugerencia({ inicio: paraInput(cita.fechaHoraInicio), fin: paraInput(cita.fechaHoraFin), nota: '' }); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300">↻ Sugerir otra hora</button>
                </div>
              ) : (
                <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-white/60 p-2.5 dark:border-amber-800 dark:bg-transparent">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Nuevo inicio*">
                      <input type="datetime-local" className="input" value={sugerencia.inicio} onChange={(e) => setSugerencia({ ...sugerencia, inicio: e.target.value })} />
                    </Field>
                    <Field label="Nuevo fin*">
                      <input type="datetime-local" className="input" value={sugerencia.fin} onChange={(e) => setSugerencia({ ...sugerencia, fin: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Nota (opcional)">
                    <input className="input" value={sugerencia.nota} onChange={(e) => setSugerencia({ ...sugerencia, nota: e.target.value })} placeholder="Ej. Tengo junta, ¿te va mejor a esta hora?" />
                  </Field>
                  <div className="flex gap-2">
                    <button type="button" disabled={respondiendo} onClick={enviarSugerencia} className="rounded-lg border border-brand-300 bg-white px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:bg-transparent dark:text-brand-400">Enviar propuesta</button>
                    <button type="button" disabled={respondiendo} onClick={() => setSugiriendo(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ) : !soyElInvitado && cita.asesorId === usuarioId && cita.invitacionEstado === 'SUGERIDA' && cita.sugerenciaInicio ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-700 dark:bg-amber-900/25">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {cita.promotor?.nombre} {cita.promotor?.apellidoP} propuso otro horario:
              </p>
              <p className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                {fechaCorta(cita.sugerenciaInicio)} · {hora(cita.sugerenciaInicio)} – {hora(cita.sugerenciaFin)}
              </p>
              {cita.sugerenciaNota && <p className="mt-0.5 text-xs italic text-amber-700 dark:text-amber-300">"{cita.sugerenciaNota}"</p>}
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={respondiendo} onClick={() => responderSugerencia(true)} className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-transparent dark:text-emerald-400">✓ Aceptar nuevo horario</button>
                <button type="button" disabled={respondiendo} onClick={() => responderSugerencia(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300">No me sirve</button>
              </div>
            </div>
          ) : (
            <p className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
              cita.invitacionEstado === 'ACEPTADA' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : cita.invitacionEstado === 'RECHAZADA' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
              {infoInvitacion(cita.invitacionEstado)?.icono} {infoInvitacion(cita.invitacionEstado)?.label}
              {cita.invitacionEstado === 'SUGERIDA' && cita.sugerenciaInicio ? ` · propone ${fechaCorta(cita.sugerenciaInicio)} ${hora(cita.sugerenciaInicio)}` : ''}
            </p>
          )
        )}

        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
          <p>
            {cita.cliente
              ? <>Cliente: <strong>{cita.cliente.nombre} {cita.cliente.apellidoP}</strong>{cita.cliente.telefono ? ` · ${cita.cliente.telefono}` : ''}</>
              : cita.candidato
                ? <>Candidato: <strong>{cita.candidato.nombre} {cita.candidato.apellidoP}</strong>{cita.candidato.telefono ? ` · ${cita.candidato.telefono}` : ''}</>
                : MODALIDADES_PROMOTOR.includes(cita.modalidad) ? infoTipoCita(cita.modalidad).label : 'Evento personal (sin cliente)'}
          </p>
          <p>Tipo de cita: {infoTipoCita(cita.modalidad).label}</p>
          {cita.modalidad === 'ACOMPANAMIENTO' && (
            <p className="text-violet-700 dark:text-violet-300">
              ◎ Acompañamiento{cita.promotor ? ` · ${cita.promotor.nombre} ${cita.promotor.apellidoP}` : ' · promotor por asignar'}
            </p>
          )}
          {esAdmin && <p>Asesor: {cita.asesor?.nombre} {cita.asesor?.apellidoP}</p>}
        </div>

        <Field label="Título*">
          <input className="input" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio*">
            <input type="datetime-local" className="input" required value={form.fechaHoraInicio} onChange={(e) => setForm({ ...form, fechaHoraInicio: e.target.value })} />
          </Field>
          <Field label="Fin*">
            <input type="datetime-local" className="input" required value={form.fechaHoraFin} onChange={(e) => setForm({ ...form, fechaHoraFin: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Clasificación">
            <select className="input" value={form.clasificacion} onChange={(e) => setForm({ ...form, clasificacion: e.target.value })}>
              {Object.values(CLASIFICACIONES).map((cl) => <option key={cl.value} value={cl.value}>{cl.label}</option>)}
            </select>
          </Field>
          <Field label="Canal">
            <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {Object.values(CANALES).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado">
            <select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {Object.values(ESTADOS_CITA).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label={canal.ubicacionLabel || 'Ubicación'}>
            <input className="input" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          </Field>
        </div>

        <Field label="Notas">
          <textarea className="input" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Objetivo de la cita" />
        </Field>

        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

        {viva && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-700 pt-3">
            <button type="button" onClick={async () => { await onCambiarEstado(cita, 'COMPLETADA'); onClose(); }} className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">✓ Completar</button>
            <button type="button" onClick={async () => { await onCambiarEstado(cita, 'NO_ASISTIO'); onClose(); }} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">No asistió</button>
            <button type="button" onClick={async () => { await onCambiarEstado(cita, 'CANCELADA'); onClose(); }} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Cancelar cita</button>
            <button type="button" onClick={() => onReagendar(cita)} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Cambiar cliente / tipo…</button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <button type="button" onClick={() => onEliminar(cita)} className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">Eliminar definitivamente</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cerrar</button>
            <button type="submit" disabled={guardando || !sucio} className="btn-primary disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Franja horaria del calendario (8:00–20:00, ver HORA_INI/HORA_FIN) partida en
// "ocupado" (bloques del promotor) y "libre" (huecos entre ellos, incluidos los
// extremos del día). Cada hueco libre agenda directo un acompañamiento a esa
// hora — el asesor no tiene que ir a buscar la celda vacía en la grilla.
function BloquesOcupadosDelDia({ dia, bloques, promotor, onAgendar }) {
  const segmentos = useMemo(() => {
    const ini = new Date(dia); ini.setHours(HORA_INI, 0, 0, 0);
    const fin = new Date(dia); fin.setHours(HORA_FIN, 0, 0, 0);
    const ocupados = [...bloques]
      .map((b) => ({ inicio: new Date(b.inicio), fin: new Date(b.fin) }))
      .sort((a, b) => a.inicio - b.inicio);
    const out = [];
    let cursor = ini;
    for (const b of ocupados) {
      const bIni = b.inicio < ini ? ini : b.inicio;
      const bFin = b.fin > fin ? fin : b.fin;
      if (bFin <= cursor) continue; // fuera de rango o ya cubierto
      if (bIni > cursor) out.push({ tipo: 'libre', inicio: cursor, fin: bIni });
      out.push({ tipo: 'ocupado', inicio: bIni, fin: bFin });
      cursor = bFin > cursor ? bFin : cursor;
    }
    if (cursor < fin) out.push({ tipo: 'libre', inicio: cursor, fin });
    return out;
  }, [dia, bloques]);

  return (
    <div className="mb-3 space-y-1.5 border-b border-slate-100 dark:border-slate-700 pb-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Horarios de {promotor ? `${promotor.nombre} ${promotor.apellidoP}` : 'el promotor'}
      </p>
      {segmentos.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sin información en el horario de 8:00 a 20:00.</p>
      ) : (
        <ul className="space-y-1">
          {segmentos.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 ${s.tipo === 'ocupado' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                <span className={`w-2 h-2 rounded-full ${s.tipo === 'ocupado' ? 'bg-slate-400 dark:bg-slate-500' : 'bg-emerald-500'}`} />
                {hora(s.inicio)} – {hora(s.fin)} · {s.tipo === 'ocupado' ? DISPONIBILIDAD_ESTILO.label : 'Libre'}
              </span>
              {s.tipo === 'libre' && (
                <button type="button" onClick={() => onAgendar(s.inicio)} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  Agendar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CalendarioEscritorio() {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const hoy = new Date();

  // Mes por defecto para ambos roles (misma UI de entrada para asesor y promotor).
  const [view, setView] = useState('mes');
  const [refDate, setRefDate] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const [selectedDay, setSelectedDay] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const [fCanal, setFCanal] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fClasif, setFClasif] = useState('');
  const [fAsesor, setFAsesor] = useState('');
  // Promotor cuya disponibilidad se superpone en la vista Semana (solo asesores):
  // sirve para elegir la hora de un acompañamiento sin preguntarle antes.
  const [fPromotor, setFPromotor] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [preFecha, setPreFecha] = useState(null);
  const [prePromotor, setPrePromotor] = useState(null);
  const [citaEdit, setCitaEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Ficha técnica de la cita: se abre al hacer clic en el evento (en cualquier
  // vista) y concentra el detalle + las acciones, sin obligar a buscar la cita
  // en el panel lateral del día.
  const [detalle, setDetalle] = useState(null);

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });

  // Espejo del selector de asesor: el promotor filtra por asesor, el asesor
  // consulta la disponibilidad de un promotor. Cada rol ve solo uno de los dos.
  const { data: promotores } = useQuery({
    queryKey: ['promotores-list'],
    queryFn: async () => (await api.get('/usuarios/promotores')).data,
    enabled: !esAdmin(),
  });

  // Rango visible: Semana navega por semana; Mes y Agenda por mes.
  const [desde, hasta] = useMemo(() => {
    if (view === 'semana') {
      const ini = startOfWeek(refDate);
      const fin = new Date(ini); fin.setDate(fin.getDate() + 6); fin.setHours(23, 59, 59, 999);
      return [ini, fin];
    }
    const ini = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const fin = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return [ini, fin];
  }, [view, refDate]);

  const { data: citas, isLoading } = useQuery({
    queryKey: ['citas-cal', desde.toISOString(), hasta.toISOString(), fAsesor],
    queryFn: async () => {
      const params = { desde: desde.toISOString(), hasta: hasta.toISOString() };
      if (esAdmin()) {
        if (fAsesor === '__mios__') params.promotorId = user?.id; // acompañamientos donde participo
        else if (fAsesor) params.asesorId = fAsesor;
      }
      return (await api.get('/citas', { params })).data;
    },
  });

  const filtradas = useMemo(
    () => (citas || []).filter((c) => (!fCanal || c.tipo === fCanal) && (!fEstado || c.estado === fEstado) && (!fClasif || (c.clasificacion || 'PRODUCTIVA') === fClasif)),
    [citas, fCanal, fEstado, fClasif]
  );

  const porDia = useMemo(() => {
    const m = {};
    filtradas.forEach((c) => { (m[keyDeCita(c)] ||= []).push(c); });
    Object.values(m).forEach((l) => l.sort((a, b) => new Date(a.fechaHoraInicio) - new Date(b.fechaHoraInicio)));
    return m;
  }, [filtradas]);

  // Agenda ocupada del promotor elegido: solo rangos, sin detalle (el endpoint
  // no lo expone). Se pinta como capa de fondo en la vista Semana.
  const { data: disponibilidad } = useQuery({
    queryKey: ['disponibilidad-cal', desde.toISOString(), hasta.toISOString(), fPromotor],
    queryFn: async () => (await api.get('/citas/disponibilidad', {
      params: { usuarioId: fPromotor, desde: desde.toISOString(), hasta: hasta.toISOString() },
    })).data,
    enabled: !!fPromotor,
  });

  const ocupadoPorDia = useMemo(() => {
    const m = {};
    (disponibilidad?.bloques || []).forEach((b) => { (m[dayKey(new Date(b.inicio))] ||= []).push(b); });
    return m;
  }, [disponibilidad]);

  const promotorVisto = useMemo(
    () => (promotores || []).find((p) => p.id === fPromotor) || null,
    [promotores, fPromotor]
  );

  const esHoy = (d) => d.toDateString() === hoy.toDateString();
  const citasDiaSel = selectedDay ? (porDia[dayKey(selectedDay)] || []) : [];

  // La ficha se re-lee de la lista viva: tras completar/cancelar/reagendar el
  // panel refleja el estado nuevo en vez de quedarse con la copia del clic.
  const citaDetalle = useMemo(
    () => (detalle ? (citas || []).find((c) => c.id === detalle.id) || null : null),
    [detalle, citas]
  );

  // ---------- Navegación ----------
  const step = (dir) => {
    const r = new Date(refDate);
    if (view === 'semana') r.setDate(r.getDate() + 7 * dir);
    else r.setMonth(r.getMonth() + dir);
    setRefDate(r);
    setSelectedDay(null);
  };
  const goHoy = () => {
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    setRefDate(h); setSelectedDay(h);
  };

  const tituloPeriodo = useMemo(() => {
    if (view === 'semana') {
      const fin = new Date(desde); fin.setDate(fin.getDate() + 6);
      return `${desde.getDate()} ${nombreMes(desde.getMonth() + 1).slice(0, 3).toLowerCase()} – ${fin.getDate()} ${nombreMes(fin.getMonth() + 1).slice(0, 3).toLowerCase()} ${fin.getFullYear()}`;
    }
    return `${nombreMes(refDate.getMonth() + 1)} ${refDate.getFullYear()}`;
  }, [view, desde, refDate]);

  // ---------- Acciones de ciclo de vida ----------
  const cambiarEstado = async (c, estado) => {
    try {
      await api.patch(`/citas/${c.id}`, { estado });
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
    } catch (e) { alert(handleError(e)); }
  };

  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/citas/${toDelete.id}`);
      setToDelete(null);
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
    } catch (e) { alert(handleError(e)); } finally { setDeleting(false); }
  };

  // Con la disponibilidad de un promotor a la vista, agendar significa casi
  // siempre "acompañamiento con él a esta hora": se prellena para no repetir la
  // elección (el modal deja cambiar todo antes de guardar).
  const abrirAgendar = (fecha = null) => {
    setCitaEdit(null);
    setPreFecha(fecha);
    setPrePromotor(fPromotor || null);
    setModalOpen(true);
  };
  const abrirReagendar = (c) => { setCitaEdit(c); setPreFecha(null); setModalOpen(true); };

  // ---------- Celdas / chips ----------
  // La vista Mes usa el mismo chip con fondo de color en todos los tamaños
  // (antes escritorio mostraba solo un punto de 1.5px sin fondo, casi
  // invisible — feedback de la promotora 2026-07-30). El color del evento es
  // la CLASIFICACIÓN (verde/ámbar/rojo, colorCita); el canal queda como
  // etiqueta en el panel del día.
  // Clic en el chip = abrir la ficha técnica de esa cita (no solo seleccionar
  // el día). Va como <span role="button"> porque en la vista Mes el chip vive
  // dentro del <button> de la celda (un <button> anidado es HTML inválido).
  const LineaCita = ({ c, className = '' }) => {
    const color = colorCita(c);
    const cancelada = c.estado === 'CANCELADA';
    // Invitación pendiente = todavía no ocupa la agenda: se dibuja punteada.
    const porConfirmar = c.invitacionEstado === 'PENDIENTE';
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setDetalle(c); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setDetalle(c); } }}
        title={`${c.titulo}${porConfirmar ? ' — invitación por confirmar' : ''} — clic para ver y editar`}
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium truncate cursor-pointer hover:ring-1 hover:ring-brand-400 ${color.chip} ${porConfirmar ? 'border border-dashed border-current opacity-70' : ''} ${cancelada ? 'line-through opacity-50' : ''} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
        <span className="tabular-nums shrink-0">{hora(c.fechaHoraInicio)}</span>
        <span className="truncate">{porConfirmar ? '⏳ ' : ''}{c.cliente?.nombre || c.titulo}</span>
      </span>
    );
  };

  // ---------- Vista Mes ----------
  const gridMes = useMemo(() => {
    if (view !== 'mes') return [];
    const g = [];
    for (let i = 0; i < desde.getDay(); i++) g.push(null);
    for (let d = 1; d <= hasta.getDate(); d++) g.push(new Date(refDate.getFullYear(), refDate.getMonth(), d));
    while (g.length % 7 !== 0) g.push(null);
    return g;
  }, [view, desde, hasta, refDate]);

  const VistaMes = () => (
    <>
      <div className="grid grid-cols-7 text-center text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
        {DIAS_SEM.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gridMes.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[88px] rounded-lg bg-slate-50/60 dark:bg-slate-800/40 md:min-h-[80px] md:bg-transparent dark:md:bg-transparent" />;
          const items = porDia[dayKey(d)] || [];
          const sel = selectedDay && selectedDay.toDateString() === d.toDateString();
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(d)}
              onDoubleClick={(e) => { e.preventDefault(); const dt = new Date(d); dt.setHours(0, 0, 0, 0); abrirAgendar(dt); }}
              className={`min-h-[88px] rounded-lg border p-1.5 text-left transition md:min-h-[80px] ${sel ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
              title="Doble clic para agendar"
            >
              <div className={`text-xs font-semibold md:font-normal ${esHoy(d) ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center' : 'text-slate-600 dark:text-slate-300'}`}>{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((c) => <LineaCita key={c.id} c={c} />)}
                {items.length > 3 && <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-1">+{items.length - 3} más</p>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );

  // ---------- Vista Semana ----------
  const diasSemana = useMemo(() => {
    if (view !== 'semana') return [];
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(desde); d.setDate(d.getDate() + i); return d; });
  }, [view, desde]);

  const VistaSemana = () => (
    <div className="overflow-auto max-h-[620px]">
      <div className="grid grid-cols-[52px_repeat(7,1fr)] sticky top-0 bg-white dark:bg-slate-800 z-10 border-b border-slate-100 dark:border-slate-700">
        <div />
        {diasSemana.map((d) => (
          <button key={dayKey(d)} onClick={() => setSelectedDay(d)} className="py-2 text-center border-l border-slate-100 dark:border-slate-700">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{DIAS_SEM[d.getDay()]}</div>
            <div className={`mt-0.5 mx-auto w-7 h-7 leading-7 rounded-full text-sm font-semibold ${esHoy(d) ? 'bg-brand-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>{d.getDate()}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[52px_repeat(7,1fr)]">
        <div>
          {Array.from({ length: HORA_FIN - HORA_INI + 1 }, (_, i) => HORA_INI + i).map((h) => (
            <div key={h} className="text-[10px] text-slate-400 dark:text-slate-500 text-right pr-2" style={{ height: ALTO_HORA }}>
              {h > 12 ? h - 12 : h} {h >= 12 ? 'pm' : 'am'}
            </div>
          ))}
        </div>
        {diasSemana.map((d) => {
          const items = porDia[dayKey(d)] || [];
          return (
            <div key={dayKey(d)} className="relative border-l border-slate-100 dark:border-slate-700">
              {Array.from({ length: HORA_FIN - HORA_INI + 1 }, (_, i) => HORA_INI + i).map((h) => (
                <div
                  key={h}
                  className="border-b border-slate-50 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  style={{ height: ALTO_HORA }}
                  onClick={() => { const dt = new Date(d); dt.setHours(h, 0, 0, 0); abrirAgendar(dt); }}
                  title="Clic para agendar a esta hora"
                />
              ))}
              {/* Capa de agenda ocupada del promotor: va antes de los eventos
                  propios (que así quedan encima) y sin capturar el puntero, para
                  que el clic siga cayendo en la franja horaria y abra "Agendar". */}
              {fPromotor && (ocupadoPorDia[dayKey(d)] || []).map((b, i) => {
                const ini = new Date(b.inicio); const fin = new Date(b.fin);
                const minIni = Math.max(ini.getHours() * 60 + ini.getMinutes(), HORA_INI * 60);
                const minFin = Math.min(Math.max(fin.getHours() * 60 + fin.getMinutes(), minIni + 15), (HORA_FIN + 1) * 60);
                const top = ((minIni - HORA_INI * 60) / 60) * ALTO_HORA;
                const alto = ((minFin - minIni) / 60) * ALTO_HORA;
                return (
                  <div
                    key={`ocupado-${i}`}
                    className={`pointer-events-none absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 ${DISPONIBILIDAD_ESTILO.bloque}`}
                    style={{ top, height: Math.max(alto, 12) }}
                  >
                    {alto >= 20 && (
                      <div className={`text-[10px] font-semibold ${DISPONIBILIDAD_ESTILO.texto}`}>{DISPONIBILIDAD_ESTILO.label}</div>
                    )}
                  </div>
                );
              })}
              {items.map((c) => {
                const color = colorCita(c);
                const ini = new Date(c.fechaHoraInicio); const fin = new Date(c.fechaHoraFin);
                const minIni = Math.max(ini.getHours() * 60 + ini.getMinutes(), HORA_INI * 60);
                const minFin = Math.min(Math.max(fin.getHours() * 60 + fin.getMinutes(), minIni + 25), (HORA_FIN + 1) * 60);
                const top = ((minIni - HORA_INI * 60) / 60) * ALTO_HORA;
                const alto = ((minFin - minIni) / 60) * ALTO_HORA;
                const cancelada = c.estado === 'CANCELADA';
                return (
                  <button
                    key={c.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedDay(d); setDetalle(c); }}
                    title={`${c.titulo} — clic para ver y editar`}
                    className={`absolute left-0.5 right-0.5 rounded-md border-l-2 px-1.5 py-0.5 text-left overflow-hidden hover:ring-1 hover:ring-brand-400 ${color.chip} ${color.borde} ${cancelada ? 'line-through opacity-50' : ''}`}
                    style={{ top, height: Math.max(alto, 20) }}
                  >
                    <div className={`text-[10px] font-semibold tabular-nums ${color.text}`}>{hora(c.fechaHoraInicio)}</div>
                    <div className="text-[10px] font-medium text-slate-700 dark:text-slate-200 truncate">{c.titulo}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---------- Vista Agenda ----------
  const VistaAgenda = () => {
    const dias = Object.keys(porDia)
      .map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d); })
      .sort((a, b) => a - b);
    if (!dias.length) return <EmptyState message="Sin citas en este periodo." />;
    return (
      <div className="space-y-4">
        {dias.map((d) => {
          const items = porDia[dayKey(d)];
          return (
            <div key={dayKey(d)}>
              <div className="flex items-baseline gap-2 px-2 pb-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fechaCorta(d)}</p>
                {esHoy(d) && <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Hoy</span>}
                <span className="text-xs text-slate-400 dark:text-slate-500">{items.length} cita(s)</span>
              </div>
              {items.map((c) => {
                const canal = infoCanal(c.tipo);
                const color = colorCita(c);
                const cancelada = c.estado === 'CANCELADA';
                return (
                  <button key={c.id} onClick={() => { setSelectedDay(d); setDetalle(c); }} className="w-full flex gap-3 items-start rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <span className="w-[120px] shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400 pt-0.5">{hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)}</span>
                    <span className={`w-0.5 self-stretch rounded ${color.dot}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium text-slate-800 dark:text-slate-100 truncate ${cancelada ? 'line-through opacity-60' : ''}`}>{c.titulo}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">
                        {c.cliente ? `${c.cliente.nombre} ${c.cliente.apellidoP}` : c.candidato ? `${c.candidato.nombre} ${c.candidato.apellidoP} · ${infoTipoCita(c.modalidad).label}` : MODALIDADES_PROMOTOR.includes(c.modalidad) ? infoTipoCita(c.modalidad).label : 'Evento personal'} · {canal.label}
                        {c.modalidad === 'ACOMPANAMIENTO' && <span className="text-violet-600 dark:text-violet-400"> · + {c.promotor ? `${c.promotor.nombre} ${c.promotor.apellidoP}` : 'promotor por asignar'}</span>}
                        {esAdmin() && !fAsesor && <> · {c.asesor?.nombre} {c.asesor?.apellidoP}</>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Calendario</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {[['mes', 'Mes'], ['semana', 'Semana'], ['agenda', 'Agenda']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm ${view === v ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} className="btn-secondary px-3">←</button>
            <button onClick={goHoy} className="btn-secondary px-3">Hoy</button>
            <button onClick={() => step(1)} className="btn-secondary px-3">→</button>
            <span className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[130px] text-center">{tituloPeriodo}</span>
          </div>
          <button onClick={() => abrirAgendar(selectedDay)} className="btn-primary">+ Agendar cita</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {esAdmin() && (
          <select className="input w-auto" value={fAsesor} onChange={(e) => setFAsesor(e.target.value)}>
            <option value="">Todos los asesores</option>
            <option value="__mios__">Mis acompañamientos</option>
            <option value={user?.id}>Mi agenda</option>
            {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
          </select>
        )}
        {!esAdmin() && (
          <select className="input w-auto" value={fPromotor} onChange={(e) => setFPromotor(e.target.value)}>
            <option value="">Ver disponibilidad de…</option>
            {promotores?.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellidoP}</option>)}
          </select>
        )}
        <select className="input w-auto" value={fClasif} onChange={(e) => setFClasif(e.target.value)}>
          <option value="">Todas las clasificaciones</option>
          {Object.values(CLASIFICACIONES).map((cl) => <option key={cl.value} value={cl.value}>{cl.label}</option>)}
        </select>
        <select className="input w-auto" value={fCanal} onChange={(e) => setFCanal(e.target.value)}>
          <option value="">Todos los canales</option>
          {Object.values(CANALES).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="input w-auto" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.values(ESTADOS_CITA).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {/* Leyenda = clasificación (el color de los eventos). */}
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          {Object.values(CLASIFICACIONES).map((cl) => (
            <span key={cl.value} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cl.dot}`} />{cl.label}
            </span>
          ))}
        </div>
      </div>

      {/* La capa de disponibilidad necesita la rejilla por hora, que solo existe
          en Semana: si el asesor la activa desde Mes/Agenda hay que decírselo,
          o parecería que el promotor no tiene nada ocupado. */}
      {fPromotor && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          <span className={`inline-block h-3 w-5 rounded ${DISPONIBILIDAD_ESTILO.bloque}`} />
          <span>
            Horarios ocupados de <strong className="font-semibold">{promotorVisto ? `${promotorVisto.nombre} ${promotorVisto.apellidoP}` : 'el promotor'}</strong>.
            Solo indican que ya tiene algo agendado, no de qué se trata.
          </span>
          {view === 'semana'
            ? <span className="text-slate-500 dark:text-slate-400">Clic en un hueco libre para invitarlo a un acompañamiento.</span>
            : <button onClick={() => setView('semana')} className="font-semibold text-brand-600 underline dark:text-brand-400">Ver en la vista Semana</button>}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          {view === 'mes' ? <VistaMes /> : view === 'semana' ? <VistaSemana /> : <VistaAgenda />}
        </Card>

        <Card title={selectedDay ? `Citas · ${fechaCorta(selectedDay)}` : 'Selecciona un día'}>
          {/* Horarios ocupados del promotor elegido, para este día: se ven aquí
              también (no solo superpuestos en la grilla Semana), y cada hueco
              libre entre bloques permite agendar el acompañamiento directo. */}
          {fPromotor && selectedDay && (
            <BloquesOcupadosDelDia
              dia={selectedDay}
              bloques={ocupadoPorDia[dayKey(selectedDay)] || []}
              promotor={promotorVisto}
              onAgendar={(fecha) => abrirAgendar(fecha)}
            />
          )}
          {isLoading ? <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div> :
            !selectedDay ? <EmptyState message="Selecciona un día del calendario" /> :
            citasDiaSel.length === 0 ? (
              <div className="space-y-3">
                {!fPromotor && <EmptyState message="Sin citas este día" />}
                <button onClick={() => abrirAgendar(selectedDay)} className="btn-primary text-xs w-full">Agendar para este día</button>
              </div>
            ) : (
              <ul className="space-y-3">
                {citasDiaSel.map((c) => {
                  const canal = infoCanal(c.tipo);
                  const color = colorCita(c);
                  const viva = CITA_VIVA.includes(c.estado);
                  return (
                    <li key={c.id} className={`rounded-lg border border-slate-100 dark:border-slate-700 border-l-[3px] ${color.borde} p-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setDetalle(c)}
                          className="text-left text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
                        >{c.titulo}</button>
                        <div className="flex items-center gap-1">
                          <CitaBadge estado={c.estado} />
                          <MenuAcciones
                            small
                            label={`Acciones de ${c.titulo}`}
                            items={[
                              { label: 'Reagendar / editar', onClick: () => abrirReagendar(c) },
                              viva && { label: 'No asistió', onClick: () => cambiarEstado(c, 'NO_ASISTIO') },
                              'sep',
                              { label: 'Eliminar definitivamente', onClick: () => setToDelete(c), danger: true },
                            ]}
                          />
                        </div>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <p className="tabular-nums">{hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)}</p>
                        <p className="text-slate-600 dark:text-slate-300">
                          {c.cliente
                            ? <>{c.cliente.nombre} {c.cliente.apellidoP}{c.cliente.telefono ? ` · ${c.cliente.telefono}` : ''}</>
                            : c.candidato
                              ? <>Candidato: {c.candidato.nombre} {c.candidato.apellidoP}{c.candidato.telefono ? ` · ${c.candidato.telefono}` : ''}</>
                              : MODALIDADES_PROMOTOR.includes(c.modalidad) ? infoTipoCita(c.modalidad).label : 'Evento personal (sin cliente)'}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${color.dot}`} />{color.label}
                          {c.cliente || MODALIDADES_PROMOTOR.includes(c.modalidad) ? <> · {canal.label}</> : null}{c.ubicacion ? ` · ${c.ubicacion}` : ''}
                        </p>
                        {c.modalidad === 'ACOMPANAMIENTO' && (
                          <p className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 font-medium text-violet-700 dark:text-violet-300">
                            ◎ Acompañamiento{c.promotor ? ` · ${c.promotor.nombre} ${c.promotor.apellidoP}` : ' · promotor por asignar'}
                          </p>
                        )}
                        {c.modalidad === 'ENTREGA_POLIZA' && (
                          <p className="inline-flex items-center gap-1 rounded-md bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 font-medium text-teal-700 dark:text-teal-300">
                            ⬒ Entrega de póliza
                          </p>
                        )}
                        {c.serieId && (
                          <p className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 font-medium text-slate-500 dark:text-slate-400">
                            ↻ Parte de una serie repetida
                          </p>
                        )}
                        {esAdmin() && <p className="text-[10px] text-slate-400 dark:text-slate-500">Asesor: {c.asesor?.nombre} {c.asesor?.apellidoP}</p>}
                      </div>
                      {viva && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <button onClick={() => cambiarEstado(c, 'COMPLETADA')} className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">✓ Completar</button>
                          <button onClick={() => abrirReagendar(c)} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Reagendar</button>
                          <button onClick={() => cambiarEstado(c, 'CANCELADA')} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Cancelar cita</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        </Card>
      </div>

      <FichaCita
        cita={citaDetalle}
        onClose={() => setDetalle(null)}
        onReagendar={(c) => { setDetalle(null); abrirReagendar(c); }}
        onEliminar={(c) => { setDetalle(null); setToDelete(c); }}
        onCambiarEstado={cambiarEstado}
        esAdmin={esAdmin()}
        usuarioId={user?.id}
      />

      <CitaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cita={citaEdit}
        preFecha={preFecha}
        preModalidad={prePromotor ? 'ACOMPANAMIENTO' : undefined}
        prePromotorId={prePromotor}
        asesorId={esAdmin() && fAsesor && fAsesor !== '__mios__' ? fAsesor : null}
      />

      {/* Borrado real: acción separada, siempre con confirmación. Para conservar
          el historial la vía normal es "Cancelar cita" (cambio de estado). */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cita definitivamente">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Seguro que deseas eliminar la cita <strong>{toDelete.titulo}</strong>
              {toDelete.cliente ? <> de {toDelete.cliente.nombre} {toDelete.cliente.apellidoP}</> : null}?
              Esta acción no se puede deshacer. Si solo quieres conservar el historial, usa <strong>Cancelar cita</strong>.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setToDelete(null)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={confirmarEliminar} disabled={deleting} className="btn-danger">
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
