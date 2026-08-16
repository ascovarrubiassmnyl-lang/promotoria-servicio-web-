import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Modal, Field, NumeroFormateado } from '../ui.jsx';
import { edad } from '../../lib/format.js';

const FORM_VACIO = {
  nombre: '', apellidoP: '', apellidoM: '', telefono: '', ciudad: '', email: '',
  fechaNacimiento: '', sexo: '', rfc: '', fuente: '', referidoPor: '', notas: '',
  reclutadorId: '', oficina: '',
  calle: '', colonia: '', codigoPostal: '', estadoDireccion: '', profesion: '',
  gradoEstudios: '', antiguedadResidencia: '', estadoCivil: '', numeroHijos: '', ingresosAnuales: '',
};

// Formulario único de candidato (alta y edición), formato SMNYL: datos
// personales + "Información adicional" colapsable. Lo comparten la lista de
// /candidatos y el selector "Cliente o Candidato" de la captura.
export default function CandidatoFormModal({ open, onClose, onSaved, candidato = null }) {
  const { esAdmin } = useAuth();
  const qc = useQueryClient();
  const editando = !!candidato;

  const [form, setForm] = useState(FORM_VACIO);
  const [masInfo, setMasInfo] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setMasInfo(false);
    if (editando) {
      setForm({
        ...FORM_VACIO,
        ...Object.fromEntries(Object.keys(FORM_VACIO).map((k) => [k, candidato[k] ?? ''])),
        fechaNacimiento: candidato.fechaNacimiento ? candidato.fechaNacimiento.slice(0, 10) : '',
        reclutadorId: candidato.reclutadorId || '',
      });
    } else {
      setForm(FORM_VACIO);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reclutador = usuario del sistema (opcional). Los promotores están
  // disponibles para cualquier rol; la lista de asesores solo para admin.
  const { data: promotores } = useQuery({
    queryKey: ['promotores-list'],
    queryFn: async () => (await api.get('/usuarios/promotores')).data,
    enabled: open,
  });
  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: open && esAdmin(),
  });
  const reclutadores = [...(promotores || []), ...(asesores || []).filter((a) => !(promotores || []).some((p) => p.id === a.id))];

  const anios = form.fechaNacimiento ? edad(form.fechaNacimiento) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.sexo) { setErr('Selecciona el sexo del candidato'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        ...form,
        reclutadorId: form.reclutadorId || null,
        fechaNacimiento: form.fechaNacimiento || null,
        numeroHijos: form.numeroHijos === '' ? null : Number(form.numeroHijos),
        ingresosAnuales: form.ingresosAnuales === '' ? null : Number(form.ingresosAnuales),
      };
      let creado = null;
      if (editando) {
        await api.patch(`/candidatos/${candidato.id}`, payload);
      } else {
        creado = (await api.post('/candidatos', payload)).data;
      }
      qc.invalidateQueries(['candidatos']);
      if (editando) qc.invalidateQueries(['candidato', candidato.id]);
      onSaved?.(creado);
      onClose();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar candidato' : 'Nuevo candidato'}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre*"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
          <Field label="Apellido paterno*"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
          <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
          <Field label="Teléfono*"><input className="input" required value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
          <Field label="Sexo*">
            <select className="input" required value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })}>
              <option value="">Selecciona…</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </Field>
          <Field label="Ciudad"><input className="input" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} /></Field>
          <Field label="Email"><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={anios != null ? `Fecha de nacimiento · ${anios} años` : 'Fecha de nacimiento'}>
            <input type="date" className="input" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} />
          </Field>
          <Field label="RFC">
            <input className="input" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} placeholder="Opcional, podrá editarse después" />
          </Field>
          <Field label="Fuente*">
            <input className="input" required value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} placeholder="Ej. Referido, bolsa de trabajo, redes" />
          </Field>
          <Field label="Referido por"><input className="input" value={form.referidoPor} onChange={(e) => setForm({ ...form, referidoPor: e.target.value })} placeholder="Nombre de quien lo refirió" /></Field>
          <Field label="Reclutador">
            <select className="input" value={form.reclutadorId} onChange={(e) => setForm({ ...form, reclutadorId: e.target.value })}>
              <option value="">Sin asignar</option>
              {reclutadores.map((u) => <option key={u.id} value={u.id}>{u.nombre} {u.apellidoP}</option>)}
            </select>
          </Field>
          <Field label="Oficina"><input className="input" value={form.oficina} onChange={(e) => setForm({ ...form, oficina: e.target.value })} /></Field>
        </div>
        <Field label="Notas">
          <textarea className="input" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </Field>

        <button
          type="button"
          onClick={() => setMasInfo((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition"
        >
          Información adicional
          <span className="text-slate-400">{masInfo ? '−' : '+'}</span>
        </button>
        {masInfo && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Calle y número"><input className="input" value={form.calle} onChange={(e) => setForm({ ...form, calle: e.target.value })} /></Field>
            <Field label="Colonia"><input className="input" value={form.colonia} onChange={(e) => setForm({ ...form, colonia: e.target.value })} /></Field>
            <Field label="Código postal"><input className="input" value={form.codigoPostal} onChange={(e) => setForm({ ...form, codigoPostal: e.target.value })} /></Field>
            <Field label="Estado"><input className="input" value={form.estadoDireccion} onChange={(e) => setForm({ ...form, estadoDireccion: e.target.value })} /></Field>
            <Field label="Profesión"><input className="input" value={form.profesion} onChange={(e) => setForm({ ...form, profesion: e.target.value })} /></Field>
            <Field label="Grado de estudios"><input className="input" value={form.gradoEstudios} onChange={(e) => setForm({ ...form, gradoEstudios: e.target.value })} /></Field>
            <Field label="Antigüedad de residencia"><input className="input" value={form.antiguedadResidencia} onChange={(e) => setForm({ ...form, antiguedadResidencia: e.target.value })} /></Field>
            <Field label="Estado civil"><input className="input" value={form.estadoCivil} onChange={(e) => setForm({ ...form, estadoCivil: e.target.value })} /></Field>
            <Field label="Número de hijos"><input type="number" min="0" className="input" value={form.numeroHijos} onChange={(e) => setForm({ ...form, numeroHijos: e.target.value })} /></Field>
            <Field label="Ingresos anuales"><NumeroFormateado value={form.ingresosAnuales} onChange={(v) => setForm({ ...form, ingresosAnuales: v })} /></Field>
          </div>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar candidato'}</button>
        </div>
      </form>
    </Modal>
  );
}
