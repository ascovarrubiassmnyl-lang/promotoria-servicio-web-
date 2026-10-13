import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import { isoLocalInput } from '../../lib/format.js';
import { avisar } from '../../lib/toast.js';

// Registrar una llamada en un clic (2026-10-13). Modal único compartido por la
// lista de clientes y la ficha (mismo patrón que NotaFormModal/CitaFormModal).
// El servidor (POST /clientes/:id/llamada → utils/seguimiento.js) propaga el
// resultado: actividad LLAMADA (embudo y Metas), 25 puntos de hoy, clínica y
// etapa. Aquí solo se elige qué pasó.
export const RESULTADOS_LLAMADA = [
  { value: 'NO_CONTESTO', label: 'No contestó', recordar: true },
  { value: 'CONTACTADO', label: 'Hablé con él/ella' },
  { value: 'VOLVER_A_LLAMAR', label: 'Me pidió que le llame después', recordar: true },
  { value: 'CITA', label: 'Conseguí cita' },
  { value: 'NO_INTERESADO', label: 'No le interesa' },
];

export const infoResultadoLlamada = (v) => RESULTADOS_LLAMADA.find((r) => r.value === v);

// Mañana a las 10:00, hora local: el default útil para "volver a llamar".
function mananaALas10() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return isoLocalInput(d);
}

// Liga de WhatsApp a partir del teléfono guardado (+52XXXXXXXXXX).
export function ligaWhatsApp(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.length === 10 ? `52${digitos}` : digitos}`;
}

export default function RegistrarLlamadaModal({ open, onClose, cliente, onCita }) {
  const qc = useQueryClient();
  const [resultado, setResultado] = useState('');
  const [nota, setNota] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [recordarEn, setRecordarEn] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setResultado(''); setNota(''); setRecordar(false); setRecordarEn(mananaALas10()); setErr('');
  }, [open]);

  if (!cliente) return null;
  const nombre = `${cliente.nombre} ${cliente.apellidoP || ''}`.trim();
  const wa = ligaWhatsApp(cliente.telefono);

  const elegir = (r) => {
    setResultado(r.value);
    setRecordar(Boolean(r.recordar));
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!resultado) { setErr('Elige qué pasó en la llamada'); return; }
    setSaving(true); setErr('');
    try {
      await api.post(`/clientes/${cliente.id}/llamada`, {
        resultado,
        nota: nota.trim() || null,
        // datetime-local no trae zona: se convierte en el navegador.
        recordarEn: recordar && recordarEn ? new Date(recordarEn).toISOString() : null,
      });
      ['hoy', 'cliente', 'clientes', 'actividad-cliente', 'actividad', 'clinica-semana', 'puntos-semana', 'proceso-ventas', 'dashboard', 'metas-resumen']
        .forEach((k) => qc.invalidateQueries([k]));
      avisar(recordar && recordarEn ? 'Llamada registrada · te recordaremos volver a llamar' : 'Llamada registrada');
      onClose();
      if (resultado === 'CITA' && onCita) onCita();
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Llamada con ${nombre}`}>
      <form onSubmit={guardar} className="space-y-4">
        {cliente.telefono ? (
          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${cliente.telefono}`} className="btn-secondary text-sm">Llamar {cliente.telefono}</a>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary text-sm">WhatsApp</a>}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Este contacto no tiene teléfono registrado.</p>
        )}

        <div>
          <p className="label">¿Qué pasó?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RESULTADOS_LLAMADA.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => elegir(r)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  resultado === r.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200 font-medium'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {resultado === 'CITA' && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Al guardar se abre la agenda para poner día y hora.</p>
          )}
          {resultado === 'NO_INTERESADO' && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Pasa a la etapa «Descartado». Puedes reactivarlo cambiando la etapa.</p>
          )}
        </div>

        <Field label="Nota (opcional)">
          <textarea className="input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué dijo, qué sigue…" />
        </Field>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Recordarme volver a llamar
          </label>
          {recordar && (
            <input type="datetime-local" className="input" value={recordarEn} onChange={(e) => setRecordarEn(e.target.value)} />
          )}
        </div>

        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar llamada'}</button>
        </div>
      </form>
    </Modal>
  );
}
