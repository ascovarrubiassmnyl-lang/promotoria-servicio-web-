import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import { isoLocalInput } from '../../lib/format.js';

// Modal único para crear una Nota o un Recordatorio sobre un cliente, usado
// desde la ficha (ClienteDetalle) y desde el menú ⋯ de la lista (ClientesView)
// — mismo patrón que CitaFormModal/PolizaFormModal: un solo formulario
// compartido, no uno por pantalla.
//
// `destinatario` separa la gestión propia del asesor (ASESOR: llamadas,
// seguimientos) de lo que hay que tratar con el cliente (CLIENTE: pagos,
// renovaciones). Ojo: el CRM no le escribe al asegurado — un recordatorio
// CLIENTE igual le llega al asesor, solo con etiqueta distinta.
export default function NotaFormModal({
  open,
  onClose,
  clienteId,
  tipo = 'RECORDATORIO',
  destinatario = 'ASESOR',
  nombreCliente = null,
  onSaved,
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ texto: '', fechaAviso: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      texto: '',
      // Un recordatorio nace para mañana: es el caso normal y evita teclear
      // la fecha completa cada vez.
      fechaAviso: tipo === 'RECORDATORIO' ? isoLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)) : '',
    });
  }, [open, tipo, destinatario, clienteId]);

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/notas', {
        clienteId,
        tipo,
        destinatario,
        texto: form.texto,
        fechaAviso: form.fechaAviso || null,
      });
      onClose();
      qc.invalidateQueries(['cliente', clienteId]);
      qc.invalidateQueries(['clientes']);
      onSaved?.();
    } catch (e2) {
      alert(handleError(e2));
    } finally {
      setSaving(false);
    }
  };

  const titulo = tipo === 'NOTA'
    ? 'Agregar nota'
    : destinatario === 'CLIENTE' ? 'Recordatorio sobre el cliente' : 'Recordatorio del asesor';

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <form onSubmit={guardar} className="space-y-3">
        {nombreCliente && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cliente: <strong className="text-slate-700 dark:text-slate-200">{nombreCliente}</strong>
          </p>
        )}
        <Field label={tipo === 'NOTA' ? 'Nota' : 'Recordatorio'}>
          <textarea
            className="input"
            rows={4}
            required
            value={form.texto}
            onChange={(e) => setForm({ ...form, texto: e.target.value })}
            placeholder={tipo === 'NOTA' ? 'Escribe aquí…' : 'Qué quieres recordar…'}
          />
        </Field>
        {tipo === 'RECORDATORIO' && (
          <Field label="Fecha y hora de aviso">
            <input
              type="datetime-local"
              className="input"
              required
              value={form.fechaAviso}
              onChange={(e) => setForm({ ...form, fechaAviso: e.target.value })}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Te avisamos <strong>un día antes</strong> y el <strong>mismo día</strong>, en tu
              bandeja de notificaciones y por push.
              {destinatario === 'CLIENTE' && ' El aviso llega a ti, no al cliente.'}
            </p>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
