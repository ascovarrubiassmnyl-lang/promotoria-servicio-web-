import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import { isoLocalInput } from '../../lib/format.js';

// Modal único para crear una Nota o un Recordatorio, usado desde la ficha
// (ClienteDetalle), el menú ⋯ de la lista (ClientesView) y la ficha de
// candidatos (CandidatoDetalle) — mismo patrón que CitaFormModal/
// PolizaFormModal: un solo formulario compartido, no uno por pantalla.
//
// El sujeto es un cliente O un candidato a asesor, nunca ambos (excluyentes,
// igual que en Cita; el backend y un CHECK de la BD lo respaldan): se pasa
// `clienteId` o `candidatoId`.
//
// `destinatario` separa la gestión propia del asesor (ASESOR: llamadas,
// seguimientos) de lo que hay que tratar con el cliente (CLIENTE: pagos,
// renovaciones). Ojo: el CRM no le escribe al asegurado — un recordatorio
// CLIENTE igual le llega al asesor, solo con etiqueta distinta. En candidatos
// no aplica: el seguimiento siempre es del reclutador.
export default function NotaFormModal({
  open,
  onClose,
  clienteId,
  candidatoId,
  tipo = 'RECORDATORIO',
  destinatario = 'ASESOR',
  nombreCliente = null,
  onSaved,
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ texto: '', fechaAviso: '' });
  const [saving, setSaving] = useState(false);
  const esCandidato = !!candidatoId;

  useEffect(() => {
    if (!open) return;
    setForm({
      texto: '',
      // Un recordatorio nace para mañana: es el caso normal y evita teclear
      // la fecha completa cada vez.
      fechaAviso: tipo === 'RECORDATORIO' ? isoLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)) : '',
    });
  }, [open, tipo, destinatario, clienteId, candidatoId]);

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/notas', {
        ...(esCandidato ? { candidatoId } : { clienteId }),
        tipo,
        destinatario,
        texto: form.texto,
        // `datetime-local` da un string SIN zona ("2026-08-19T10:00"): mandarlo
        // tal cual hacía que el servidor (UTC en producción) lo leyera como su
        // propia hora local y el recordatorio se corriera el offset completo
        // (10:00 se veía a las 04:00). Se convierte a ISO con zona aquí, igual
        // que CitaFormModal con fechaHoraInicio/Fin.
        fechaAviso: form.fechaAviso ? new Date(form.fechaAviso).toISOString() : null,
      });
      onClose();
      if (esCandidato) {
        qc.invalidateQueries(['candidato', candidatoId]);
      } else {
        qc.invalidateQueries(['cliente', clienteId]);
        qc.invalidateQueries(['clientes']);
      }
      onSaved?.();
    } catch (e2) {
      alert(handleError(e2));
    } finally {
      setSaving(false);
    }
  };

  const titulo = tipo === 'NOTA'
    ? 'Agregar nota'
    : esCandidato ? 'Recordatorio de seguimiento'
      : destinatario === 'CLIENTE' ? 'Recordatorio sobre el cliente' : 'Recordatorio del asesor';

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <form onSubmit={guardar} className="space-y-3">
        {nombreCliente && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {esCandidato ? 'Candidato' : 'Cliente'}: <strong className="text-slate-700 dark:text-slate-200">{nombreCliente}</strong>
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
              {!esCandidato && destinatario === 'CLIENTE' && ' El aviso llega a ti, no al cliente.'}
              {esCandidato && ' El aviso llega a ti, no al candidato.'}
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
