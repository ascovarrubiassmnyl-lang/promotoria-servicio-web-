import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Modal, CitaBadge } from '../ui.jsx';
import { CANALES, ESTADOS_CITA, CLASIFICACIONES, CITA_VIVA, MODALIDADES_PROMOTOR, infoCanal, infoTipoCita, colorCita } from './tipos.js';
import CitaFormModal from './CitaFormModal.jsx';
import { hora, nombreMes } from '../../lib/format.js';

// Calendario SOLO para móvil (< md). Paradigma distinto al de escritorio: nada
// de cuadrícula semanal de 7 columnas — vistas Día / Agenda / Mes con tira de
// días, timeline de una columna con horas vacías colapsadas, filtros en bottom
// sheet y FAB para agendar. El escritorio vive intacto en CalendarioView.
const DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ALTO_HORA = 56; // px por hora en la vista Día
const ALTO_GAP = 34; // px de la fila "Sin citas · …" colapsada
const COL_HORA = 46; // ancho de la columna de etiquetas de hora

const startOfWeek = (d) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
};
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const keyDeCita = (c) => dayKey(new Date(c.fechaHoraInicio));
const minutosDe = (v) => {
  const d = new Date(v);
  return d.getHours() * 60 + d.getMinutes();
};
const mes3 = (d) => nombreMes(d.getMonth() + 1).slice(0, 3).toLowerCase();
const etHora = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

const focoAnillo = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900';

// Card de cita compartida por Agenda y Mes (y la lista del día seleccionado).
function CardCita({ c, onClick, esAdmin }) {
  const canal = infoCanal(c.tipo);
  // El color de la tarjeta es la CLASIFICACIÓN (verde/ámbar/rojo); el canal
  // queda como texto secundario.
  const color = colorCita(c);
  const cancelada = c.estado === 'CANCELADA';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/75 dark:hover:bg-slate-700/60 ${focoAnillo}`}
    >
      <span className={`w-1 shrink-0 self-stretch rounded-full ${color.dot} ${cancelada ? 'opacity-40' : ''}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          {hora(c.fechaHoraInicio)} – {hora(c.fechaHoraFin)}
        </span>
        <span className={`mt-0.5 block truncate text-[15px] font-semibold text-slate-800 dark:text-slate-100 ${cancelada ? 'line-through opacity-60' : ''}`}>
          {c.titulo}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${color.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
            {color.label}
          </span>
          <CitaBadge estado={c.estado} />
          {MODALIDADES_PROMOTOR.includes(c.modalidad) && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{infoTipoCita(c.modalidad).label}</span>
          )}
          {c.cliente || MODALIDADES_PROMOTOR.includes(c.modalidad) ? (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{canal.label}</span>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Sin cliente</span>
          )}
          {esAdmin && c.asesor && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{c.asesor.nombre} {c.asesor.apellidoP}</span>
          )}
        </span>
      </span>
      <span className="self-center text-lg text-slate-300 dark:text-slate-600" aria-hidden>›</span>
    </button>
  );
}

// Chip de opción del bottom sheet de filtros (área táctil ≥ 44px).
function OpcionChip({ on, onClick, dot, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition ${focoAnillo} ${
        on
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/40 dark:text-brand-300'
          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {children}
    </button>
  );
}

// Bottom sheet genérico (filtros y detalle de cita). Permanece montado para
// animar la transición; respeta prefers-reduced-motion.
function Sheet({ open, onClose, label, children }) {
  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white pb-[calc(1.5rem+env(safe-area-inset-bottom))] dark:border-slate-700 dark:bg-slate-800 transition-transform motion-reduce:transition-none ${open ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="mx-auto mt-2.5 mb-3 h-1 w-9 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}

export default function CalendarioMovil() {
  const { esAdmin, user } = useAuth();
  const qc = useQueryClient();
  const hoy = new Date();

  // Vista por defecto en móvil: Día (la unidad de trabajo en el teléfono).
  const [view, setView] = useState('dia');
  const [selDay, setSelDay] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const [expandido, setExpandido] = useState(() => new Set());
  const [fCanal, setFCanal] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fClasif, setFClasif] = useState('');
  const [fAsesor, setFAsesor] = useState('');
  const [sheetFiltros, setSheetFiltros] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [preFecha, setPreFecha] = useState(null);
  const [citaEdit, setCitaEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const touchX = useRef(null);
  const primeraCitaRef = useRef(null);

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin(),
  });

  // Rango visible: Día y Agenda navegan por semana; Mes por mes.
  const [desde, hasta] = useMemo(() => {
    if (view === 'mes') {
      const ini = new Date(selDay.getFullYear(), selDay.getMonth(), 1);
      const fin = new Date(selDay.getFullYear(), selDay.getMonth() + 1, 0, 23, 59, 59, 999);
      return [ini, fin];
    }
    const ini = startOfWeek(selDay);
    const fin = new Date(ini);
    fin.setDate(fin.getDate() + 6);
    fin.setHours(23, 59, 59, 999);
    return [ini, fin];
  }, [view, selDay]);

  const { data: citas, isLoading } = useQuery({
    queryKey: ['citas-cal', desde.toISOString(), hasta.toISOString(), fAsesor],
    queryFn: async () => {
      const params = { desde: desde.toISOString(), hasta: hasta.toISOString() };
      if (esAdmin()) {
        if (fAsesor === '__mios__') params.promotorId = user?.id;
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
  const hayFiltros = !!(fCanal || fEstado || fClasif || fAsesor);
  const selKey = dayKey(selDay);
  const listaDia = porDia[selKey] || [];

  useEffect(() => { setExpandido(new Set()); }, [selKey]);

  // ---------- Navegación ----------
  const step = (dir) => {
    const r = new Date(selDay);
    if (view === 'mes') { r.setDate(1); r.setMonth(r.getMonth() + dir); }
    else r.setDate(r.getDate() + 7 * dir);
    setSelDay(r);
  };
  const goHoy = () => setSelDay(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

  const tituloPeriodo = useMemo(() => {
    if (view === 'mes') return `${nombreMes(selDay.getMonth() + 1)} ${selDay.getFullYear()}`;
    const fin = new Date(desde);
    fin.setDate(fin.getDate() + 6);
    return `${desde.getDate()} ${mes3(desde)} – ${fin.getDate()} ${mes3(fin)}`;
  }, [view, desde, selDay]);

  // Swipe horizontal en la tira de días → semana anterior/siguiente.
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 48) step(dx > 0 ? -1 : 1);
    touchX.current = null;
  };

  // ---------- Acciones de ciclo de vida ----------
  const cambiarEstado = async (c, estado) => {
    try {
      await api.patch(`/citas/${c.id}`, { estado });
      setDetalle(null);
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
  const abrirReagendar = (c) => { setDetalle(null); setCitaEdit(c); setPreFecha(null); setModalOpen(true); };

  // ---------- Tira de días (semana del día seleccionado) ----------
  const diasSemana = useMemo(() => {
    const ini = startOfWeek(selDay);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });
  }, [selDay]);

  // ---------- Vista Día: timeline con rango dinámico y horas colapsadas ----------
  const tl = useMemo(() => {
    if (!listaDia.length) return null;
    const hIni = Math.floor(minutosDe(listaDia[0].fechaHoraInicio) / 60);
    const finMax = Math.max(...listaDia.map((c) => Math.max(minutosDe(c.fechaHoraFin), minutosDe(c.fechaHoraInicio) + 30)));
    const hFin = Math.ceil(finMax / 60);
    // 1 h antes de la primera cita → 1 h después de la última, acotado a 7–21
    // (salvo citas fuera de ese rango, que siempre se muestran).
    const primera = hIni < 7 ? hIni : Math.max(7, hIni - 1);
    const ultima = hFin > 21 ? hFin : Math.min(21, hFin + 1);
    const ocupada = new Set();
    listaDia.forEach((c) => {
      const a = Math.floor(minutosDe(c.fechaHoraInicio) / 60);
      const b = Math.max(Math.ceil(Math.max(minutosDe(c.fechaHoraFin), minutosDe(c.fechaHoraInicio) + 30) / 60), a + 1);
      for (let h = a; h < b; h++) ocupada.add(h);
    });
    const segs = [];
    const pos = {};
    let top = 0;
    let gap = [];
    const flush = () => {
      if (gap.length) { segs.push({ tipo: 'gap', horas: [...gap], top }); top += ALTO_GAP; gap = []; }
    };
    for (let h = primera; h < ultima; h++) {
      const visible = ocupada.has(h) || ocupada.has(h - 1) || ocupada.has(h + 1) || expandido.has(h);
      if (visible) { flush(); pos[h] = top; segs.push({ tipo: 'hora', h, top }); top += ALTO_HORA; }
      else gap.push(h);
    }
    flush();
    return { segs, pos, altoTotal: top };
  }, [listaDia, expandido]);

  // Solapamientos: máximo 2 columnas; a partir de la tercera cita simultánea,
  // la segunda tarjeta acumula "+N más".
  const eventosDia = useMemo(() => {
    if (!tl) return [];
    const lay = listaDia.map((c) => ({
      c,
      ini: minutosDe(c.fechaHoraInicio),
      fin: Math.max(minutosDe(c.fechaHoraFin), minutosDe(c.fechaHoraInicio) + 30),
    }));
    lay.forEach((e, i) => {
      const previos = lay.slice(0, i).filter((p) => !p.oculta && p.fin > e.ini && p.ini < e.fin);
      if (!previos.length) e.col = 0;
      else if (previos.length === 1) { e.col = previos[0].col === 0 ? 1 : 0; e.doble = previos[0].doble = true; }
      else { e.oculta = true; const host = previos[previos.length - 1]; host.mas = (host.mas || 0) + 1; }
    });
    return lay
      .filter((e) => !e.oculta)
      .map((e) => {
        const sh = Math.floor(e.ini / 60);
        const base = tl.pos[sh];
        if (base == null) return null;
        const y = base + ((e.ini - sh * 60) / 60) * ALTO_HORA;
        const alto = Math.max(38, ((e.fin - e.ini) / 60) * ALTO_HORA - 4);
        return { ...e, y: y + 2, alto, corta: alto < 46 };
      })
      .filter(Boolean);
  }, [tl, listaDia]);

  // Línea de "ahora" si el día seleccionado es hoy y la hora actual es visible.
  const lineaAhora = useMemo(() => {
    if (!tl || !esHoy(selDay)) return null;
    const ahora = new Date();
    const base = tl.pos[ahora.getHours()];
    if (base == null) return null;
    return base + (ahora.getMinutes() / 60) * ALTO_HORA;
  }, [tl, selDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir un día, llevar el scroll a la primera cita.
  useEffect(() => {
    if (view !== 'dia' || isLoading) return;
    const id = requestAnimationFrame(() => primeraCitaRef.current?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(id);
  }, [view, selKey, isLoading]);

  // ---------- Vista Mes ----------
  const gridMes = useMemo(() => {
    if (view !== 'mes') return [];
    const g = [];
    for (let i = 0; i < desde.getDay(); i++) g.push(null);
    for (let d = 1; d <= hasta.getDate(); d++) g.push(new Date(selDay.getFullYear(), selDay.getMonth(), d));
    while (g.length % 7 !== 0) g.push(null);
    return g;
  }, [view, desde, hasta, selDay]);

  // Pips de la tira de días/mes: clasificación (el color de los eventos).
  const pipsDe = (items) =>
    [...new Set(items.map((c) => c.clasificacion || 'PRODUCTIVA'))].slice(0, 3).map((v) => CLASIFICACIONES[v]?.dot || CLASIFICACIONES.PRODUCTIVA.dot);

  const diasAgenda = useMemo(
    () => diasSemana.filter((d) => (porDia[dayKey(d)] || []).length > 0),
    [diasSemana, porDia]
  );

  const canalDet = detalle ? infoCanal(detalle.tipo) : null;
  const detalleViva = detalle ? CITA_VIVA.includes(detalle.estado) : false;

  const btnAccion = 'flex-1 min-h-[44px] rounded-xl border px-3 text-[13px] font-semibold transition ' + focoAnillo;

  return (
    <div className="relative">
      {/* ---- Header pegajoso: título + vistas + navegación + tira de días ---- */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-slate-200/80 bg-slate-50/95 px-4 pt-3 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/85">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[21px] font-bold tracking-tight text-slate-800 dark:text-slate-100">Calendario</h2>
          <div className="flex rounded-xl bg-slate-200/70 p-0.5 dark:bg-slate-800" role="tablist" aria-label="Vista del calendario">
            {[['dia', 'Día'], ['agenda', 'Agenda'], ['mes', 'Mes']].map(([v, l]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`min-h-[36px] rounded-[10px] px-3.5 text-[13px] font-semibold transition ${focoAnillo} ${
                  view === v
                    ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >{l}</button>
            ))}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <button onClick={() => step(-1)} aria-label="Periodo anterior" className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${focoAnillo}`}>‹</button>
          <button onClick={goHoy} className={`h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${focoAnillo}`}>Hoy</button>
          <button onClick={() => step(1)} aria-label="Periodo siguiente" className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${focoAnillo}`}>›</button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{tituloPeriodo}</span>
          <button
            onClick={() => setSheetFiltros(true)}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${focoAnillo}`}
          >
            Filtros
            {hayFiltros && <span className="h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-brand-400" />}
          </button>
        </div>

        {/* Tira de días (oculta en Mes); swipe cambia de semana */}
        {view !== 'mes' && (
          <div className="-mx-1.5 mt-2 flex gap-0.5 pb-2" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {diasSemana.map((d, i) => {
              const sel = dayKey(d) === selKey;
              const pips = pipsDe(porDia[dayKey(d)] || []);
              return (
                <button
                  key={dayKey(d)}
                  onClick={() => { setSelDay(d); if (view === 'agenda') setView('dia'); }}
                  aria-current={sel ? 'date' : undefined}
                  className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition ${focoAnillo} ${sel ? 'bg-brand-600' : 'active:bg-slate-200/60 dark:active:bg-slate-700/60'}`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sel ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}>{DIAS_SEM[i]}</span>
                  <span className={`text-[16px] font-semibold leading-tight ${sel ? 'text-white' : esHoy(d) ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'}`}>{d.getDate()}</span>
                  <span className="flex h-[5px] items-center gap-[2.5px]">
                    {pips.map((dot, j) => (
                      <span key={j} className={`h-[4.5px] w-[4.5px] rounded-full ${sel ? 'bg-white/85' : dot}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {view === 'mes' && <div className="pb-2" />}
      </div>

      {/* ---- Contenido ---- */}
      <div className="pb-28 pt-3">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : view === 'dia' ? (
          <>
            <div className="flex items-baseline justify-between gap-2 pb-2">
              <h3 className="text-[15px] font-bold capitalize text-slate-800 dark:text-slate-100">
                {DIAS_LARGO[selDay.getDay()]} {selDay.getDate()} de {nombreMes(selDay.getMonth() + 1).toLowerCase()}
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {listaDia.length === 1 ? '1 cita' : `${listaDia.length} citas`}
              </span>
            </div>

            {!tl ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-600 dark:bg-slate-800/60">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin citas este día</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">El día está libre.</p>
                <button onClick={() => abrirAgendar(selDay)} className="btn-primary mt-4 text-sm">Agendar para este día</button>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/75">
                {tl.segs.map((seg) =>
                  seg.tipo === 'hora' ? (
                    <div key={`h${seg.h}`} className="flex border-b border-slate-100 last:border-b-0 dark:border-slate-700/60" style={{ height: ALTO_HORA }}>
                      <div className="shrink-0 border-r border-slate-100 pr-2 pt-1.5 text-right text-[10.5px] font-semibold text-slate-400 dark:border-slate-700/60 dark:text-slate-500" style={{ width: COL_HORA }}>
                        {etHora(seg.h)}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`g${seg.horas[0]}`}
                      className="flex items-center border-b border-slate-100 bg-slate-50/60 pr-3 text-[11.5px] font-semibold text-slate-400 dark:border-slate-700/60 dark:bg-slate-900/30 dark:text-slate-500"
                      style={{ height: ALTO_GAP, paddingLeft: COL_HORA + 8 }}
                    >
                      Sin citas · {etHora(seg.horas[0])} – {etHora(seg.horas[seg.horas.length - 1] + 1)}
                      <button
                        onClick={() => setExpandido((prev) => new Set([...prev, ...seg.horas]))}
                        className={`ml-auto min-h-[34px] px-2 font-bold text-brand-600 dark:text-brand-400 ${focoAnillo}`}
                      >Mostrar</button>
                    </div>
                  )
                )}

                {/* Citas posicionadas sobre las horas visibles */}
                <div className="pointer-events-none absolute inset-y-0" style={{ left: COL_HORA + 6, right: 8 }}>
                  {eventosDia.map((e, i) => {
                    const canal = infoCanal(e.c.tipo);
                    const color = colorCita(e.c);
                    const cancelada = e.c.estado === 'CANCELADA';
                    return (
                      <button
                        key={e.c.id}
                        ref={i === 0 ? primeraCitaRef : null}
                        onClick={() => setDetalle(e.c)}
                        className={`pointer-events-auto absolute overflow-hidden rounded-lg border border-slate-200/70 border-l-[3px] text-left shadow-sm dark:border-slate-600/60 ${color.chip} ${color.borde} ${cancelada ? 'line-through opacity-50' : ''} ${focoAnillo} ${
                          e.corta ? 'flex items-center gap-2 px-2.5' : 'flex flex-col justify-center gap-0 px-2.5 py-1'
                        }`}
                        style={{
                          top: e.y,
                          height: e.alto,
                          left: e.col === 1 ? 'calc(50% + 2px)' : 0,
                          right: e.doble && e.col === 0 ? 'calc(50% + 2px)' : 0,
                        }}
                      >
                        <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{e.c.titulo}</span>
                        <span className={`truncate text-[11.5px] ${color.text} ${e.corta ? 'shrink-0' : ''}`}>
                          <span className="tabular-nums">{hora(e.c.fechaHoraInicio)}</span> · {e.c.cliente ? canal.label : color.label}
                          {e.mas ? ` · +${e.mas} más` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {lineaAhora != null && (
                  <div className="pointer-events-none absolute right-0 z-10" style={{ top: lineaAhora, left: COL_HORA - 4 }}>
                    <div className="relative border-t-2 border-red-500">
                      <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : view === 'agenda' ? (
          <div className="space-y-5">
            {!diasAgenda.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-600 dark:bg-slate-800/60">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin citas esta semana</p>
                <button onClick={() => abrirAgendar(selDay)} className="btn-primary mt-4 text-sm">Agendar cita</button>
              </div>
            ) : (
              diasAgenda.map((d) => {
                const items = porDia[dayKey(d)];
                return (
                  <div key={dayKey(d)} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 shrink-0 text-center">
                        <div className={`text-[19px] font-bold leading-none ${esHoy(d) ? 'text-brand-600 dark:text-brand-400' : 'text-slate-800 dark:text-slate-100'}`}>{d.getDate()}</div>
                        <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{DIAS_SEM[d.getDay()]}</div>
                      </div>
                      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                      <span className="text-[11.5px] font-semibold text-slate-400 dark:text-slate-500">
                        {items.length === 1 ? '1 cita' : `${items.length} citas`}
                      </span>
                    </div>
                    {items.map((c) => <CardCita key={c.id} c={c} onClick={() => setDetalle(c)} esAdmin={esAdmin() && !fAsesor} />)}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800/75">
              <div className="grid grid-cols-7 pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {DIAS_SEM.map((d) => <div key={d} className="py-1">{d.slice(0, 1)}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {gridMes.map((d, i) => {
                  if (!d) return <div key={i} className="aspect-square" />;
                  const items = porDia[dayKey(d)] || [];
                  const sel = dayKey(d) === selKey;
                  const pips = pipsDe(items);
                  return (
                    <button
                      key={i}
                      onClick={() => setSelDay(d)}
                      aria-current={sel ? 'date' : undefined}
                      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl transition ${focoAnillo} ${sel ? 'bg-brand-600' : 'active:bg-slate-100 dark:active:bg-slate-700/60'}`}
                    >
                      <span className={`text-sm font-semibold ${sel ? 'text-white' : esHoy(d) ? 'font-bold text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'}`}>{d.getDate()}</span>
                      <span className="flex h-[5px] items-center gap-[2.5px]">
                        {pips.map((dot, j) => (
                          <span key={j} className={`h-[4.5px] w-[4.5px] rounded-full ${sel ? 'bg-white/85' : dot}`} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              {listaDia.length ? (
                listaDia.map((c) => <CardCita key={c.id} c={c} onClick={() => setDetalle(c)} esAdmin={esAdmin() && !fAsesor} />)
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center dark:border-slate-600 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin citas el {selDay.getDate()} de {nombreMes(selDay.getMonth() + 1).toLowerCase()}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Toca otro día o agenda una nueva.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- FAB agendar (sobre la tab bar) ---- */}
      <button
        onClick={() => abrirAgendar(selDay)}
        className={`fixed right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-brand-600 pl-4 pr-5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition active:scale-95 motion-reduce:transition-none ${focoAnillo}`}
        style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
      >
        <span className="text-lg leading-none" aria-hidden>+</span> Agendar
      </button>

      {/* ---- Bottom sheet: filtros (incluye la leyenda de canales) ---- */}
      <Sheet open={sheetFiltros} onClose={() => setSheetFiltros(false)} label="Filtros del calendario">
        {esAdmin() && (
          <>
            <h4 className="mb-2 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Asesor</h4>
            <select className="input" value={fAsesor} onChange={(e) => setFAsesor(e.target.value)}>
              <option value="">Todos los asesores</option>
              <option value="__mios__">Mis acompañamientos</option>
              <option value={user?.id}>Mi agenda</option>
              {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
            </select>
          </>
        )}
        <h4 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Clasificación</h4>
        <div className="flex flex-wrap gap-2">
          <OpcionChip on={!fClasif} onClick={() => setFClasif('')}>Todas</OpcionChip>
          {Object.values(CLASIFICACIONES).map((cl) => (
            <OpcionChip key={cl.value} on={fClasif === cl.value} onClick={() => setFClasif(fClasif === cl.value ? '' : cl.value)} dot={cl.dot}>
              {cl.label}
            </OpcionChip>
          ))}
        </div>
        <h4 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Canal</h4>
        <div className="flex flex-wrap gap-2">
          <OpcionChip on={!fCanal} onClick={() => setFCanal('')}>Todos</OpcionChip>
          {Object.values(CANALES).map((c) => (
            <OpcionChip key={c.value} on={fCanal === c.value} onClick={() => setFCanal(fCanal === c.value ? '' : c.value)}>
              {c.label}
            </OpcionChip>
          ))}
        </div>
        <h4 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Estado</h4>
        <div className="flex flex-wrap gap-2">
          <OpcionChip on={!fEstado} onClick={() => setFEstado('')}>Todos</OpcionChip>
          {Object.values(ESTADOS_CITA).map((s) => (
            <OpcionChip key={s.value} on={fEstado === s.value} onClick={() => setFEstado(fEstado === s.value ? '' : s.value)}>
              {s.label}
            </OpcionChip>
          ))}
        </div>
        <button onClick={() => setSheetFiltros(false)} className="btn-primary mt-6 min-h-[46px] w-full text-sm">
          Ver {filtradas.length === 1 ? '1 cita' : `${filtradas.length} citas`}
        </button>
      </Sheet>

      {/* ---- Bottom sheet: detalle de cita con acciones ---- */}
      <Sheet open={!!detalle} onClose={() => setDetalle(null)} label="Detalle de la cita">
        {detalle && (
          <div className="space-y-3 pt-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">{detalle.titulo}</p>
              <CitaBadge estado={detalle.estado} />
            </div>
            <div className="space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300">
              <p className="tabular-nums font-medium">{hora(detalle.fechaHoraInicio)} – {hora(detalle.fechaHoraFin)}</p>
              {detalle.cliente ? (
                <p>{detalle.cliente.nombre} {detalle.cliente.apellidoP}{detalle.cliente.telefono ? ` · ${detalle.cliente.telefono}` : ''}</p>
              ) : (
                <p className="text-slate-400 dark:text-slate-500">
                  {MODALIDADES_PROMOTOR.includes(detalle.modalidad) ? infoTipoCita(detalle.modalidad).label : 'Evento personal (sin cliente)'}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${colorCita(detalle).dot}`} />
                {colorCita(detalle).label}
                {detalle.cliente || MODALIDADES_PROMOTOR.includes(detalle.modalidad) ? ` · ${canalDet?.label}` : ''}{detalle.ubicacion ? ` · ${detalle.ubicacion}` : ''}
              </p>
              {detalle.modalidad === 'ACOMPANAMIENTO' && (
                <p className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  ◎ Acompañamiento{detalle.promotor ? ` · ${detalle.promotor.nombre} ${detalle.promotor.apellidoP}` : ' · promotor por asignar'}
                </p>
              )}
              {detalle.modalidad === 'ENTREGA_POLIZA' && (
                <p className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                  ⬒ Entrega de póliza
                </p>
              )}
              {esAdmin() && detalle.asesor && (
                <p className="text-xs text-slate-400 dark:text-slate-500">Asesor: {detalle.asesor.nombre} {detalle.asesor.apellidoP}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {detalleViva && (
                <button onClick={() => cambiarEstado(detalle, 'COMPLETADA')} className={`${btnAccion} border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400`}>✓ Completar</button>
              )}
              <button onClick={() => abrirReagendar(detalle)} className={`${btnAccion} border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300`}>Reagendar</button>
              {detalleViva && (
                <>
                  <button onClick={() => cambiarEstado(detalle, 'CANCELADA')} className={`${btnAccion} border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300`}>Cancelar cita</button>
                  <button onClick={() => cambiarEstado(detalle, 'NO_ASISTIO')} className={`${btnAccion} border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300`}>No asistió</button>
                </>
              )}
            </div>
            <button
              onClick={() => { setToDelete(detalle); setDetalle(null); }}
              className={`min-h-[44px] w-full rounded-xl text-[13px] font-semibold text-red-600 dark:text-red-400 ${focoAnillo}`}
            >
              Eliminar definitivamente
            </button>
          </div>
        )}
      </Sheet>

      <CitaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cita={citaEdit}
        preFecha={preFecha}
        asesorId={esAdmin() && fAsesor && fAsesor !== '__mios__' ? fAsesor : null}
      />

      {/* Borrado real: acción separada, siempre con confirmación (la vía normal
          para conservar historial es "Cancelar cita"). */}
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
