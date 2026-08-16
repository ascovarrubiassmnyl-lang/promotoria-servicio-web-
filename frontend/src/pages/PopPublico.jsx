import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';

// Página PÚBLICA (fuera de ProtectedRoute) donde el candidato contesta el POP
// que le mandó la promotora. No tiene cuenta en el CRM: entra con el token de
// un solo uso del link, igual que /invitacion/:token.
//
// Se diseña para celular primero (es donde se abre un link de WhatsApp): una
// pregunta por bloque, opciones grandes tocables, sin sidebar ni tema oscuro
// —fondo navy fijo de la marca, como el login—. Nunca muestra puntos ni
// resultado: el puntaje es información de selección para la promotora.
export default function PopPublico() {
  const { token } = useParams();
  const [estado, setEstado] = useState('cargando'); // cargando | activo | enviado | invalida
  const [datos, setDatos] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let activo = true;
    api.get(`/pop-publico/${token}`)
      .then(({ data }) => { if (activo) { setDatos(data); setEstado('activo'); } })
      .catch((err) => {
        if (!activo) return;
        setError(err?.response?.data?.error || 'Este cuestionario no está disponible.');
        setEstado('invalida');
      });
    return () => { activo = false; };
  }, [token]);

  const preguntas = datos?.preguntas || [];
  // Solo las de opción son obligatorias (las abiertas no puntúan), misma regla
  // que valida el servidor en utils/pop.js.
  const obligatorias = preguntas.filter((p) => p.tipo !== 'TEXTO');
  const contestadas = obligatorias.filter((p) => respuestas[p.id]?.opcionId).length;
  const completo = obligatorias.length > 0 && contestadas === obligatorias.length;

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      await api.post(`/pop-publico/${token}`, {
        respuestas: preguntas.map((p) => ({
          preguntaId: p.id,
          opcionId: respuestas[p.id]?.opcionId,
          texto: respuestas[p.id]?.texto,
        })),
      });
      setEstado('enviado');
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="min-h-screen text-slate-100 px-4 py-8"
      style={{ background: 'radial-gradient(120% 120% at 50% 0%, #131a52, #070a24)' }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-400 mb-6">Origen Promotoría</p>

        {estado === 'cargando' && (
          <p className="text-center text-slate-300 text-sm">Cargando…</p>
        )}

        {estado === 'invalida' && (
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-6 text-center">
            <h1 className="text-lg font-semibold mb-2">Cuestionario no disponible</h1>
            <p className="text-sm text-slate-300">{error}</p>
          </div>
        )}

        {estado === 'enviado' && (
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6 text-emerald-400">
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold mb-2">¡Listo, gracias!</h1>
            <p className="text-sm text-slate-300">
              Tus respuestas se enviaron correctamente. Tu reclutador se pondrá en contacto contigo.
            </p>
          </div>
        )}

        {estado === 'activo' && datos && (
          <>
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-6 mb-4">
              <h1 className="text-xl font-bold mb-1">Hola, {datos.nombre}</h1>
              <p className="text-sm text-slate-300">{datos.cuestionario?.nombre}</p>
              {datos.cuestionario?.descripcion && (
                <p className="mt-2 text-sm text-slate-400">{datos.cuestionario.descripcion}</p>
              )}
              <p className="mt-3 text-xs text-slate-400">
                {obligatorias.length} preguntas · toma unos minutos · solo se puede contestar una vez.
              </p>
            </div>

            <div className="space-y-3">
              {preguntas.map((p, i) => (
                <div key={p.id} className="rounded-2xl bg-white/10 backdrop-blur-sm p-5">
                  <p className="text-xs text-slate-400 mb-1">
                    Pregunta {i + 1} de {preguntas.length}
                  </p>
                  <p className="font-medium mb-1">{p.texto}</p>
                  {p.ayuda && <p className="text-xs text-slate-400 mb-3">{p.ayuda}</p>}

                  {p.tipo === 'TEXTO' ? (
                    <textarea
                      rows={3}
                      className="mt-2 w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-white/40 focus:outline-none"
                      placeholder="Escribe tu respuesta (opcional)…"
                      value={respuestas[p.id]?.texto || ''}
                      onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: { ...r[p.id], texto: e.target.value } }))}
                    />
                  ) : (
                    <div className="mt-3 space-y-2">
                      {p.opciones.map((o) => {
                        const elegida = respuestas[p.id]?.opcionId === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setRespuestas((r) => ({ ...r, [p.id]: { ...r[p.id], opcionId: o.id } }))}
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                              elegida
                                ? 'border-brand-400 bg-brand-500/25 text-white'
                                : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10'
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                elegida ? 'border-brand-300 bg-brand-400' : 'border-white/30'
                              }`}
                            >
                              {elegida && <span className="h-2 w-2 rounded-full bg-white" />}
                            </span>
                            {o.texto}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">{error}</p>
            )}

            <div className="sticky bottom-4 mt-5">
              <button
                onClick={enviar}
                disabled={!completo || enviando}
                className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold shadow-lg transition ${
                  completo && !enviando
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'cursor-not-allowed bg-white/10 text-slate-400'
                }`}
              >
                {enviando
                  ? 'Enviando…'
                  : completo
                    ? 'Enviar respuestas'
                    : `Faltan ${obligatorias.length - contestadas} de ${obligatorias.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
