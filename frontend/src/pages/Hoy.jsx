import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card } from '../components/ui.jsx';
import { fechaHora, fechaCorta, hora } from '../lib/format.js';
import { avisar } from '../lib/toast.js';
import { infoEtapa } from '../components/clientes/etapas.js';
import { infoCanal, MENSAJE_ESTADO_CITA } from '../components/citas/tipos.js';
import RegistrarLlamadaModal, { ligaWhatsApp } from '../components/clientes/RegistrarLlamadaModal.jsx';

// "Hoy" (2026-10-13, auditoría de UI): la lista de trabajo del día. Lo que el
// asesor necesita a las 9 a.m. vivía en cuatro módulos (calendario,
// recordatorios de cada ficha, leads y clínica). Aquí se ve todo junto y cada
// fila se resuelve sin salir: llamar, WhatsApp, registrar la llamada o marcar
// el recordatorio como hecho. Los datos los arma GET /hoy (siempre el día de
// quien consulta).

const nombreDe = (c) => (c ? `${c.nombre} ${c.apellidoP || ''}`.trim() : '');

function hace(fecha) {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

const IconoTel = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
);

// Botones de contacto de una fila: registrar llamada (abre el modal, que a su
// vez trae Llamar/WhatsApp) + WhatsApp directo si hay teléfono.
function AccionesContacto({ cliente, onLlamada }) {
  const wa = ligaWhatsApp(cliente?.telefono);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">WhatsApp</a>
      )}
      {cliente?.id && (
        <button type="button" onClick={() => onLlamada(cliente)} className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600" title="Registrar llamada">
          <IconoTel /> Llamada
        </button>
      )}
    </div>
  );
}

function Seccion({ title, conteo, children, vacio, accionVacio }) {
  return (
    <Card title={<span>{title}{conteo > 0 && <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:text-slate-300">{conteo}</span>}</span>}>
      {conteo > 0 ? <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-700/60">{children}</ul> : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400 dark:text-slate-500">
          <span>{vacio}</span>
          {accionVacio}
        </div>
      )}
    </Card>
  );
}

function Progreso({ progreso }) {
  const pct = Math.min(100, Math.round((progreso.puntos / (progreso.meta || 25)) * 100));
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">25 puntos de hoy</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {progreso.puntos}<span className="text-base font-medium text-slate-400"> / {progreso.meta}</span>
          </p>
        </div>
        <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
          <span><strong className="tabular-nums">{progreso.llamadas}</strong> llamadas</span>
          <span><strong className="tabular-nums">{progreso.citasObtenidas}</strong> citas obtenidas</span>
          <Link to="/puntos" className="text-brand-600 dark:text-brand-400 hover:underline">Ver formato</Link>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Las llamadas y citas que registras en el CRM se suman solas.</p>
    </div>
  );
}

export default function Hoy() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [llamada, setLlamada] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hoy'],
    queryFn: async () => (await api.get('/hoy')).data,
    refetchInterval: 60000,
  });

  const completar = async (n) => {
    try {
      await api.patch(`/notas/${n.id}`, { completada: true });
      avisar('Recordatorio completado');
      qc.invalidateQueries(['hoy']);
      if (n.clienteId) qc.invalidateQueries(['cliente', n.clienteId]);
    } catch (e) { avisar(handleError(e), 'error'); }
  };

  // Cerrar una cita que ya pasó: alimenta "citas realizadas" de Metas.
  const cerrarCita = async (c, estado) => {
    try {
      await api.patch(`/citas/${c.id}`, { estado });
      avisar(MENSAJE_ESTADO_CITA[estado]);
      ['hoy', 'citas', 'citas-cal', 'clientes', 'metas-resumen'].forEach((k) => qc.invalidateQueries([k]));
    } catch (e) { avisar(handleError(e), 'error'); }
  };

  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Cargando tu día…</div>;
  if (isError) return <div className="py-12 text-center text-sm text-red-600">{handleError(error)}</div>;

  const { citas, porCerrar = [], recordatorios, leads, porLlamar, progreso } = data;
  const pendientes = citas.length + porCerrar.length + recordatorios.length + leads.length + porLlamar.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Hoy, {fecha}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {pendientes === 0
            ? `Todo al día, ${user?.nombre || ''}. Buen momento para prospectar.`
            : `${user?.nombre || ''}, esto es lo que toca hoy.`}
        </p>
      </div>

      <Progreso progreso={progreso} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {porCerrar.length > 0 && (
            <Seccion title="¿Cómo te fue? Citas por cerrar" conteo={porCerrar.length}>
              {porCerrar.map((c) => {
                const persona = c.cliente || c.candidato;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.titulo}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {fechaCorta(c.fechaHoraInicio)}, {hora(c.fechaHoraInicio)}{persona ? ` · ${nombreDe(persona)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => cerrarCita(c, 'COMPLETADA')} className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">✓ Se hizo</button>
                      <button type="button" onClick={() => cerrarCita(c, 'NO_ASISTIO')} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">No asistió</button>
                      {c.cliente && <Link to={`/clientes/${c.cliente.id}`} state={{ abrirCita: true }} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Reagendar</Link>}
                    </div>
                  </li>
                );
              })}
            </Seccion>
          )}
          <Seccion
            title="Citas de hoy"
            conteo={citas.length}
            vacio="Sin citas hoy."
            accionVacio={<Link to="/citas" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">Ir a la agenda</Link>}
          >
            {citas.map((c) => {
              const persona = c.cliente || c.candidato;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      <span className="tabular-nums text-brand-600 dark:text-brand-400">{hora(c.fechaHoraInicio)}</span> · {c.titulo}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {persona ? nombreDe(persona) : 'Sin cliente'} · {infoCanal(c.tipo).label}{c.ubicacion ? ` · ${c.ubicacion}` : ''}
                    </p>
                  </div>
                  {c.cliente ? (
                    <Link to={`/clientes/${c.cliente.id}`} className="btn-secondary shrink-0 text-xs py-1 px-2">Ver ficha</Link>
                  ) : persona?.telefono ? (
                    <a href={`tel:${persona.telefono}`} className="btn-secondary shrink-0 text-xs py-1 px-2">Llamar</a>
                  ) : null}
                </li>
              );
            })}
          </Seccion>

          <Seccion title="Recordatorios" conteo={recordatorios.length} vacio="Ningún recordatorio pendiente.">
            {recordatorios.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-100">{n.texto}</p>
                  <p className="text-xs">
                    <span className={n.vencido ? 'font-medium text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}>
                      {n.vencido ? 'Vencido' : 'Hoy'} · {fechaHora(n.fechaAviso)}
                    </span>
                    {n.cliente && (
                      <> · <Link to={`/clientes/${n.cliente.id}`} className="text-slate-500 dark:text-slate-400 hover:underline">{nombreDe(n.cliente)}</Link></>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {n.cliente && n.tipo === 'RECORDATORIO' && <AccionesContacto cliente={n.cliente} onLlamada={setLlamada} />}
                  <button type="button" onClick={() => completar(n)} className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">✓ Hecho</button>
                </div>
              </li>
            ))}
          </Seccion>
        </div>

        <div className="space-y-4">
          <Seccion
            title="Leads nuevos sin llamar"
            conteo={leads.length}
            vacio="No hay leads nuevos pendientes."
            accionVacio={<Link to="/clientes" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">Ver CRM</Link>}
          >
            {leads.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link to={`/clientes/${c.id}`} className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:underline">
                    {nombreDe(c)}
                  </Link>
                  {c.leadSinVer && <span className="ml-2 rounded bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">Nuevo</span>}
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {c.fuente || 'Sin fuente'} · llegó {hace(c.creadoEn)}{c.telefono ? '' : ' · sin teléfono'}
                  </p>
                </div>
                <AccionesContacto cliente={c} onLlamada={setLlamada} />
              </li>
            ))}
          </Seccion>

          <Seccion
            title="A quién llamar esta semana"
            conteo={porLlamar.length}
            vacio="Tu clínica de la semana está al día."
            accionVacio={<Link to="/clinica" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">Ver clínica</Link>}
          >
            {porLlamar.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  {p.clienteId ? (
                    <Link to={`/clientes/${p.clienteId}`} className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:underline">{p.nombre}</Link>
                  ) : <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.nombre}</span>}
                  <p className="text-xs text-slate-500 dark:text-slate-400">{p.estado ? infoEtapa(p.estado).label : 'Prospecto de clínica'}{p.telefono ? '' : ' · sin teléfono'}</p>
                </div>
                {p.cliente ? <AccionesContacto cliente={p.cliente} onLlamada={setLlamada} /> : p.telefono ? (
                  <a href={`tel:${p.telefono}`} className="btn-secondary shrink-0 text-xs py-1 px-2">Llamar</a>
                ) : null}
              </li>
            ))}
          </Seccion>
        </div>
      </div>

      <RegistrarLlamadaModal
        open={!!llamada}
        cliente={llamada}
        onClose={() => setLlamada(null)}
        onCita={() => llamada && navigate(`/clientes/${llamada.id}`, { state: { abrirCita: true } })}
      />
    </div>
  );
}
