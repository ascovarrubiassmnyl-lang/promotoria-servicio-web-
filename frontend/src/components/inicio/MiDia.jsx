import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { fechaCorta, hora } from '../../lib/format.js';
import { avisar } from '../../lib/toast.js';
import { medir } from '../../lib/medir.js';
import { infoEtapa } from '../clientes/etapas.js';
import { infoCanal, MENSAJE_ESTADO_CITA } from '../citas/tipos.js';
import RegistrarLlamadaModal, { ligaWhatsApp } from '../clientes/RegistrarLlamadaModal.jsx';

// Mi día (rediseño de Inicio, 2026-11-20, auditoría del 20-nov): responde
// "¿qué tengo hoy?" y "¿a quién contacto ahora?" en dos bloques, cada cosa una
// sola vez. Antes eran siete bloques que se repetían entre sí (la misma
// invitación en dos lugares, el mismo cliente en recordatorios y en "a quién
// llamar") y medían ~7 pantallas.
//  - Franja "Hoy": invitaciones por responder, citas de hoy, citas por cerrar
//    y la barra de 25 puntos.
//  - "Contactar ahora": la bandeja única que arma el servidor
//    (utils/contactar.js → GET /hoy `contactar`), ya ordenada por urgencia.
// Un bloque sin datos no ocupa una tarjeta: se reduce a una línea.

const MAX_VISIBLES = 7;

const nombreDe = (c) => (c ? `${c.nombre} ${c.apellidoP || ''}`.trim() : '');

function hace(fecha) {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

const Icono = {
  tel: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  wa: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  check: <path d="M20 6 9 17l-5-5" />,
};
const Svg = ({ d }) => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

// Botón de acción de fila: en celular solo el ícono (con nombre accesible),
// desde `sm` ícono + texto. Así nunca se cortan a 360 px.
const BOTON = 'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50 sm:px-2.5';
const TONOS = {
  wa: 'border border-slate-200 text-emerald-700 hover:bg-emerald-50 dark:border-slate-600 dark:text-emerald-400 dark:hover:bg-emerald-900/30',
  llamada: 'bg-amber-500 text-white hover:bg-amber-600',
  ok: 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30',
  neutro: 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50',
};

// `medicion` = [bloque, accion, detalle?] para el evento de uso (lib/medir.js).
function Accion({ icono, label, tono, href, onClick, disabled, title, medicion }) {
  const contenido = <>{icono && <Svg d={Icono[icono]} />}<span className={icono ? 'hidden sm:inline' : ''}>{label}</span></>;
  const clase = `${BOTON} ${TONOS[tono]}`;
  const registrar = () => { if (medicion) medir(...medicion); };
  if (href) return <a href={href} onClick={registrar} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={clase} aria-label={label} title={title || label}>{contenido}</a>;
  return <button type="button" onClick={() => { registrar(); onClick?.(); }} disabled={disabled} className={clase} aria-label={label} title={title || label}>{contenido}</button>;
}

/* ---------- Franja "Hoy" ---------- */

function Puntos({ progreso }) {
  const pct = Math.min(100, Math.round((progreso.puntos / (progreso.meta || 25)) * 100));
  return (
    <Link to="/puntos" onClick={() => medir('hoy', 'puntos')} className="block rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-slate-100 dark:bg-slate-700/40 dark:hover:bg-slate-700/70" title="Ver formato de 25 puntos">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
        <span>
          <b className="text-base tabular-nums text-slate-800 dark:text-slate-100">{progreso.puntos}</b>
          <span className="tabular-nums"> / {progreso.meta} puntos</span>
        </span>
        <span className="tabular-nums">{progreso.llamadas} llamadas · {progreso.citasObtenidas} citas obtenidas</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600">
        <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

function FilaHoy({ etiqueta, tonoEtiqueta = 'text-brand-600 dark:text-brand-400', titulo, to, detalle, medicion, children }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <span className={`w-[4.5rem] shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums ${tonoEtiqueta}`}>{etiqueta}</span>
      <div className="min-w-[8rem] flex-1">
        {to
          ? <Link to={to} onClick={() => medicion && medir(...medicion)} className="block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">{titulo}</Link>
          : <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{titulo}</p>}
        {detalle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{detalle}</p>}
      </div>
      {/* Si no caben junto al texto, las acciones bajan a su propia línea
          (nunca se cortan ni empujan el ancho). */}
      {children && <div className="ml-auto flex shrink-0 gap-1">{children}</div>}
    </li>
  );
}

function FranjaHoy({ data, onResponder, respondiendo, onCerrarCita }) {
  const { citas, porCerrar = [], invitaciones = [], progreso } = data;
  const vacio = !citas.length && !porCerrar.length && !invitaciones.length;
  return (
    <section className="card p-4 sm:p-5" data-bloque="hoy">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Hoy</h2>
        <Link to="/citas" onClick={() => medir('hoy', 'ir_agenda')} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">Agenda</Link>
      </div>
      <div className="mt-3"><Puntos progreso={progreso} /></div>

      {vacio ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">Sin citas ni invitaciones hoy.</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-700/60">
          {invitaciones.map((c) => (
            <FilaHoy
              key={`inv-${c.id}-${c.invitadoId || 'promotor'}`}
              etiqueta={fechaCorta(c.fechaHoraInicio) === fechaCorta(new Date()) ? hora(c.fechaHoraInicio) : fechaCorta(c.fechaHoraInicio)}
              tonoEtiqueta="text-violet-600 dark:text-violet-400"
              titulo={c.titulo}
              to={`/citas?cita=${c.id}`}
              medicion={['hoy', 'abrir_invitacion']}
              detalle={`Invitación · ${fechaCorta(c.fechaHoraInicio)}, ${hora(c.fechaHoraInicio)} · ${nombreDe(c.asesor)}`}
            >
              <Accion icono="check" label="Aceptar" tono="ok" medicion={['hoy', 'invitacion_aceptar']} disabled={respondiendo === c.id} onClick={() => onResponder(c, 'ACEPTADA')} />
              <Accion label="Rechazar" tono="neutro" medicion={['hoy', 'invitacion_rechazar']} disabled={respondiendo === c.id} onClick={() => onResponder(c, 'RECHAZADA')} />
            </FilaHoy>
          ))}
          {citas.map((c) => {
            const persona = c.cliente || c.candidato;
            return (
              <FilaHoy
                key={c.id}
                etiqueta={hora(c.fechaHoraInicio)}
                titulo={c.titulo}
                to={c.cliente ? `/clientes/${c.cliente.id}` : `/citas?cita=${c.id}`}
                medicion={['hoy', 'abrir_cita']}
                detalle={[persona ? nombreDe(persona) : null, infoCanal(c.tipo).label, c.ubicacion].filter(Boolean).join(' · ')}
              />
            );
          })}
          {porCerrar.map((c) => {
            const persona = c.cliente || c.candidato;
            return (
              <FilaHoy
                key={`cerrar-${c.id}`}
                etiqueta="Por cerrar"
                tonoEtiqueta="text-amber-600 dark:text-amber-400"
                titulo={c.titulo}
                detalle={`¿Cómo te fue? ${fechaCorta(c.fechaHoraInicio)}, ${hora(c.fechaHoraInicio)}${persona ? ` · ${nombreDe(persona)}` : ''}`}
              >
                <Accion icono="check" label="Se hizo" tono="ok" medicion={['hoy', 'cita_completada']} onClick={() => onCerrarCita(c, 'COMPLETADA')} />
                <Accion label="No asistió" tono="neutro" medicion={['hoy', 'cita_no_asistio']} onClick={() => onCerrarCita(c, 'NO_ASISTIO')} />
              </FilaHoy>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- Bandeja "Contactar ahora" ---------- */

const GRUPOS = {
  VENCIDO: { label: 'Vencidos', clase: 'text-red-600 dark:text-red-400' },
  HOY: { label: 'Hoy', clase: 'text-amber-600 dark:text-amber-400' },
  SEMANA: { label: 'Esta semana', clase: 'text-slate-500 dark:text-slate-400' },
};

function FilaContactar({ f, posicion, onLlamada, onHecho, ocupado }) {
  const wa = ligaWhatsApp(f.telefono);
  // Categorías de la fila, nunca datos del cliente.
  const m = (accion) => ['contactar', accion, { tipo: f.tipo, grupo: f.grupo, posicion }];
  const contacto = f.ultimoContacto ? `Última llamada ${hace(f.ultimoContacto)}` : 'Nunca llamado';
  const meta = [contacto, f.etapa ? infoEtapa(f.etapa).label : null].filter(Boolean).join(' · ');
  // "Hecho" solo donde significa algo concreto; en leads y clínica con ficha
  // la acción es registrar la llamada (suma en 25 puntos y en el embudo).
  const hecho = {
    RECORDATORIO: { label: 'Hecho', title: 'Marcar el recordatorio como hecho' },
    PAGO: { label: 'Hecho', title: 'Marcar el recordatorio de pago como hecho' },
    SEGUIMIENTO: { label: 'Hecho', title: 'Quitar la marca de seguimiento' },
    CLINICA: f.cliente ? null : { label: 'Contactado', title: 'Ya le llamé: cuenta en 25 puntos y en el embudo' },
  }[f.tipo];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-[10rem] flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          {f.clienteId
            ? <Link to={`/clientes/${f.clienteId}`} onClick={() => medir(...m('abrir_ficha'))} className="truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">{f.nombre}</Link>
            : <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{f.nombre}</span>}
          {f.nuevo && <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">Nuevo</span>}
        </p>
        <p className="truncate text-xs text-slate-600 dark:text-slate-300">
          {f.motivo}{f.otrosMotivos.length > 0 && <span className="text-slate-400"> · +{f.otrosMotivos.length} {f.otrosMotivos.length === 1 ? 'motivo' : 'motivos'}</span>}
        </p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">{meta}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {wa && <Accion icono="wa" label="WhatsApp" tono="wa" href={wa} medicion={m('whatsapp')} />}
        {f.cliente
          ? <Accion icono="tel" label="Llamada" tono="llamada" medicion={m('llamada')} onClick={() => onLlamada(f.cliente)} title="Registrar llamada" />
          : f.telefono && <Accion icono="tel" label="Llamar" tono="neutro" href={`tel:${f.telefono}`} medicion={m('llamar_tel')} />}
        {hecho && <Accion icono="check" label={hecho.label} title={hecho.title} tono="ok" medicion={m('hecho')} disabled={ocupado} onClick={() => onHecho(f)} />}
      </div>
    </div>
  );
}

function ContactarAhora({ filas, onLlamada, onHecho, ocupado }) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? filas : filas.slice(0, MAX_VISIBLES);
  return (
    <section className="card p-4 sm:p-5" data-bloque="contactar">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Contactar ahora
          {filas.length > 0 && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">{filas.length}</span>}
        </h2>
        <Link to="/clientes" onClick={() => medir('contactar', 'ir_crm')} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">CRM</Link>
      </div>

      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">Nadie pendiente de contactar. Estás al día.</p>
      ) : (
        <>
          <div className="mt-1">
            {visibles.map((f, i) => {
              const nuevoGrupo = i === 0 || visibles[i - 1].grupo !== f.grupo;
              return (
                <div key={f.key}>
                  {nuevoGrupo && (
                    <p className={`pt-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide ${GRUPOS[f.grupo].clase}`}>{GRUPOS[f.grupo].label}</p>
                  )}
                  <div className={nuevoGrupo ? '' : 'border-t border-slate-100 dark:border-slate-700/60'}>
                    <FilaContactar f={f} posicion={i + 1} onLlamada={onLlamada} onHecho={onHecho} ocupado={ocupado === f.key} />
                  </div>
                </div>
              );
            })}
          </div>
          {filas.length > MAX_VISIBLES && (
            <button type="button" onClick={() => { medir('contactar', todos ? 'ver_menos' : 'ver_todos', { total: filas.length }); setTodos((t) => !t); }} className="mt-2 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
              {todos ? 'Ver menos' : `Ver todos (${filas.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Contenedor ---------- */

export default function MiDia() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [llamada, setLlamada] = useState(null);
  const [respondiendo, setRespondiendo] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hoy'],
    queryFn: async () => (await api.get('/hoy')).data,
    refetchInterval: 60000,
  });

  const refrescar = (...extra) => ['hoy', ...extra].forEach((k) => qc.invalidateQueries([k]));

  // "Hecho" según el motivo de la fila. Cada uno usa el endpoint de siempre.
  const hecho = async (f) => {
    setOcupado(f.key);
    try {
      if (f.notaId) {
        await api.patch(`/notas/${f.notaId}`, { completada: true });
        avisar('Recordatorio completado');
        refrescar('cliente');
      } else if (f.tipo === 'SEGUIMIENTO') {
        await api.patch(`/clientes/${f.clienteId}`, { necesitaSeguimiento: false });
        avisar('Seguimiento atendido');
        refrescar('cliente', 'clientes');
      } else if (f.tipo === 'CLINICA') {
        await api.patch(`/clinica/prospectos/${f.prospectoId}`, { resultado: 'CONTACTADO' });
        avisar('Llamada registrada');
        refrescar('clinica-semana', 'puntos-semana', 'proceso-ventas', 'metas-resumen');
      }
    } catch (e) { avisar(handleError(e), 'error'); } finally { setOcupado(null); }
  };

  // Cerrar una cita que ya pasó: alimenta "citas realizadas" de Metas.
  const cerrarCita = async (c, estado) => {
    try {
      await api.patch(`/citas/${c.id}`, { estado });
      avisar(MENSAJE_ESTADO_CITA[estado]);
      refrescar('citas', 'citas-cal', 'clientes', 'metas-resumen');
    } catch (e) { avisar(handleError(e), 'error'); }
  };

  // Responder una invitación sin ir al calendario. Dos vías en el servidor:
  // invitado a una cita (CitaInvitado) o promotor de un acompañamiento.
  // Aceptar advierte si choca con otra cita (409), igual que en el calendario.
  const responderInvitacion = async (inv, respuesta) => {
    const ruta = inv.invitadoId ? `/citas/${inv.id}/invitados/${inv.invitadoId}` : `/citas/${inv.id}/invitacion`;
    setRespondiendo(inv.id);
    try {
      try {
        await api.patch(ruta, { respuesta });
      } catch (e) {
        const otra = e?.response?.status === 409 && e.response.data?.empalme;
        if (!otra) throw e;
        if (!window.confirm(`Ya tienes "${otra.titulo}" a esa hora (${hora(otra.fechaHoraInicio)} – ${hora(otra.fechaHoraFin)}).\n\n¿Aceptar de todos modos?`)) return;
        await api.patch(ruta, { respuesta, ignorarEmpalme: true });
      }
      avisar(respuesta === 'ACEPTADA' ? 'Invitación aceptada' : 'Invitación rechazada');
      refrescar('citas', 'citas-cal', 'notificaciones');
    } catch (e) { avisar(handleError(e), 'error'); } finally { setRespondiendo(null); }
  };

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Cargando tu día…</div>;
  if (isError) return <div className="py-12 text-center text-sm text-red-600">{handleError(error)}</div>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-2">
        <FranjaHoy data={data} onResponder={responderInvitacion} respondiendo={respondiendo} onCerrarCita={cerrarCita} />
      </div>
      <div className="min-w-0 lg:col-span-3">
        <ContactarAhora filas={data.contactar || []} onLlamada={setLlamada} onHecho={hecho} ocupado={ocupado} />
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
