import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Modal, Field } from '../ui.jsx';
import { TIPOS_PREGUNTA_POP, BLOQUES_SUGERIDOS } from './tipos.js';

// Editor del cuestionario POP de la promotoría: preguntas, opciones y cuántos
// puntos vale cada una. Los puntos se capturan aquí y NUNCA viajan al
// navegador del candidato (el servidor los guarda y califica), así que la
// persona no puede ver en el HTML qué respuesta conviene.
//
// El puntaje final es la suma de lo elegido normalizada a 0–100 contra el
// máximo alcanzable, y los umbrales de abajo deciden el semáforo. Misma regla
// única del backend en utils/pop.js — aquí solo se captura.

const preguntaVacia = (n) => ({
  id: `p${n}`,
  texto: '',
  ayuda: '',
  bloque: BLOQUES_SUGERIDOS[0],
  tipo: 'OPCION',
  opciones: [
    { id: 'o1', texto: '', puntos: 0 },
    { id: 'o2', texto: '', puntos: 5 },
  ],
});

export default function PopPlantillaModal({ open, onClose, plantilla = null, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ nombre: '', descripcion: '', umbralVerde: 70, umbralAmarillo: 40 });
  const [preguntas, setPreguntas] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      nombre: plantilla?.nombre || '',
      descripcion: plantilla?.descripcion || '',
      umbralVerde: plantilla?.umbralVerde ?? 70,
      umbralAmarillo: plantilla?.umbralAmarillo ?? 40,
    });
    setPreguntas(
      plantilla?.preguntas?.length
        ? plantilla.preguntas.map((p) => ({ ...p, ayuda: p.ayuda || '', opciones: p.opciones || [] }))
        : [preguntaVacia(1)],
    );
  }, [open, plantilla]);

  const setPregunta = (i, cambios) =>
    setPreguntas((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambios } : p)));

  const setOpcion = (i, j, cambios) =>
    setPreguntas((ps) => ps.map((p, pi) => (pi !== i ? p : {
      ...p,
      opciones: p.opciones.map((o, oi) => (oi === j ? { ...o, ...cambios } : o)),
    })));

  const agregarPregunta = () =>
    setPreguntas((ps) => [...ps, preguntaVacia(ps.length + 1)]);

  const quitarPregunta = (i) =>
    setPreguntas((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ps));

  const agregarOpcion = (i) =>
    setPreguntas((ps) => ps.map((p, j) => (j !== i ? p : {
      ...p,
      opciones: [...p.opciones, { id: `o${p.opciones.length + 1}`, texto: '', puntos: 0 }],
    })));

  const quitarOpcion = (i, j) =>
    setPreguntas((ps) => ps.map((p, pi) => (pi !== i || p.opciones.length <= 2 ? p : {
      ...p,
      opciones: p.opciones.filter((_, oi) => oi !== j),
    })));

  // Máximo alcanzable, igual que puntosPosibles() del backend: la mejor opción
  // de cada pregunta calificable. Se muestra en vivo para que la promotora vea
  // contra qué se normaliza el 0–100.
  const posibles = preguntas.reduce((t, p) => {
    if (p.tipo === 'TEXTO' || !p.opciones?.length) return t;
    return t + Math.max(...p.opciones.map((o) => Number(o.puntos) || 0));
  }, 0);

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cuerpo = {
        nombre: form.nombre,
        descripcion: form.descripcion,
        umbralVerde: Number(form.umbralVerde),
        umbralAmarillo: Number(form.umbralAmarillo),
        preguntas: preguntas.map((p) => ({
          id: p.id,
          texto: p.texto,
          ayuda: p.ayuda || null,
          bloque: p.bloque,
          tipo: p.tipo,
          opciones: p.tipo === 'TEXTO'
            ? []
            : p.opciones.map((o) => ({ id: o.id, texto: o.texto, puntos: Number(o.puntos) || 0 })),
        })),
      };
      if (plantilla) await api.patch(`/pop/plantillas/${plantilla.id}`, cuerpo);
      else await api.post('/pop/plantillas', cuerpo);
      onClose();
      qc.invalidateQueries(['pop-plantillas']);
      onSaved?.();
    } catch (e2) {
      alert(handleError(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={plantilla ? 'Preguntas del POP' : 'Nuevo cuestionario POP'} wide>
      {plantilla?.clave === 'estandar' && (
        <p className="mb-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          Este es el cuestionario que se manda por default; ya viene cargado y listo para enviar.
          Solo entra aquí si quieres ajustar la redacción o cuántos puntos vale cada respuesta.
        </p>
      )}
      <form onSubmit={guardar} className="space-y-4">
        <Field label="Nombre del cuestionario">
          <input
            className="input" required value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej. POP Origen — Filtro inicial"
          />
        </Field>
        <Field label="Descripción (la ve el candidato)">
          <textarea
            className="input" rows={2} value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Ej. Contesta con sinceridad, no hay respuestas correctas o incorrectas."
          />
        </Field>

        {plantilla && (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Los POP que ya enviaste conservan las preguntas con las que se mandaron: editar aquí
            solo afecta los envíos nuevos.
          </p>
        )}

        {/* Preguntas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Preguntas <span className="font-normal text-slate-400">({preguntas.length} · {posibles} puntos posibles)</span>
            </h4>
            <button type="button" onClick={agregarPregunta} className="btn-secondary text-xs">+ Agregar pregunta</button>
          </div>

          {preguntas.map((p, i) => (
            <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-semibold text-slate-400 w-5">{i + 1}</span>
                <input
                  className="input flex-1" required value={p.texto}
                  onChange={(e) => setPregunta(i, { texto: e.target.value })}
                  placeholder="Escribe la pregunta…"
                />
                {preguntas.length > 1 && (
                  <button
                    type="button" onClick={() => quitarPregunta(i)}
                    className="mt-1.5 text-xs text-slate-400 hover:text-red-500"
                    title="Quitar pregunta"
                  >
                    Quitar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                <Field label="Tipo">
                  <select
                    className="input" value={p.tipo}
                    onChange={(e) => setPregunta(i, { tipo: e.target.value })}
                  >
                    {TIPOS_PREGUNTA_POP.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Bloque del resultado">
                  <input
                    className="input" list="pop-bloques" value={p.bloque}
                    onChange={(e) => setPregunta(i, { bloque: e.target.value })}
                    placeholder="Ej. ADN en Ventas"
                  />
                </Field>
              </div>

              {p.tipo === 'TEXTO' ? (
                <p className="pl-7 text-xs text-slate-400 dark:text-slate-500">
                  Respuesta abierta: la lees tú, no suma puntos al resultado.
                </p>
              ) : (
                <div className="pl-7 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="label">Opciones y puntos</span>
                    <button type="button" onClick={() => agregarOpcion(i)} className="text-xs text-brand-600 hover:underline">
                      + Opción
                    </button>
                  </div>
                  {p.opciones.map((o, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <input
                        className="input flex-1" required value={o.texto}
                        onChange={(e) => setOpcion(i, j, { texto: e.target.value })}
                        placeholder={`Opción ${j + 1}`}
                      />
                      <input
                        type="number" min={0} max={100} className="input w-20 tabular-nums"
                        value={o.puntos}
                        onChange={(e) => setOpcion(i, j, { puntos: e.target.value })}
                        title="Puntos que otorga esta opción"
                      />
                      {p.opciones.length > 2 && (
                        <button
                          type="button" onClick={() => quitarOpcion(i, j)}
                          className="text-xs text-slate-400 hover:text-red-500 px-1"
                          title="Quitar opción"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <datalist id="pop-bloques">
            {BLOQUES_SUGERIDOS.map((b) => <option key={b} value={b} />)}
          </datalist>
        </div>

        {/* Umbrales del semáforo */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Semáforo del resultado</h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2.5">
            El puntaje se convierte a una escala de 0 a 100 (sobre {posibles || '—'} puntos posibles).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Proceder desde">
              <input
                type="number" min={1} max={100} className="input tabular-nums" required
                value={form.umbralVerde}
                onChange={(e) => setForm({ ...form, umbralVerde: e.target.value })}
              />
            </Field>
            <Field label="Precaución desde">
              <input
                type="number" min={0} max={100} className="input tabular-nums" required
                value={form.umbralAmarillo}
                onChange={(e) => setForm({ ...form, umbralAmarillo: e.target.value })}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Debajo de {form.umbralAmarillo || 0} el resultado es <strong>No proceder</strong>.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : plantilla ? 'Guardar cambios' : 'Crear cuestionario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
