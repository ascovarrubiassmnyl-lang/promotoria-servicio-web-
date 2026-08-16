import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../api/client.js';
import { Card, Modal, EmptyState, MenuAcciones, CitaBadge } from '../components/ui.jsx';
import CandidatoFormModal from '../components/candidatos/CandidatoFormModal.jsx';
import CitaFormModal from '../components/citas/CitaFormModal.jsx';
import NotaFormModal from '../components/notas/NotaFormModal.jsx';
import PopCandidato from '../components/candidatos/PopCandidato.jsx';
import {
  ETAPAS_CANDIDATO, infoEtapaCandidato, siguientesEtapas, infoSemaforo,
  VITALES, VALORES, ESCALA, grupoCompleto, MODALIDAD_POR_ETAPA,
} from '../components/candidatos/tipos.js';
import { infoTipoCita } from '../components/citas/tipos.js';
import { fechaCorta, hora, edad, fechaHora } from '../lib/format.js';

// Selector de calificación 1–5 de una dimensión (0 = sin contestar).
function Calificacion({ valor, onChange, disabled }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          title={ESCALA[n]}
          onClick={() => onChange(n)}
          className={`w-9 h-9 rounded-lg border text-sm font-semibold transition ${
            valor === n
              ? 'border-brand-500 bg-brand-500 text-white'
              : valor > n
                ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {n}
        </button>
      ))}
      <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 min-w-[70px]">{valor >= 1 ? ESCALA[valor] : 'Sin contestar'}</span>
    </div>
  );
}

// Paso del wizard de evaluación (Vitales o Valores): 6 dimensiones con
// descripción, botón "Completar" habilitado solo con las 6 contestadas.
function PasoEvaluacion({ titulo, nota, grupo, valores, setValores, onGuardar, guardando, bloqueado, bloqueadoMsg }) {
  const completo = grupo.every((d) => (valores[d.campo] ?? 0) >= 1);
  return (
    <div className={bloqueado ? 'opacity-60' : ''}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</h4>
          <p className="text-xs text-slate-400 dark:text-slate-500">{nota}</p>
        </div>
      </div>
      {bloqueado ? (
        <p className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{bloqueadoMsg}</p>
      ) : (
        <div className="space-y-3">
          {grupo.map((d) => (
            <div key={d.campo} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b border-slate-50 dark:border-slate-700/60 pb-3 last:border-0">
              <div className="sm:max-w-[46%]">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{d.label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{d.desc}</p>
              </div>
              <Calificacion valor={valores[d.campo] ?? 0} onChange={(n) => setValores((v) => ({ ...v, [d.campo]: n }))} />
            </div>
          ))}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={!completo || guardando} onClick={onGuardar}>
              {guardando ? 'Guardando…' : `Completar ${titulo.toLowerCase()}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Notas y recordatorios de seguimiento del reclutador. Reusa el modelo Nota
// compartido con clientes (routes/notas.js); un recordatorio con fecha entra a
// la bandeja de notificaciones y al push como cualquier otro.
function ListaNotas({ notas, tipo, onCompletar, onEliminar }) {
  const items = (notas || []).filter((n) => (tipo === 'NOTA' ? n.tipo === 'NOTA' : n.tipo !== 'NOTA'));
  if (items.length === 0) {
    return (
      <EmptyState
        message={tipo === 'NOTA'
          ? 'Sin notas. Registra aquí lo que observes de esta persona.'
          : 'Sin recordatorios. Programa uno para no perder el seguimiento.'}
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((n) => {
        const vencido = !n.completada && n.fechaAviso && new Date(n.fechaAviso) < new Date();
        return (
          <div
            key={n.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className={`text-sm ${n.completada ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'} whitespace-pre-wrap`}>
                {n.texto}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {n.fechaAviso && (
                  <span className={vencido ? 'text-red-500 font-medium' : ''}>
                    Aviso: {fechaHora(n.fechaAviso)}
                    {vencido && ' · vencido'}
                    {' · '}
                  </span>
                )}
                {fechaCorta(n.creadoEn)}
                {n.asesor && ` · ${n.asesor.nombre} ${n.asesor.apellidoP}`}
              </p>
            </div>
            <MenuAcciones
              small
              items={[
                n.tipo !== 'NOTA' && {
                  label: n.completada ? 'Marcar pendiente' : 'Marcar hecha',
                  onClick: () => onCompletar(n),
                },
                { label: 'Eliminar', danger: true, onClick: () => onEliminar(n) },
              ].filter(Boolean)}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function CandidatoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: candidato, refetch } = useQuery({
    queryKey: ['candidato', id],
    queryFn: async () => (await api.get(`/candidatos/${id}`)).data,
  });

  const [vitales, setVitales] = useState({});
  const [valores, setValores] = useState({});
  const [guardandoPaso, setGuardandoPaso] = useState(null); // 'vitales' | 'valores'
  const [openEditar, setOpenEditar] = useState(false);
  const [openCita, setOpenCita] = useState(false);
  const [toArchive, setToArchive] = useState(false);
  const [avanzando, setAvanzando] = useState(false);
  const [openNota, setOpenNota] = useState(null); // 'NOTA' | 'RECORDATORIO'
  const [notaABorrar, setNotaABorrar] = useState(null);

  useEffect(() => {
    if (!candidato) return;
    const ev = candidato.evaluacion || {};
    setVitales(Object.fromEntries(VITALES.map((d) => [d.campo, ev[d.campo] ?? 0])));
    setValores(Object.fromEntries(VALORES.map((d) => [d.campo, ev[d.campo] ?? 0])));
  }, [candidato]);

  const vitalesGuardados = grupoCompleto(candidato?.evaluacion, VITALES);
  const valoresGuardados = grupoCompleto(candidato?.evaluacion, VALORES);

  const promedios = useMemo(() => {
    const ev = candidato?.evaluacion;
    if (!ev) return null;
    const prom = (grupo) => {
      const notas = grupo.map((d) => ev[d.campo] ?? 0).filter((n) => n >= 1);
      return notas.length === grupo.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : null;
    };
    return { vitales: prom(VITALES), valores: prom(VALORES) };
  }, [candidato]);

  const guardarPaso = async (paso, data) => {
    setGuardandoPaso(paso);
    try {
      await api.put(`/candidatos/${id}/evaluacion/${paso}`, data);
      refetch();
      qc.invalidateQueries(['candidatos']);
    } catch (e) { alert(handleError(e)); } finally { setGuardandoPaso(null); }
  };

  const cambiarEtapa = async (etapa) => {
    setAvanzando(true);
    try {
      await api.patch(`/candidatos/${id}/etapa`, { etapa });
      refetch();
      qc.invalidateQueries(['candidatos']);
    } catch (e) { alert(handleError(e)); } finally { setAvanzando(false); }
  };

  const completarNota = async (nota) => {
    try {
      await api.patch(`/notas/${nota.id}`, { completada: !nota.completada });
      refetch();
    } catch (e) { alert(handleError(e)); }
  };

  const eliminarNota = async () => {
    try {
      await api.delete(`/notas/${notaABorrar.id}`);
      setNotaABorrar(null);
      refetch();
    } catch (e) { alert(handleError(e)); }
  };

  const archivar = async () => {
    try {
      await api.delete(`/candidatos/${id}`);
      navigate('/candidatos');
      qc.invalidateQueries(['candidatos']);
    } catch (e) { alert(handleError(e)); }
  };

  if (!candidato) return null;

  const e = infoEtapaCandidato(candidato.etapa);
  const s = infoSemaforo(candidato.semaforo);
  const siguientes = siguientesEtapas(candidato.etapa);
  const anios = candidato.fechaNacimiento ? edad(candidato.fechaNacimiento) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
            <Link to="/candidatos" className="hover:text-slate-600 dark:hover:text-slate-300">Candidatos</Link> / {candidato.nombre} {candidato.apellidoP}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{candidato.nombre} {candidato.apellidoP} {candidato.apellidoM || ''}</h2>
            <span className={`badge ${e.pill}`}>{e.label}</span>
            <span className={`inline-flex items-center gap-1.5 badge ${s.pill}`}>
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
              {promedios?.vitales && promedios?.valores && (
                <span className="opacity-80">· vitales {promedios.vitales} · valores {promedios.valores}</span>
              )}
            </span>
            {candidato.archivadoEn && <span className="badge bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Archivado</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpenCita(true)} className="btn-primary">Agendar entrevista</button>
          <MenuAcciones
            items={[
              { label: 'Editar datos', onClick: () => setOpenEditar(true) },
              { label: 'Agregar nota', onClick: () => setOpenNota('NOTA') },
              { label: 'Crear recordatorio', onClick: () => setOpenNota('RECORDATORIO') },
              'sep',
              { label: 'Archivar candidato', danger: true, onClick: () => setToArchive(true) },
            ]}
          />
        </div>
      </div>

      {/* Stepper de etapas + avanzar */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {ETAPAS_CANDIDATO.map((et, i) => (
            <div key={et.value} className="flex items-center gap-2">
              {i > 0 && <span className="w-4 border-t border-slate-200 dark:border-slate-600" />}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                et.orden < e.orden ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                : et.orden === e.orden ? et.pill + ' ring-2 ' + et.chipOn
                : 'text-slate-400 dark:text-slate-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${et.orden <= e.orden ? et.dot : 'bg-slate-300 dark:bg-slate-600'}`} />
                {et.corto}{et.opcional ? ' (opcional)' : ''}
              </span>
            </div>
          ))}
          <div className="ml-auto flex gap-2">
            {siguientes.map((sig) => (
              <button key={sig.value} onClick={() => cambiarEtapa(sig.value)} disabled={avanzando} className="btn-secondary text-xs">
                Avanzar a {sig.label} →
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rail izquierdo: contacto y perfil */}
        <div className="space-y-4">
          <Card title="Contacto y perfil">
            <dl className="space-y-2 text-sm">
              {[
                ['Teléfono', candidato.telefono],
                ['Email', candidato.email],
                ['Ciudad', candidato.ciudad],
                ['Edad', anios != null ? `${anios} años` : null],
                ['Sexo', candidato.sexo === 'F' ? 'Femenino' : candidato.sexo === 'M' ? 'Masculino' : null],
                ['RFC', candidato.rfc],
                ['Profesión', candidato.profesion],
                ['Estudios', candidato.gradoEstudios],
                ['Estado civil', candidato.estadoCivil],
                ['Hijos', candidato.numeroHijos],
              ].filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="kv-k">{k}</dt>
                  <dd className="kv-v text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Reclutamiento">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="kv-k">Fuente</dt><dd className="kv-v text-right">{candidato.fuente}</dd></div>
              {candidato.referidoPor && <div className="flex justify-between gap-3"><dt className="kv-k">Referido por</dt><dd className="kv-v text-right">{candidato.referidoPor}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="kv-k">Reclutador</dt><dd className="kv-v text-right">{candidato.reclutador ? `${candidato.reclutador.nombre} ${candidato.reclutador.apellidoP}` : '—'}</dd></div>
              {candidato.oficina && <div className="flex justify-between gap-3"><dt className="kv-k">Oficina</dt><dd className="kv-v text-right">{candidato.oficina}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="kv-k">Capturado por</dt><dd className="kv-v text-right">{candidato.creadoPor ? `${candidato.creadoPor.nombre} ${candidato.creadoPor.apellidoP}` : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="kv-k">Registrado</dt><dd className="kv-v text-right">{fechaCorta(candidato.creadoEn)}</dd></div>
            </dl>
            {candidato.notas && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{candidato.notas}</p>}
          </Card>
        </div>

        {/* Columna principal: evaluación + citas */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            title="Evaluación del candidato"
            subtitle="Dos pasos: Vitales y después Valores. Escala 1 Pobre · 2 Promedio · 3 Bueno · 4 Muy bueno · 5 Excelente. Al completar los valores se calcula el semáforo."
          >
            <div className="space-y-6">
              <PasoEvaluacion
                titulo="Vitales"
                nota={vitalesGuardados ? `Completados${promedios?.vitales ? ` · promedio ${promedios.vitales}` : ''} — puedes reevaluar` : 'Paso 1 de 2'}
                grupo={VITALES}
                valores={vitales}
                setValores={setVitales}
                guardando={guardandoPaso === 'vitales'}
                onGuardar={() => guardarPaso('vitales', vitales)}
              />
              <div className="border-t border-slate-100 dark:border-slate-700" />
              <PasoEvaluacion
                titulo="Valores"
                nota={valoresGuardados ? `Completados${promedios?.valores ? ` · promedio ${promedios.valores}` : ''} — puedes reevaluar` : 'Paso 2 de 2'}
                grupo={VALORES}
                valores={valores}
                setValores={setValores}
                guardando={guardandoPaso === 'valores'}
                onGuardar={() => guardarPaso('valores', valores)}
                bloqueado={!vitalesGuardados}
                bloqueadoMsg="Completa primero los 6 vitales para desbloquear los valores."
              />
            </div>
          </Card>

          <Card
            title="Citas de reclutamiento"
            actions={<button onClick={() => setOpenCita(true)} className="btn-secondary text-xs">+ Agendar</button>}
          >
            {(candidato.citas || []).length === 0 ? (
              <EmptyState message="Sin entrevistas agendadas. Agenda la primera con el botón de arriba." />
            ) : (
              <div className="space-y-2">
                {candidato.citas.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.titulo}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {fechaCorta(c.fechaHoraInicio)} · {hora(c.fechaHoraInicio)}–{hora(c.fechaHoraFin)} · {infoTipoCita(c.modalidad).label}
                      </p>
                    </div>
                    <CitaBadge estado={c.estado} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* POP: cuestionario propio de la promotoría (ver components/candidatos/PopCandidato.jsx) */}
          <PopCandidato candidato={candidato} onCambio={() => refetch()} />

          {/* Notas y recordatorios del reclutador, lado a lado (mismo patrón
              que las dos tarjetas de recordatorios de la ficha de cliente). */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              title="Notas"
              actions={<button onClick={() => setOpenNota('NOTA')} className="btn-secondary text-xs">+ Nota</button>}
            >
              <ListaNotas
                notas={candidato.notasSeguimiento}
                tipo="NOTA"
                onCompletar={completarNota}
                onEliminar={setNotaABorrar}
              />
            </Card>
            <Card
              title="Recordatorios"
              subtitle="Te avisamos un día antes y el mismo día."
              actions={<button onClick={() => setOpenNota('RECORDATORIO')} className="btn-secondary text-xs">+ Recordatorio</button>}
            >
              <ListaNotas
                notas={candidato.notasSeguimiento}
                tipo="RECORDATORIO"
                onCompletar={completarNota}
                onEliminar={setNotaABorrar}
              />
            </Card>
          </div>
        </div>
      </div>

      <CandidatoFormModal open={openEditar} onClose={() => setOpenEditar(false)} candidato={candidato} onSaved={() => refetch()} />
      <CitaFormModal
        open={openCita}
        onClose={() => setOpenCita(false)}
        onSaved={() => refetch()}
        candidatoId={candidato.id}
        preModalidad={MODALIDAD_POR_ETAPA[candidato.etapa] || 'ENTREVISTA_INICIAL'}
      />

      {/* Formulario único de notas/recordatorios, compartido con clientes. */}
      <NotaFormModal
        open={!!openNota}
        onClose={() => setOpenNota(null)}
        candidatoId={candidato.id}
        tipo={openNota || 'RECORDATORIO'}
        nombreCliente={`${candidato.nombre} ${candidato.apellidoP}`}
        onSaved={() => refetch()}
      />

      <Modal open={!!notaABorrar} onClose={() => setNotaABorrar(null)} title="Eliminar">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Eliminar {notaABorrar?.tipo === 'NOTA' ? 'esta nota' : 'este recordatorio'}? No se puede deshacer.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={() => setNotaABorrar(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarNota} className="btn-danger">Eliminar</button>
        </div>
      </Modal>

      <Modal open={toArchive} onClose={() => setToArchive(false)} title="Archivar candidato">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Archivar a <strong>{candidato.nombre} {candidato.apellidoP}</strong>? Su expediente,
          evaluación y citas se conservan; puedes restaurarlo desde "Ver archivados" en la lista.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={() => setToArchive(false)} className="btn-secondary">Cancelar</button>
          <button onClick={archivar} className="btn-danger">Archivar</button>
        </div>
      </Modal>
    </div>
  );
}
