import { useState } from 'react';
import { api, handleError } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import { ROLES_LABEL, ROLES_ASIGNABLES, ROLES_DESC } from '../configuracion/secciones.js';
import { fechaCorta } from '../../lib/format.js';

const FORM_VACIO = { nombre: '', apellidoP: '', apellidoM: '', email: '', telefono: '', rol: 'ASESOR' };

// Link para compartir fuera del sistema (WhatsApp, correo): la app es de un
// solo servicio, así que el origen actual sirve tanto la SPA como la API.
const linkInvitacion = (token) => `${window.location.origin}/invitacion/${token}`;

// Alta por invitación, abierta a CUALQUIER persona autenticada (2026-09-25,
// pedido del usuario: "cualquier persona pueda invitar a otro asesor o a
// quienes dentro de la promotoria"). Pega contra POST /usuarios/invitar
// (sin el gate de la sección "asesores"), a diferencia del modal de
// Asesores → Equipo que además gestiona cuentas existentes (editar rol,
// desactivar, eliminar) y sigue siendo solo para promotores/asistente. No
// se reusa ese modal aquí a propósito: este es alta-only, sin edición.
export default function InvitarUsuarioModal({ open, onClose }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [invitacion, setInvitacion] = useState(null); // { nombre, email, token, expiraEn }
  const [copiado, setCopiado] = useState(false);

  const cerrar = () => {
    setForm(FORM_VACIO);
    setErr('');
    setInvitacion(null);
    onClose?.();
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      const { data } = await api.post('/usuarios/invitar', form);
      setInvitacion({ nombre: data.nombre, email: data.email, ...data.invitacion });
      setForm(FORM_VACIO);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(linkInvitacion(invitacion.token)); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* clipboard no disponible */ }
  };

  return (
    <>
      <Modal open={open && !invitacion} onClose={cerrar} title="Invitar a la promotoría">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre*"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Apellido paterno*"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
            <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
            <Field label="Email*"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Rol"><select className="input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>{ROLES_ASIGNABLES.map((r) => <option key={r} value={r}>{ROLES_LABEL[r]}</option>)}</select></Field>
          </div>
          {ROLES_DESC[form.rol] && <p className="text-xs text-slate-500 dark:text-slate-400">{ROLES_DESC[form.rol]}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Al guardar se genera un link de invitación (y se manda por correo si está configurado):
            la persona crea ahí su propia contraseña y confirma con Google. No se fija contraseña desde aquí.
          </p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={cerrar} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Invitando…' : 'Invitar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={open && !!invitacion} onClose={cerrar} title="Link de invitación">
        {invitacion && (
          <div className="space-y-3">
            {invitacion.correoEnviado === true && (
              <p className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                ✓ Se envió un correo a <b>{invitacion.email}</b> con este link.
              </p>
            )}
            {invitacion.correoEnviado === false && (
              <p className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                ⚠ No se pudo enviar el correo automático a {invitacion.email}. Comparte este link a mano.
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Por si no llega el correo (o para compartirlo tú mismo por WhatsApp), copia este link: solo lo activa{' '}
              <b>{invitacion.nombre}</b> confirmando con esa cuenta de Google, donde crea su propia contraseña.
              Vence el {fechaCorta(invitacion.expiraEn)}.
            </p>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={linkInvitacion(invitacion.token)} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={copiarLink} className="btn-secondary shrink-0">{copiado ? 'Copiado' : 'Copiar'}</button>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={cerrar} className="btn-primary">Listo</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
