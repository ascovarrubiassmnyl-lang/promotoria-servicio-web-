import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { Card, Modal, EmptyState, MenuAcciones } from '../ui.jsx';
import CandidatoFormModal from './CandidatoFormModal.jsx';
import PopPlantillaModal from './PopPlantillaModal.jsx';
import { infoRecomendacion, infoEstadoPop, camposFaltantesPop } from './tipos.js';
import { fechaCorta, edad } from '../../lib/format.js';

// Barra de un bloque del resultado (ADN en Ventas, Experiencia…), el
// equivalente de las barras del "Gráfico del Potencial de Ventas" del reporte
// oficial. El color lo decide el mismo semáforo del POP: verde/ámbar/rojo
// según los umbrales de la plantilla, no un degradado decorativo.
function BarraBloque({ bloque, umbralVerde, umbralAmarillo }) {
  const pct = bloque.porcentaje ?? 0;
  const nivel = pct >= umbralVerde ? 'PROCEDER' : pct >= umbralAmarillo ? 'PRECAUCION' : 'NO_PROCEDER';
  const { barra } = infoRecomendacion(nivel);
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-slate-600 dark:text-slate-300 truncate" title={bloque.bloque}>
        {bloque.bloque}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${barra} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {pct}% <span className="text-slate-300 dark:text-slate-600">·</span> {bloque.puntos}/{bloque.posibles}
      </span>
    </div>
  );
}

// Resultado completo de un POP contestado, incluyendo las respuestas abiertas.
function ResultadoPop({ envioId }) {
  const { data: envio } = useQuery({
    queryKey: ['pop-envio', envioId],
    queryFn: async () => (await api.get(`/pop/envios/${envioId}`)).data,
    enabled: !!envioId,
  });
  if (!envio) return null;

  const rec = infoRecomendacion(envio.recomendacion);
  const umbralVerde = envio.plantilla?.umbralVerde ?? 70;
  const umbralAmarillo = envio.plantilla?.umbralAmarillo ?? 40;
  const preguntas = envio.preguntas || [];
  const respuestas = envio.respuestas || [];
  const textoDe = (p) => respuestas.find((r) => r.preguntaId === p.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500">{envio.plantilla?.nombre}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Contestado el {fechaCorta(envio.respondidoEn)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{envio.puntaje}<span className="text-sm font-normal text-slate-400">/100</span></p>
            <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {envio.puntosObtenidos} de {envio.puntosPosibles} puntos
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 badge ${rec.pill}`}>
            <span className={`w-2 h-2 rounded-full ${rec.dot}`} />
            {rec.label}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{rec.descripcion}</p>

      {(envio.bloques || []).length > 0 && (
        <div className="space-y-2 pt-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Por bloque</h4>
          {envio.bloques.map((b) => (
            <BarraBloque key={b.bloque} bloque={b} umbralVerde={umbralVerde} umbralAmarillo={umbralAmarillo} />
          ))}
        </div>
      )}

      <div className="space-y-2 pt-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Respuestas</h4>
        {preguntas.map((p, i) => {
          const r = textoDe(p);
          const opcion = p.opciones?.find((o) => o.id === r?.opcionId);
          const maximo = p.opciones?.length ? Math.max(...p.opciones.map((o) => o.puntos)) : 0;
          return (
            <div key={p.id} className="border-b border-slate-50 dark:border-slate-700/60 pb-2 last:border-0">
              <p className="text-xs text-slate-400 dark:text-slate-500">{i + 1}. {p.texto}</p>
              {p.tipo === 'TEXTO' ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {r?.texto || <span className="text-slate-300 dark:text-slate-600">Sin respuesta</span>}
                </p>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-200 flex items-center justify-between gap-3">
                  <span>{opcion?.texto || '—'}</span>
                  <span className="text-xs tabular-nums text-slate-400 shrink-0">{r?.puntos ?? 0}/{maximo} pts</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tarjeta del POP en la ficha del candidato: enviar un cuestionario, copiar el
// link para mandarlo por WhatsApp y consultar resultados.
//
// El link se comparte a mano igual que la invitación de usuarios: el CRM no
// tiene canal saliente hacia el candidato (mismo motivo por el que los
// recordatorios "para el cliente" le llegan al asesor).
export default function PopCandidato({ candidato, onCambio }) {
  const qc = useQueryClient();
  const [openEnviar, setOpenEnviar] = useState(false);
  const [openPlantilla, setOpenPlantilla] = useState(false);
  const [openCompletar, setOpenCompletar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [linkNuevo, setLinkNuevo] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [verResultado, setVerResultado] = useState(null);
  const [aBorrar, setABorrar] = useState(null);

  const envios = candidato.popEnvios || [];
  // Los mismos campos que valida el servidor (camposFaltantes en routes/pop.js):
  // aquí solo para no dejar que la promotora pida un link que sería rechazado.
  const faltan = camposFaltantesPop(candidato);

  // GET /pop/plantillas siembra el cuestionario de fábrica si no existe, así
  // que esta consulta también es la que garantiza que "Enviar POP" funcione la
  // primera vez. La primera de la lista es la estándar (el servidor la ordena).
  const { data: plantillas = [] } = useQuery({
    queryKey: ['pop-plantillas'],
    queryFn: async () => (await api.get('/pop/plantillas')).data,
  });
  const estandar = plantillas.find((p) => p.clave === 'estandar') || plantillas[0] || null;
  const linkDe = (token) => `${window.location.origin}/pop/${token}`;

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (Safari sin gesto, http): el input de
      // abajo siempre muestra el link para copiarlo a mano.
    }
  };

  // Sin plantillaId el servidor manda el POP estándar (el de fábrica, con las
  // preguntas ya cargadas): la promotora no elige ni arma nada.
  const enviar = async () => {
    setEnviando(true);
    try {
      const { data } = await api.post('/pop/envios', { candidatoId: candidato.id });
      setLinkNuevo(linkDe(data.token));
      setOpenEnviar(false);
      onCambio?.();
      qc.invalidateQueries(['candidato', candidato.id]);
    } catch (e) { alert(handleError(e)); } finally { setEnviando(false); }
  };

  const cancelar = async (envio) => {
    try {
      await api.patch(`/pop/envios/${envio.id}/cancelar`);
      onCambio?.();
    } catch (e) { alert(handleError(e)); }
  };

  const borrar = async () => {
    try {
      await api.delete(`/pop/envios/${aBorrar.id}`);
      setABorrar(null);
      onCambio?.();
    } catch (e) { alert(handleError(e)); }
  };

  return (
    <>
      <Card
        title="POP · Evaluación de potencial"
        subtitle="Cuestionario ya listo. Se manda por link y el resultado llega solo."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setOpenPlantilla(true)} className="btn-secondary text-xs">Ver preguntas</button>
            <button
              onClick={() => (faltan.length ? setOpenCompletar(true) : setOpenEnviar(true))}
              className="btn-primary text-xs"
            >
              Enviar POP
            </button>
          </div>
        }
      >
        {faltan.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Antes de enviar el POP falta capturar: <strong>{faltan.join(', ')}</strong>.{' '}
            <button onClick={() => setOpenCompletar(true)} className="underline font-medium">Completar ahora</button>
          </p>
        )}
        {envios.length === 0 ? (
          <EmptyState message="Sin POP enviados. Manda uno con el botón de arriba para medir su potencial de ventas." />
        ) : (
          <div className="space-y-2">
            {envios.map((e) => {
              const rec = infoRecomendacion(e.recomendacion);
              const est = infoEstadoPop(e.estado);
              const contestado = e.estado === 'RESPONDIDO';
              const vencido = e.estado === 'PENDIENTE' && new Date(e.expiraEn) < new Date();
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {e.plantilla?.nombre || 'Cuestionario'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Enviado {fechaCorta(e.creadoEn)}
                      {contestado
                        ? ` · contestado ${fechaCorta(e.respondidoEn)}`
                        : vencido
                          ? ' · el link venció'
                          : e.abiertoEn ? ' · lo abrió, sin terminar' : ' · sin abrir'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {contestado ? (
                      <>
                        <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{e.puntaje}/100</span>
                        <span className={`inline-flex items-center gap-1.5 badge ${rec.pill}`}>
                          <span className={`w-2 h-2 rounded-full ${rec.dot}`} />
                          {rec.label}
                        </span>
                      </>
                    ) : (
                      <span className={`badge ${vencido ? 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500' : est.pill}`}>
                        {vencido ? 'Vencido' : est.label}
                      </span>
                    )}
                    <MenuAcciones
                      small
                      items={[
                        contestado && { label: 'Ver resultado', onClick: () => setVerResultado(e.id) },
                        !contestado && e.estado !== 'CANCELADO' && !vencido && {
                          label: copiado ? 'Link copiado' : 'Copiar link', onClick: () => copiar(linkDe(e.token)),
                        },
                        !contestado && e.estado !== 'CANCELADO' && {
                          label: 'Cancelar link', onClick: () => cancelar(e),
                        },
                        'sep',
                        { label: 'Eliminar', danger: true, onClick: () => setABorrar(e) },
                      ].filter(Boolean)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Enviar: confirmar los datos con los que se manda. Sin elegir
          cuestionario — va el POP estándar, que ya viene con sus preguntas. */}
      <Modal open={openEnviar} onClose={() => setOpenEnviar(false)} title="Enviar POP al candidato">
        <div className="space-y-3">
          <dl className="rounded-lg border border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 text-sm">
            {[
              ['Nombre', `${candidato.nombre} ${candidato.apellidoP} ${candidato.apellidoM || ''}`.trim()],
              ['Teléfono', candidato.telefono],
              ['Correo', candidato.email],
              ['Edad', candidato.fechaNacimiento ? `${edad(candidato.fechaNacimiento)} años` : null],
              ['Sexo', candidato.sexo === 'F' ? 'Femenino' : candidato.sexo === 'M' ? 'Masculino' : null],
              ['RFC', candidato.rfc],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-2">
                <dt className="kv-k">{k}</dt>
                <dd className="kv-v text-right">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Se genera un link de un solo uso, válido 14 días, que tú le compartes por WhatsApp o
            correo. Cuando lo conteste te llega una notificación y el resultado queda aquí, en su ficha.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setOpenEnviar(false); setOpenCompletar(true); }} className="btn-secondary">Corregir datos</button>
            <button onClick={enviar} disabled={enviando} className="btn-primary">
              {enviando ? 'Generando…' : 'Generar link'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Link recién generado, para copiar y compartir a mano */}
      <Modal open={!!linkNuevo} onClose={() => setLinkNuevo(null)} title="Link del POP">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Comparte este link con <strong>{candidato.nombre} {candidato.apellidoP}</strong>. Vence en 14 días
            y solo se puede contestar una vez.
          </p>
          <input className="input text-xs" readOnly value={linkNuevo || ''} onFocus={(e) => e.target.select()} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setLinkNuevo(null)} className="btn-secondary">Cerrar</button>
            <button onClick={() => copiar(linkNuevo)} className="btn-primary">
              {copiado ? 'Copiado ✓' : 'Copiar link'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Resultado */}
      <Modal open={!!verResultado} onClose={() => setVerResultado(null)} title="Resultado del POP" wide>
        {verResultado && <ResultadoPop envioId={verResultado} />}
        <div className="flex justify-end pt-4">
          <button onClick={() => setVerResultado(null)} className="btn-secondary">Cerrar</button>
        </div>
      </Modal>

      <Modal open={!!aBorrar} onClose={() => setABorrar(null)} title="Eliminar POP">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {aBorrar?.estado === 'RESPONDIDO'
            ? 'Este POP ya fue contestado: se perderán el puntaje y las respuestas del candidato. Esta acción no se puede deshacer.'
            : 'Se eliminará el envío y su link dejará de funcionar.'}
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={() => setABorrar(null)} className="btn-secondary">Cancelar</button>
          <button onClick={borrar} className="btn-danger">Eliminar</button>
        </div>
      </Modal>

      {/* Completar la ficha antes de enviar: reusa el mismo formulario de
          alta/edición del candidato, no un formulario paralelo. */}
      <CandidatoFormModal
        open={openCompletar}
        onClose={() => setOpenCompletar(false)}
        candidato={candidato}
        onSaved={() => { setOpenCompletar(false); onCambio?.(); }}
      />

      {/* "Ver preguntas": abre el cuestionario estándar ya cargado. Se puede
          ajustar (puntos, redacción), pero nadie tiene que armarlo de cero. */}
      <PopPlantillaModal
        open={openPlantilla}
        onClose={() => setOpenPlantilla(false)}
        plantilla={estandar}
      />
    </>
  );
}
