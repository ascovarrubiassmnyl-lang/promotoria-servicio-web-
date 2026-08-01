import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Modal, CitaBadge, EmptyState, MenuAcciones } from '../ui.jsx';
import { CANALES, ESTADOS_CITA, CLASIFICACIONES, CITA_VIVA, MODALIDADES_PROMOTOR, infoCanal, infoTipoCita, colorCita } from './tipos.js';
import CitaFormModal from './CitaFormModal.jsx';
import CalendarioMovil from './CalendarioMovil.jsx';
import useIsMobile from '../../hooks/useIsMobile.js';
import { hora, nombreMes, fechaCorta } from '../../lib/format.js';

const DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HORA_INI = 8;
const HORA_FIN = 20;
const ALTO_HORA = 46; // px por hora en la vista Semana

const startOfWeek = (d) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
};
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const keyDeCita = (c) => dayKey(new Date(c.fechaHoraInicio));

// Calendario compartido por ambos roles (mismo patrón que PolizasView/ActividadView):
// el asesor ve solo su agenda (la API fuerza asesorId); el promotor ve al equipo
// con filtro por asesor y sus propios acompañamientos.
// En móvil (< md) se monta un árbol distinto (CalendarioMovil: Día/Agenda/Mes con
// timeline de una columna); el markup de escritorio de abajo no se toca.
export default function CalendarioView() {
  const esMovil = useIsMobile();
  return esMovil ? <CalendarioMovil /> : <CalendarioEscritorio />;
}

function CalendarioEscritorio() {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const hoy = new Date();

  // Mes por defecto para ambos roles (misma UI de entrada para asesor y promotor).
  const [view, setView] = useState('mes');
  const [refDate, setRefDate] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const [selectedDay, setSelectedDay] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const [fCanal, setFCanal] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fClasif, setFClasif] = useState('');
  const [fAsesor, setFAsesor] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [preFecha, setPreFecha] = useState(null);
  const [citaEdit, setCitaEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });

  // Rango visible: Semana navega por semana; Mes y Agenda por mes.
  const [desde, hasta] = useMemo(() => {
    if (view === 'semana') {
      const ini = startOfWeek(refDate);
      const fin = new Date(ini); fin.setDate(fin.getDate() + 6); fin.setHours(23, 59, 59, 999);
      return [ini, fin];
    }
    const ini = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const fin = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return [ini, fin];
  }, [view, refDate]);

  const { data: citas, isLoading } = useQuery({
    queryKey: ['citas-cal', desde.toISOString(), hasta.toISOString(), fAsesor],
    queryFn: async () => {
      const params = { desde: desde.toISOString(), hasta: hasta.toISOString() };
      if (esAdmin()) {
        if (fAsesor === '__mios__') params.promotorId = user?.id; // acompañamientos donde participo
        else if (fAsesor) params.asesorId = fAsesor;
      }
      return (await api.get('/citas', { params })).data;
    },
  });

  const filtradas = useMemo(
    () => (citas || []).filter((c) => (!fCanal || c.tipo === fCanal) && (!fEstado || c.estado === fEstado) && (!fClasif || (c.clasificacion || 'PRODUCTIVA') === fClasif)),
    [citas, fCanal, fEstado, fClasif]
  );

  const porDia = useMemo(() => {
    const m = {};
    filtradas.forEach((c) => { (m[keyDeCita(c)] ||= []).push(c); });
    Object.values(m).forEach((l) => l.sort((a, b) => new Date(a.fechaHoraInicio) - new Date(b.fechaHoraInicio)));
    return m;
  }, [filtradas]);

  const esHoy = (d) => d.toDateString() === hoy.toDateString();
  const citasDiaSel = selectedDay ? (porDia[dayKey(selectedDay)] || []) : [];

  // ---------- Navegación ----------
  const step = (dir) => {
    const r = new Date(refDate);
    if (view === 'semana') r.setDate(r.getDate() + 7 * dir);
    else r.setMonth(r.getMonth() + dir);
    setRefDate(r);
    setSelectedDay(null);
  };
  const goHoy = () => {
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    setRefDate(h); setSelectedDay(h);
  };

  const tituloPeriodo = useMemo(() => {
    if (view === 'semana') {
      const fin = new Date(desde); fin.setDate(fin.getDate() + 6);
      return `${desde.getDate()} ${nombreMes(desde.getMonth() + 1).slice(0, 3).toLowerCase()} – ${fin.getDate()} ${nombreMes(fin.getMonth() + 1).slice(0, 3).toLowerCase()} ${fin.getFullYear()}`;
    }
    return `${nombreMes(refDate.getMonth() + 1)} ${refDate.getFullYear()}`;
  }, [view, desde, refDate]);

  // ---------- Acciones de ciclo de vida ----------
  const cambiarEstado = async (c, estado) => {
    try {
      await api.patch(`/citas/${c.id}`, { estado });
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
    } catch (e) { alert(handleError(e)); }
  };

  const confirmarEliminar = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/citas/${toDelete.id}`);
      setToDelete(null);
      qc.invalidateQueries(['citas-cal']);
      qc.invalidateQueries(['citas']);
    } catch (e) { alert(handleError(e)); } finally { setDeleting(false); }
  };

  const abrirAgendar = (fecha = null) => { setCitaEdit(null); setPreFecha(fecha); setModalOpen(true); };
  const abrirReagendar = (c) => { setCitaEdit(c); setPreFecha(null); setModalOpen(true); };

  // ---------- Celdas / chips ----------
  // La vista Mes usa el mismo chip con fondo de color en todos los tamaños
  // (antes escritorio mostraba solo un punto de 1.5px sin fondo, casi
  // invisible — feedback de la promotora 2026-07-30). El color del evento es
  // la CLASIFICACIÓN (verde/ámbar/rojo, colorCita); el canal queda como
  // etiqueta en el panel del día.
  const LineaCita = ({ c, className = '' }) => {
    const color = colorCita(c);
    const cancelada = c.estado === 'CANCELADA';
    return (
      <div className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium truncate ${color.chip} ${cancelada ? 'line-through opacity-50' : ''} ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
        <span className="tabular-nums shrink-0">{hora(c.fechaHoraInicio)}</span>
        <span className="truncate">{c.cliente?.nombre || c.titulo}</span>
      </div>
    );
  };

  // ---------- Vista Mes ----------
  const gridMes = useMemo(() => {
    if (view !== 'mes') return [];
    const g = [];
    for (let i = 0; i < desde.getDay(); i++) g.push(null);
    for (let d = 1; d <= hasta.getDate(); d++) g.push(new Date(refDate.getFullYear(), refDate.getMonth(), d));
    while (g.length % 7 !== 0) g.push(null);
    return g;
  }, [view, desde, hasta, refDate]);

  const VistaMes = () => (
    <>
      <div className="grid grid-cols-7 text-center text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
        {DIAS_SEM.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gridMes.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[88px] rounded-lg bg-slate-50/60 dark:bg-slate-800/40 md:min-h-[80px] md:bg-transparent dark:md:bg-transparent" />;
          const items = porDia[dayKey(d)] || [];
          const sel = selectedDay && selectedDay.toDateString() === d.toDateString();
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(d)}
              onDoubleClick={(e) => { e.preventDefault(); const dt = new Date(d); dt.setHours(0, 0, 0, 0); abrirAgendar(dt); }}
              className={`min-h-[88px] rounded-lg border p-1.5 text-left transition md:min-h-[80px] ${sel ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
              title="Doble clic para agendar"
            >
              <div className={`text-xs font-semibold md:font-normal ${esHoy(d) ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center' : 'text-slate-600 dark:text-slate-300'}`}>{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((c) => <LineaCita key={c.id} c={c} />)}
                {items.length > 3 && <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-1">+{items.length - 3} más</p>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );

  // ---------- Vista Semana ----------
  const diasSemana = useMemo(() => {
    if (view !== 'semana') return [];
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(desde); d.setDate(d.getDate() + i); return d; });
  }, [view, desde]);

  const VistaSemana = () => (
    <div className="overflow-auto max-h-[620px]">
      <div className="grid grid-cols-[52px_repeat(7,1fr)] sticky top-0 bg-white dark:bg-slate-800 z-10 border-b border-slate-100 dark:border-slate-700">
        <div />
        {diasSemana.map((d) => (
          <button key={dayKey(d)} onClick={() => setSelectedDay(d)} className="py-2 text-center border-l border-slate-100 dark:border-slate-700">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{DIAS_SEM[d.getDay()]}</div>
            <div className={`mt-0.5 mx-auto w-7 h-7 leading-7 rounded-full text-sm font-semibold ${esHoy(d) ? 'bg-brand-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>{d.getDate()}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[52px_repeat(7,1fr)]">
        <div>
          {Array.from({ length: HORA_FIN - HORA_INI + 1 }, (_, i) => HORA_INI + i).map((h) => (
            <div key={h} className="text-[10px] text-slate-400 dark:text-slate-500 text-right pr-2" style={{ height: ALTO_HORA }}>
              {h > 12 ? h - 12 : h} {h >= 12 ? 'pm' : 'am'}
            </div>
          ))}
        </div>
        {diasSemana.map((d) => {
          const items = porDia[dayKey(d)] || [];
          return (
            <div key={dayKey(d)} className="relative border-l border-slate-100 dark:border-slate-700">
              {Array.from({ length: HORA_FIN - HORA_INI + 1 }, (_, i) => HORA_INI + i).map((h) => (
                <div
                  key={h}
                  className="border-b border-slate-50 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  style={{ height: ALTO_HORA }}
                  onClick={() => { const dt = new Date(d); dt.setHours(h, 0, 0, 0); abrirAgendar(dt); }}
                  title="Clic para agendar a esta hora"
                />
              ))}
              {items.map((c) => {
                const color = colorCita(c);
                const ini = new Date(c.fechaHoraInicio); const fin = new Date(c.fechaHoraFin);
                const minIni = Math.max(ini.getHours() * 60 + ini.getMinutes(), HORA_INI * 60);
                const minFin = Math.min(Math.max(fin.getHours() * 60 + fin.getMinutes(), minIni + 25), (HORA_FIN + 1) * 60);
                const top = ((minIni - HORA_INI * 60) / 60) * ALTO_HORA;
                const alto = ((minFin - minIni) / 60) * ALTO_HORA;
                const cancelada = c.estado === 'CANCELADA';
                return (
                  <button
                    key={c.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedDay(d); }}
                    className={`absolute left-0.5 right-0.5 rounded-md border-l-2 px-1.5 py-0.5 text-left overflow-hidden ${color.chip} ${color.borde} ${cancelada ? 'line-through opacity-50' : ''}`}
                    style={{ top, height: Math.max(alto, 20) }}
                  >
                    <div className={`text-[10px] font-semibold tabular-nums ${color.text}`}>{hora(c.fechaHoraInicio)}</div>
                    <div className="text-[10px] font-medium text-slate-700 dark:text-slate-200 truncate">{c.titulo}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---------- Vista Agenda ----------
  const VistaAgenda = () => {
    const dias = Object.keys(porDia)
      .map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d); })
      .sort((a, b) => a - b);
    if (!dias.length) return <EmptyState message="Sin citas en este periodo." />;
    return (
      <div className="space-y-4">
        {dias.map((d) => {
          const items = porDia[dayKey(d)];
          return (
            <div key={dayKey(d)}>
              <div className="flex items-baseline gap-2 px-2 pb-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fechaCorta(d)}</p>
                {esHoy(d) && <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Hoy</span>}
                <span className="text-xs text-slate-400 dark:text-slate-500">{items.length} cita(s)</span>
              </div>
              {items.map((c) => {
                const canal = infoCanal(c.tipo);
                const color = colorCita(c);
                const cancelada = c.estado === 'CANCELADA';
                return (
                  <button key={c.id} onClick={() => setSelectedDay(d)} className="w-full flex gap-3 items-start rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <span className="w-[120px] shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400 pt-0.5">{hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)}</span>
                    <span className={`w-0.5 self-stretch rounded ${color.dot}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium text-slate-800 dark:text-slate-100 truncate ${cancelada ? 'line-through opacity-60' : ''}`}>{c.titulo}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">
                        {c.cliente ? `${c.cliente.nombre} ${c.cliente.apellidoP}` : c.candidato ? `${c.candidato.nombre} ${c.candidato.apellidoP} · ${infoTipoCita(c.modalidad).label}` : MODALIDADES_PROMOTOR.includes(c.modalidad) ? infoTipoCita(c.modalidad).label : 'Evento personal'} · {canal.label}
                        {c.modalidad === 'ACOMPANAMIENTO' && <span className="text-violet-600 dark:text-violet-400"> · + {c.promotor ? `${c.promotor.nombre} ${c.promotor.apellidoP}` : 'promotor por asignar'}</span>}
                        {esAdmin() && !fAsesor && <> · {c.asesor?.nombre} {c.asesor?.apellidoP}</>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Calendario</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {[['mes', 'Mes'], ['semana', 'Semana'], ['agenda', 'Agenda']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm ${view === v ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} className="btn-secondary px-3">←</button>
            <button onClick={goHoy} className="btn-secondary px-3">Hoy</button>
            <button onClick={() => step(1)} className="btn-secondary px-3">→</button>
            <span className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[130px] text-center">{tituloPeriodo}</span>
          </div>
          <button onClick={() => abrirAgendar(selectedDay)} className="btn-primary">+ Agendar cita</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {esAdmin() && (
          <select className="input w-auto" value={fAsesor} onChange={(e) => setFAsesor(e.target.value)}>
            <option value="">Todos los asesores</option>
            <option value="__mios__">Mis acompañamientos</option>
            <option value={user?.id}>Mi agenda</option>
            {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
          </select>
        )}
        <select className="input w-auto" value={fClasif} onChange={(e) => setFClasif(e.target.value)}>
          <option value="">Todas las clasificaciones</option>
          {Object.values(CLASIFICACIONES).map((cl) => <option key={cl.value} value={cl.value}>{cl.label}</option>)}
        </select>
        <select className="input w-auto" value={fCanal} onChange={(e) => setFCanal(e.target.value)}>
          <option value="">Todos los canales</option>
          {Object.values(CANALES).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="input w-auto" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.values(ESTADOS_CITA).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {/* Leyenda = clasificación (el color de los eventos). */}
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          {Object.values(CLASIFICACIONES).map((cl) => (
            <span key={cl.value} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cl.dot}`} />{cl.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          {view === 'mes' ? <VistaMes /> : view === 'semana' ? <VistaSemana /> : <VistaAgenda />}
        </Card>

        <Card title={selectedDay ? `Citas · ${fechaCorta(selectedDay)}` : 'Selecciona un día'}>
          {isLoading ? <div className="py-6 text-center text-slate-400 dark:text-slate-500">Cargando…</div> :
            !selectedDay ? <EmptyState message="Selecciona un día del calendario" /> :
            citasDiaSel.length === 0 ? (
              <div className="space-y-3">
                <EmptyState message="Sin citas este día" />
                <button onClick={() => abrirAgendar(selectedDay)} className="btn-primary text-xs w-full">Agendar para este día</button>
              </div>
            ) : (
              <ul className="space-y-3">
                {citasDiaSel.map((c) => {
                  const canal = infoCanal(c.tipo);
                  const color = colorCita(c);
                  const viva = CITA_VIVA.includes(c.estado);
                  return (
                    <li key={c.id} className={`rounded-lg border border-slate-100 dark:border-slate-700 border-l-[3px] ${color.borde} p-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.titulo}</p>
                        <div className="flex items-center gap-1">
                          <CitaBadge estado={c.estado} />
                          <MenuAcciones
                            small
                            label={`Acciones de ${c.titulo}`}
                            items={[
                              { label: 'Reagendar / editar', onClick: () => abrirReagendar(c) },
                              viva && { label: 'No asistió', onClick: () => cambiarEstado(c, 'NO_ASISTIO') },
                              'sep',
                              { label: 'Eliminar definitivamente', onClick: () => setToDelete(c), danger: true },
                            ]}
                          />
                        </div>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <p className="tabular-nums">{hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)}</p>
                        <p className="text-slate-600 dark:text-slate-300">
                          {c.cliente
                            ? <>{c.cliente.nombre} {c.cliente.apellidoP}{c.cliente.telefono ? ` · ${c.cliente.telefono}` : ''}</>
                            : c.candidato
                              ? <>Candidato: {c.candidato.nombre} {c.candidato.apellidoP}{c.candidato.telefono ? ` · ${c.candidato.telefono}` : ''}</>
                              : MODALIDADES_PROMOTOR.includes(c.modalidad) ? infoTipoCita(c.modalidad).label : 'Evento personal (sin cliente)'}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${color.dot}`} />{color.label}
                          {c.cliente || MODALIDADES_PROMOTOR.includes(c.modalidad) ? <> · {canal.label}</> : null}{c.ubicacion ? ` · ${c.ubicacion}` : ''}
                        </p>
                        {c.modalidad === 'ACOMPANAMIENTO' && (
                          <p className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 font-medium text-violet-700 dark:text-violet-300">
                            ◎ Acompañamiento{c.promotor ? ` · ${c.promotor.nombre} ${c.promotor.apellidoP}` : ' · promotor por asignar'}
                          </p>
                        )}
                        {c.modalidad === 'ENTREGA_POLIZA' && (
                          <p className="inline-flex items-center gap-1 rounded-md bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 font-medium text-teal-700 dark:text-teal-300">
                            ⬒ Entrega de póliza
                          </p>
                        )}
                        {esAdmin() && <p className="text-[10px] text-slate-400 dark:text-slate-500">Asesor: {c.asesor?.nombre} {c.asesor?.apellidoP}</p>}
                      </div>
                      {viva && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <button onClick={() => cambiarEstado(c, 'COMPLETADA')} className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">✓ Completar</button>
                          <button onClick={() => abrirReagendar(c)} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Reagendar</button>
                          <button onClick={() => cambiarEstado(c, 'CANCELADA')} className="rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">Cancelar cita</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        </Card>
      </div>

      <CitaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cita={citaEdit}
        preFecha={preFecha}
        asesorId={esAdmin() && fAsesor && fAsesor !== '__mios__' ? fAsesor : null}
      />

      {/* Borrado real: acción separada, siempre con confirmación. Para conservar
          el historial la vía normal es "Cancelar cita" (cambio de estado). */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cita definitivamente">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Seguro que deseas eliminar la cita <strong>{toDelete.titulo}</strong>
              {toDelete.cliente ? <> de {toDelete.cliente.nombre} {toDelete.cliente.apellidoP}</> : null}?
              Esta acción no se puede deshacer. Si solo quieres conservar el historial, usa <strong>Cancelar cita</strong>.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setToDelete(null)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={confirmarEliminar} disabled={deleting} className="btn-danger">
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
