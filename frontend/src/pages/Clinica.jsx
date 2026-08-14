import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Field, EmptyState, Badge, MenuAcciones } from '../components/ui.jsx';
import { fechaCorta, isoLocalDateInput } from '../lib/format.js';
import { rangoSemana, labelSemana, isoDia } from '../lib/semana.js';

// Clínica telefónica: digitaliza el "Evaluador de Prospectos" semanal (meta:
// 10 citas por semana) + registro de sesiones de clínica (meta: 2 por semana).
// Mapa único de resultados del prospecto — no duplicar labels/colores.
const RESULTADOS = {
  PENDIENTE: { value: 'PENDIENTE', label: 'Pendiente', badge: 'slate' },
  CONTACTADO: { value: 'CONTACTADO', label: 'Contactado', badge: 'blue' },
  CITA_OBTENIDA: { value: 'CITA_OBTENIDA', label: 'Cita obtenida', badge: 'green' },
  CONVERTIDO: { value: 'CONVERTIDO', label: 'Convertido en cliente', badge: 'purple' },
  DESCARTADO: { value: 'DESCARTADO', label: 'Descartado', badge: 'red' },
};
const infoResultado = (v) => RESULTADOS[v] || { value: v, label: v || '—', badge: 'slate' };

const PROSPECTO_VACIO = {
  nombre: '', contacto: '', parentesco: '', edad: '', estadoCivil: '',
  ocupacion: '', dependientes: '', tieneSeguro: '', fechaEntrevista: '', planSeguimiento: '',
};

function ProspectoFormModal({ open, onClose, onSaved, prospecto = null, semanaInicio, asesorId }) {
  const editando = !!prospecto;
  const [form, setForm] = useState(PROSPECTO_VACIO);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editando ? {
      nombre: prospecto.nombre || '',
      contacto: prospecto.contacto || '',
      parentesco: prospecto.parentesco || '',
      edad: prospecto.edad ?? '',
      estadoCivil: prospecto.estadoCivil || '',
      ocupacion: prospecto.ocupacion || '',
      dependientes: prospecto.dependientes || '',
      tieneSeguro: prospecto.tieneSeguro === null || prospecto.tieneSeguro === undefined ? '' : (prospecto.tieneSeguro ? 'si' : 'no'),
      fechaEntrevista: prospecto.fechaEntrevista ? isoLocalDateInput(new Date(prospecto.fechaEntrevista)) : '',
      planSeguimiento: prospecto.planSeguimiento || '',
    } : PROSPECTO_VACIO);
    setErr('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setErr('El nombre es requerido'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        nombre: form.nombre.trim(),
        contacto: form.contacto,
        parentesco: form.parentesco,
        edad: form.edad === '' ? null : Number(form.edad),
        estadoCivil: form.estadoCivil,
        ocupacion: form.ocupacion,
        dependientes: form.dependientes,
        tieneSeguro: form.tieneSeguro === '' ? null : form.tieneSeguro === 'si',
        fechaEntrevista: form.fechaEntrevista ? new Date(`${form.fechaEntrevista}T12:00:00`).toISOString() : null,
        planSeguimiento: form.planSeguimiento,
      };
      if (editando) {
        await api.patch(`/clinica/prospectos/${prospecto.id}`, payload);
      } else {
        await api.post('/clinica/prospectos', { ...payload, semanaInicio, asesorId: asesorId || undefined });
      }
      onSaved?.();
      onClose();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar prospecto' : 'Agregar prospecto a la clínica'} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nombre*">
            <input className="input" required value={form.nombre} onChange={set('nombre')} placeholder="Nombre completo" />
          </Field>
          <Field label="Contacto personal o telefónico">
            <input className="input" value={form.contacto} onChange={set('contacto')} placeholder="Teléfono / cómo contactarlo" />
          </Field>
          <Field label="Parentesco / relación">
            <input className="input" value={form.parentesco} onChange={set('parentesco')} placeholder="Ej. primo, excompañero, referido de…" />
          </Field>
          <Field label="Edad">
            <input type="number" min="0" max="120" className="input" value={form.edad} onChange={set('edad')} />
          </Field>
          <Field label="Estado civil (incluir cónyuge)">
            <input className="input" value={form.estadoCivil} onChange={set('estadoCivil')} placeholder="Ej. casado, esposa Ana" />
          </Field>
          <Field label="Ocupación (incluir cónyuge)">
            <input className="input" value={form.ocupacion} onChange={set('ocupacion')} />
          </Field>
          <Field label="¿Tiene dependientes? (nombre y edad de los hijos)">
            <input className="input" value={form.dependientes} onChange={set('dependientes')} placeholder="Ej. 2 hijos: Sofía (5), Leo (2)" />
          </Field>
          <Field label="¿Cuenta con seguro de vida?">
            <select className="input" value={form.tieneSeguro} onChange={set('tieneSeguro')}>
              <option value="">No sé</option>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Field>
          <Field label="Fecha de entrevista">
            <input type="date" className="input" value={form.fechaEntrevista} onChange={set('fechaEntrevista')} />
          </Field>
        </div>
        <Field label="Planes de seguimiento">
          <textarea className="input" rows={2} value={form.planSeguimiento} onChange={set('planSeguimiento')} placeholder="Siguiente paso con este prospecto" />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar prospecto'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Clinica() {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [fAsesor, setFAsesor] = useState('');
  const semana = useMemo(() => rangoSemana(offset), [offset]);
  const inicioIso = isoDia(semana.inicio);

  const [modalOpen, setModalOpen] = useState(false);
  const [prospectoEdit, setProspectoEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const [sesionForm, setSesionForm] = useState({ fecha: isoLocalDateInput(new Date()), llamadas: '', citasObtenidas: '', notas: '' });

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });
  const asesorId = esAdmin() ? fAsesor : '';

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-semana', inicioIso, asesorId || 'yo'],
    queryFn: async () => (await api.get('/clinica/semana', { params: { inicio: inicioIso, asesorId: asesorId || undefined } })).data,
  });

  const { data: resumen } = useQuery({
    queryKey: ['clinica-resumen', inicioIso],
    queryFn: async () => (await api.get('/clinica/resumen', { params: { inicio: inicioIso } })).data,
    enabled: esAdmin(),
  });

  const prospectos = data?.prospectos || [];
  const sesiones = data?.sesiones || [];
  const metas = data?.metas || { citasSemana: 10, sesionesSemana: 2 };
  const citasObtenidas = sesiones.reduce((acc, s) => acc + s.citasObtenidas, 0)
    + prospectos.filter((p) => p.resultado === 'CITA_OBTENIDA').length;
  const contactados = prospectos.filter((p) => p.resultado !== 'PENDIENTE').length;

  const refrescar = () => { qc.invalidateQueries(['clinica-semana']); qc.invalidateQueries(['clinica-resumen']); };

  const cambiarResultado = async (p, resultado) => {
    try { setErr(''); await api.patch(`/clinica/prospectos/${p.id}`, { resultado }); refrescar(); }
    catch (e) { setErr(handleError(e)); }
  };

  const convertir = async (p) => {
    try {
      setErr('');
      const cliente = (await api.post(`/clinica/prospectos/${p.id}/convertir`)).data;
      refrescar();
      qc.invalidateQueries(['clientes']);
      navigate(`/clientes/${cliente.id}`);
    } catch (e) { setErr(handleError(e)); }
  };

  const pasarASemanaSiguiente = async (p) => {
    const sig = new Date(semana.inicio); sig.setDate(sig.getDate() + 7);
    try { setErr(''); await api.patch(`/clinica/prospectos/${p.id}`, { semanaInicio: isoDia(sig) }); refrescar(); }
    catch (e) { setErr(handleError(e)); }
  };

  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try { await api.delete(`/clinica/prospectos/${toDelete.id}`); setToDelete(null); refrescar(); }
    catch (e) { setErr(handleError(e)); } finally { setDeleting(false); }
  };

  const registrarSesion = async (e) => {
    e.preventDefault();
    try {
      setErr('');
      await api.post('/clinica/sesiones', {
        fecha: new Date(`${sesionForm.fecha}T12:00:00`).toISOString(),
        llamadas: Number(sesionForm.llamadas) || 0,
        citasObtenidas: Number(sesionForm.citasObtenidas) || 0,
        notas: sesionForm.notas,
        asesorId: asesorId || undefined,
      });
      setSesionForm({ fecha: isoLocalDateInput(new Date()), llamadas: '', citasObtenidas: '', notas: '' });
      refrescar();
    } catch (e2) { setErr(handleError(e2)); }
  };

  const eliminarSesion = async (s) => {
    try { setErr(''); await api.delete(`/clinica/sesiones/${s.id}`); refrescar(); }
    catch (e) { setErr(handleError(e)); }
  };

  const nombreScope = asesorId
    ? (() => { const a = asesores?.find((x) => x.id === asesorId); return a ? `${a.nombre} ${a.apellidoP}` : ''; })()
    : `${user?.nombre || ''}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Clínica telefónica</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Evaluador de prospectos · diseñado para conseguir {metas.citasSemana} citas a la semana · {nombreScope}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin() && (
            <select className="input w-auto" value={fAsesor} onChange={(e) => setFAsesor(e.target.value)}>
              <option value="">Mi lista</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          )}
          <button onClick={() => { setProspectoEdit(null); setModalOpen(true); }} className="btn-primary">+ Agregar prospecto</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setOffset((o) => o - 1)} className="btn-secondary px-3">← Semana anterior</button>
          <button onClick={() => setOffset(0)} className={`btn-secondary px-3 ${offset === 0 ? '!bg-slate-100 dark:!bg-slate-700' : ''}`}>Esta semana</button>
          <button onClick={() => setOffset((o) => o + 1)} className="btn-secondary px-3">Semana siguiente →</button>
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{labelSemana(semana)}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`kpi ${citasObtenidas >= metas.citasSemana ? 'kpi-green' : 'kpi-accent'}`}>
          <p className="kpi-label">Citas obtenidas</p>
          <p className="kpi-val">{citasObtenidas} <span className="text-sm font-normal text-slate-400">/ {metas.citasSemana}</span></p>
          <p className="kpi-note">Meta del evaluador</p>
        </div>
        <div className={`kpi ${sesiones.length >= metas.sesionesSemana ? 'kpi-green' : 'kpi-amber'}`}>
          <p className="kpi-label">Sesiones de clínica</p>
          <p className="kpi-val">{sesiones.length} <span className="text-sm font-normal text-slate-400">/ {metas.sesionesSemana}</span></p>
          <p className="kpi-note">Veces esta semana</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Prospectos en lista</p>
          <p className="kpi-val">{prospectos.length}</p>
          <p className="kpi-note">Esta semana</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Contactados</p>
          <p className="kpi-val">{contactados}</p>
          <p className="kpi-note">De {prospectos.length} en lista</p>
        </div>
      </div>

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Evaluador de prospectos" subtitle="La lista para calificar y llamar en la clínica.">
          {isLoading ? (
            <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
          ) : !prospectos.length ? (
            <div className="space-y-3">
              <EmptyState message="Sin prospectos esta semana. Los prospectos del CRM entran aquí solos en cuanto llevan días sin que les llames." />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setProspectoEdit(null); setModalOpen(true); }} className="btn-secondary text-xs">+ Agregar prospecto</button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-400 dark:text-slate-500 text-left">
                    <th className="py-1.5 pr-2">Prospecto</th>
                    <th className="py-1.5 px-2">Contacto</th>
                    <th className="py-1.5 px-2">Perfil</th>
                    <th className="py-1.5 px-2">¿Seguro?</th>
                    <th className="py-1.5 px-2">Entrevista</th>
                    <th className="py-1.5 px-2">Resultado</th>
                    <th className="py-1.5 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {prospectos.map((p) => {
                    const res = infoResultado(p.resultado);
                    return (
                      <tr key={p.id} className="border-t border-slate-50 dark:border-slate-700/60 align-top hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="py-2 pr-2">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{p.nombre}</p>
                          {p.parentesco && <p className="text-xs text-slate-400 dark:text-slate-500">{p.parentesco}</p>}
                          {p.cliente && (
                            <button onClick={() => navigate(`/clientes/${p.cliente.id}`)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                              Ver expediente →
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{p.contacto || '—'}</td>
                        <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 max-w-[220px]">
                          {[p.edad ? `${p.edad} años` : null, p.estadoCivil, p.ocupacion].filter(Boolean).join(' · ') || '—'}
                          {p.dependientes && <span className="block text-slate-400 dark:text-slate-500">Dep.: {p.dependientes}</span>}
                          {p.planSeguimiento && <span className="block italic text-slate-400 dark:text-slate-500">Plan: {p.planSeguimiento}</span>}
                        </td>
                        <td className="py-2 px-2 text-xs">{p.tieneSeguro === null ? '—' : p.tieneSeguro ? 'Sí' : 'No'}</td>
                        <td className="py-2 px-2 text-xs whitespace-nowrap">{p.fechaEntrevista ? fechaCorta(p.fechaEntrevista) : '—'}</td>
                        <td className="py-2 px-2">
                          {p.resultado === 'CONVERTIDO' ? (
                            <Badge color={res.badge}>{res.label}</Badge>
                          ) : (
                            <select
                              className="input !py-1 !px-1.5 text-xs w-auto"
                              value={p.resultado}
                              onChange={(e) => cambiarResultado(p, e.target.value)}
                              aria-label={`Resultado de ${p.nombre}`}
                            >
                              {Object.values(RESULTADOS).filter((r) => r.value !== 'CONVERTIDO').map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <MenuAcciones
                            small
                            label={`Acciones de ${p.nombre}`}
                            items={[
                              { label: 'Editar', onClick: () => { setProspectoEdit(p); setModalOpen(true); } },
                              !p.clienteId && { label: 'Convertir en cliente', onClick: () => convertir(p) },
                              { label: 'Pasar a la próxima semana', onClick: () => pasarASemanaSiguiente(p) },
                              'sep',
                              { label: 'Eliminar', onClick: () => setToDelete(p), danger: true },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Sesiones de clínica" subtitle={`Registra cada clínica realizada (meta: ${metas.sesionesSemana}/semana).`}>
          <form onSubmit={registrarSesion} className="space-y-2 rounded-lg border border-slate-100 dark:border-slate-700 p-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Fecha">
                <input type="date" className="input !py-1.5 text-xs" value={sesionForm.fecha} onChange={(e) => setSesionForm((f) => ({ ...f, fecha: e.target.value }))} />
              </Field>
              <Field label="Llamadas">
                <input type="number" min="0" className="input !py-1.5 text-xs" value={sesionForm.llamadas} onChange={(e) => setSesionForm((f) => ({ ...f, llamadas: e.target.value }))} />
              </Field>
              <Field label="Citas">
                <input type="number" min="0" className="input !py-1.5 text-xs" value={sesionForm.citasObtenidas} onChange={(e) => setSesionForm((f) => ({ ...f, citasObtenidas: e.target.value }))} />
              </Field>
            </div>
            <Field label="Notas">
              <input className="input !py-1.5 text-xs" value={sesionForm.notas} onChange={(e) => setSesionForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Opcional" />
            </Field>
            <button type="submit" className="btn-primary w-full text-xs">Registrar sesión</button>
          </form>

          <div className="mt-3 space-y-2">
            {!sesiones.length ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Aún no registras clínicas esta semana.</p>
            ) : (
              sesiones.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{fechaCorta(s.fecha)}</p>
                    <p>{s.llamadas} llamada{s.llamadas === 1 ? '' : 's'} · <span className={s.citasObtenidas > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>{s.citasObtenidas} cita{s.citasObtenidas === 1 ? '' : 's'}</span></p>
                    {s.notas && <p className="text-slate-400 dark:text-slate-500">{s.notas}</p>}
                  </div>
                  <MenuAcciones
                    small
                    label="Acciones de la sesión"
                    items={[{ label: 'Eliminar', onClick: () => eliminarSesion(s), danger: true }]}
                  />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {esAdmin() && (
        <Card title="Equipo · clínica de la semana" subtitle="Avance de cada asesor hacia sus 10 citas y 2 sesiones.">
          {!resumen?.filas?.length ? (
            <EmptyState message="Sin asesores activos." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-400 dark:text-slate-500 text-left">
                    <th className="py-1.5 pr-2">Asesor</th>
                    <th className="py-1.5 px-2 text-right">Prospectos</th>
                    <th className="py-1.5 px-2 text-right">Contactados</th>
                    <th className="py-1.5 px-2 text-right">Citas obtenidas</th>
                    <th className="py-1.5 pl-2 text-right">Sesiones</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas.map((f) => (
                    <tr
                      key={f.asesor.id}
                      className="border-t border-slate-50 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                      onClick={() => setFAsesor(f.asesor.id)}
                      title="Ver su lista"
                    >
                      <td className="py-2 pr-2 font-medium text-slate-700 dark:text-slate-200">{f.asesor.nombre} {f.asesor.apellidoP}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{f.prospectos}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{f.contactados}</td>
                      <td className={`py-2 px-2 text-right font-bold tabular-nums ${f.citasObtenidas >= resumen.metas.citasSemana ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {f.citasObtenidas} / {resumen.metas.citasSemana}
                      </td>
                      <td className={`py-2 pl-2 text-right tabular-nums ${f.sesiones >= resumen.metas.sesionesSemana ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                        {f.sesiones} / {resumen.metas.sesionesSemana}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <ProspectoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refrescar}
        prospecto={prospectoEdit}
        semanaInicio={inicioIso}
        asesorId={asesorId}
      />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar prospecto">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Eliminar a <strong>{toDelete.nombre}</strong> de la lista de la clínica? Esta acción no se puede deshacer.
              {toDelete.clienteId ? ' El cliente vinculado no se toca.' : ''}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setToDelete(null)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={confirmarEliminar} disabled={deleting} className="btn-danger">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
