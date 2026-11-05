import { useState } from 'react';
import { handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Modal, Field } from '../ui.jsx';
import { ROLES_LABEL } from '../configuracion/secciones.js';
import { avisar } from '../../lib/toast.js';

// Espejo de MIN_PASSWORD (backend/src/utils/password.js): el servidor manda,
// esto solo evita mandar una contraseña que sería rechazada.
const MIN_PASSWORD = 8;
const VACIO = { actual: '', nueva: '', confirmar: '' };

// "Mi cuenta" (2026-10-21): self-service de cada persona, cualquier rol. Se
// abre tocando el nombre en el sidebar (o en la hoja "Más" en móvil).
// Cambiar la contraseña y "cerrar en los demás dispositivos" cierran en el
// servidor todas las sesiones anteriores (Usuario.sesionesDesde); este
// dispositivo recibe un token nuevo y sigue dentro.
export default function MiCuentaModal({ open, onClose }) {
  const { user, cambiarPassword, cerrarOtrasSesiones } = useAuth();
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [err, setErr] = useState('');

  const cerrar = () => { setForm(VACIO); setErr(''); onClose?.(); };

  const corta = form.nueva.length > 0 && form.nueva.length < MIN_PASSWORD;
  const noCoincide = form.confirmar.length > 0 && form.nueva !== form.confirmar;
  const valida = form.actual && form.nueva.length >= MIN_PASSWORD && form.nueva === form.confirmar;

  const submit = async (e) => {
    e.preventDefault();
    if (!valida) return;
    setGuardando(true); setErr('');
    try {
      await cambiarPassword(form.actual, form.nueva);
      avisar('Contraseña actualizada. Se cerró la sesión en tus otros dispositivos.', 'ok');
      cerrar();
    } catch (e2) { setErr(handleError(e2)); } finally { setGuardando(false); }
  };

  const cerrarOtras = async () => {
    if (!window.confirm('Se cerrará tu sesión en todos los demás celulares y computadoras. Aquí sigues dentro. ¿Continuar?')) return;
    setCerrando(true); setErr('');
    try {
      await cerrarOtrasSesiones();
      avisar('Listo: se cerró tu sesión en los demás dispositivos.', 'ok');
    } catch (e2) { setErr(handleError(e2)); } finally { setCerrando(false); }
  };

  if (!user) return null;

  return (
    <Modal open={open} onClose={cerrar} title="Mi cuenta">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="avatar">{(user.nombre?.[0] || '') + (user.apellidoP?.[0] || '')}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user.nombre} {user.apellidoP}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email} · {ROLES_LABEL[user.rol] || user.rol}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cambiar contraseña</h4>
          <Field label="Contraseña actual">
            <input className="input" type="password" autoComplete="current-password" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nueva contraseña">
              <input className="input" type="password" autoComplete="new-password" placeholder={`Mínimo ${MIN_PASSWORD} caracteres`} value={form.nueva} onChange={(e) => setForm({ ...form, nueva: e.target.value })} />
            </Field>
            <Field label="Confirmar nueva">
              <input className="input" type="password" autoComplete="new-password" value={form.confirmar} onChange={(e) => setForm({ ...form, confirmar: e.target.value })} />
            </Field>
          </div>
          {corta && <p className="text-xs text-amber-600 dark:text-amber-400">La contraseña debe tener al menos {MIN_PASSWORD} caracteres.</p>}
          {noCoincide && <p className="text-xs text-amber-600 dark:text-amber-400">Las contraseñas no coinciden.</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400">Al cambiarla se cierra tu sesión en los demás dispositivos; en este sigues dentro.</p>
          <div className="flex justify-end">
            <button type="submit" disabled={!valida || guardando} className="btn-primary disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>

        <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sesiones</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ¿Perdiste el celular o entraste en una computadora prestada? Cierra tu sesión en todos los demás dispositivos.
          </p>
          <button type="button" onClick={cerrarOtras} disabled={cerrando} className="btn-secondary text-sm disabled:opacity-50">
            {cerrando ? 'Cerrando…' : 'Cerrar sesión en los demás dispositivos'}
          </button>
        </div>

        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </div>
    </Modal>
  );
}
