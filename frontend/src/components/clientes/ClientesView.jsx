import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Modal, Field, EmptyState, MenuAcciones } from '../ui.jsx';
import CandidatoFormModal from '../candidatos/CandidatoFormModal.jsx';
import NotaFormModal from '../notas/NotaFormModal.jsx';
import RegistrarLlamadaModal from './RegistrarLlamadaModal.jsx';
import { ETAPAS, ETAPAS_FUERA_EMBUDO, ETAPAS_SELECCIONABLES, infoEtapa, FLAG_SEGUIMIENTO, confirmacionCambioEtapa } from './etapas.js';
import { infoFuente, opcionesFuente } from './fuentes.js';
import { RAMOS_LABEL, fechaCorta, hora } from '../../lib/format.js';
import { avisar } from '../../lib/toast.js';
import { ligaWhatsApp } from './RegistrarLlamadaModal.jsx';
import { FILTROS_RAPIDOS, infoFiltroRapido, ORDENES, ordenPorClave, estadoAccion, haceCuanto, POR_PAGINA } from './lista.js';

// Vista de clientes compartida por ambos roles (mismo patrón que PolizasView):
//  - asesorId=null → cartera propia (asesor) o del equipo con filtro (promotor).
//  - asesorId=X    → cartera del asesor X (promotor, control total; los
//    clientes nuevos se asignan a ese asesor y se oculta el filtro/columna).
// La autorización real vive en el backend: un ASESOR siempre recibe solo sus
// clientes aunque manipule el parámetro asesorId.

// La bandera "necesita seguimiento" NO se pide en el alta: se marca desde el
// menú ⋯ de la ficha, cuando ya hay algo que seguir.
const FORM_VACIO = {
  nombre: '', apellidoP: '', apellidoM: '', email: '', telefono: '',
  estado: 'PROSPECTO', notas: '', fuente: '',
  productoInteres: '', productoCatalogoId: '', detalleInteres: '', referidoPorId: '',
};

// Próxima acción (derivada en el backend de citas pendientes y recordatorios
// abiertos): fecha + tipo; vencida en rojo, hoy en color de marca.
function ProximaAccion({ pa }) {
  if (!pa) return <span className="text-xs text-slate-400 dark:text-slate-500">Sin próxima acción</span>;
  const fecha = new Date(pa.fecha);
  const estado = estadoAccion({ proximaAccion: pa });
  const d = estado === 'hoy' ? `Hoy · ${hora(fecha)}` : estado === 'vencida' ? `Vencida · ${fechaCorta(fecha)}` : fechaCorta(fecha);
  const color = estado === 'vencida' ? 'text-red-600 dark:text-red-400' : estado === 'hoy' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-300';
  return (
    <div className="text-sm">
      <p className={`font-medium tabular-nums ${color}`}>{d}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[200px] truncate" title={pa.titulo}>
        {pa.tipo === 'CITA' ? 'Cita' : 'Recordatorio'} · {pa.titulo}
      </p>
    </div>
  );
}

// Celda de etapa: pill de la etapa + bandera de seguimiento. La barra de
// segmentos debajo se quitó (2026-10-15, auditoría: repetía la etapa dos veces
// por fila); el stepper completo vive en la ficha.
// La pill es un botón: abre un popover para cambiar la etapa sin entrar al
// expediente (mismo PATCH que usa la ficha). Patrón de click-outside clonado
// de MenuAcciones — su contrato es de acciones, no de selección de valor.
function EtapaCell({ cliente, onCambiarEtapa }) {
  const e = infoEtapa(cliente.estado);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const cerrar = (ev) => { if (!ref.current?.contains(ev.target) && !menuRef.current?.contains(ev.target)) setOpen(false); };
    const cerrarSiempre = () => setOpen(false);
    document.addEventListener('click', cerrar);
    window.addEventListener('scroll', cerrarSiempre, true);
    window.addEventListener('resize', cerrarSiempre);
    return () => {
      document.removeEventListener('click', cerrar);
      window.removeEventListener('scroll', cerrarSiempre, true);
      window.removeEventListener('resize', cerrarSiempre);
    };
  }, [open]);
  // Mismo criterio que MenuAcciones: portal con posición fija para que el
  // overflow de la tabla no lo recorte; se abre hacia arriba si no cabe.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const alto = menuRef.current?.offsetHeight || 0;
    const arriba = r.bottom + 4 + alto > window.innerHeight - 8 && r.top - 4 - alto > 8;
    setPos({ top: arriba ? r.top - 4 - alto : r.bottom + 4, left: Math.min(r.left, window.innerWidth - 216) });
  }, [open]);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative" ref={ref}>
        <button
          type="button"
          title="Cambiar etapa"
          onClick={(ev) => { ev.stopPropagation(); setOpen((o) => !o); }}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition hover:ring-1 hover:ring-brand-400 ${e.pill}`}
        >
          {e.label}
          <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open && createPortal(
          <div
            ref={menuRef}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
            className="fixed z-[90] min-w-[200px] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-1.5"
          >
            {ETAPAS_SELECCIONABLES.map((et) => {
              const activa = et.value === cliente.estado;
              return (
                <button
                  key={et.value}
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); setOpen(false); if (!activa) onCambiarEtapa(cliente, et.value); }}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm font-medium transition ${activa
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${infoEtapa(et.value).dot}`} />
                  {et.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      </div>
      {cliente.necesitaSeguimiento && (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${FLAG_SEGUIMIENTO.text}`}>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          Seguimiento
        </span>
      )}
    </div>
  );
}

export default function ClientesView({ asesorId = null, titulo = 'CRM', subtitulo = null, banner = null }) {
  const { esAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scoped = !!asesorId; // cartera de un asesor concreto (vista de promotor)
  // Los filtros viven en la URL (2026-10-13, auditoría F11): antes eran
  // useState y se perdían al entrar a una ficha y regresar ("Ver archivados"
  // se desmarcaba). En la URL sobreviven al "atrás" y se pueden enlazar.
  const [params, setParams] = useSearchParams();
  const ponerFiltros = (cambios) => setParams((prev) => {
    const p = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === undefined || v === '' || v === false) p.delete(k); else p.set(k, v === true ? '1' : v);
    }
    // Cambiar cualquier filtro u orden regresa a la primera página.
    if (!('pagina' in cambios)) p.delete('pagina');
    return p;
  }, { replace: true });
  const q = params.get('q') || '';
  const setQ = (v) => ponerFiltros({ q: v });
  const [asesorFiltro, setAsesorFiltro] = useState('');
  const etapaActiva = params.get('etapa') || null; // valor de etapa o '__flag'
  const setEtapaActiva = (v) => ponerFiltros({ etapa: v });
  const [filtroEtapaAbierto, setFiltroEtapaAbierto] = useState(false);
  const filtroEtapaRef = useRef(null);
  useEffect(() => {
    if (!filtroEtapaAbierto) return;
    const cerrar = (ev) => { if (!filtroEtapaRef.current?.contains(ev.target)) setFiltroEtapaAbierto(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [filtroEtapaAbierto]);
  const verArchivados = params.get('archivados') === '1';
  const setVerArchivados = (v) => ponerFiltros({ archivados: v });
  // Segmento: 'todos' | 'prospectos' | 'clientes'. Se DERIVA del flag esCliente
  // que calcula el servidor (tiene póliza viva), no de un campo capturado.
  const segmento = params.get('segmento') || 'todos';
  const rapido = params.get('rapido') || null;      // filtro rápido (lista.js)
  const fuenteFiltro = params.get('fuente') || '';  // label de fuente
  const orden = ordenPorClave(params.get('orden'));
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);

  // Modal crear/editar (mismo formulario; editId define el modo)
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [formAsesorId, setFormAsesorId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [toArchive, setToArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);

  // Recordatorio desde el menú ⋯ ({cliente, destinatario} o null).
  const [recordatorio, setRecordatorio] = useState(null);
  // Registrar llamada desde la fila: la acción que el asesor repite más.
  const [llamada, setLlamada] = useState(null);

  // Captura de candidato a asesor (reclutamiento): mismo botón de alta, el
  // selector "Cliente | Candidato" del modal rutea al formulario correcto.
  const [openCandidato, setOpenCandidato] = useState(false);

  // q y asesor se filtran en el servidor; los chips de etapa filtran en
  // cliente para poder mostrar el conteo de todas las etapas a la vez.
  const { data: clientes, refetch, isLoading } = useQuery({
    queryKey: ['clientes', asesorId || 'all', q, asesorFiltro, verArchivados],
    queryFn: async () => {
      const params = {};
      if (q) params.q = q;
      const scope = asesorId || asesorFiltro;
      if (scope) params.asesorId = scope;
      if (verArchivados) params.archivados = '1';
      const { data } = await api.get('/clientes', { params });
      return data;
    },
    // Al teclear en la búsqueda se conserva la lista anterior mientras llega
    // la nueva, en vez de parpadear "Cargando…" en cada letra.
    placeholderData: keepPreviousData,
  });

  const { data: productosCatalogo } = useQuery({
    queryKey: ['productos-catalogo'],
    queryFn: async () => (await api.get('/productos-catalogo')).data,
  });

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin() && !scoped,
  });

  // Conteos del segmento (prospecto = sin póliza viva, cliente = con póliza).
  // Respetan el filtro de etapa activo (auditoría F13: con una etapa elegida
  // la cabecera decía "4" y el chip "Todos 61"): filtros cruzados, cada uno
  // cuenta sobre lo que deja el otro.
  const conteoSegmento = useMemo(() => {
    const m = { todos: 0, prospectos: 0, clientes: 0 };
    const enEtapa = (c) => (etapaActiva === '__flag' ? c.necesitaSeguimiento : !etapaActiva || c.estado === etapaActiva);
    for (const c of (clientes || []).filter(enEtapa)) {
      m.todos += 1;
      if (c.esCliente) m.clientes += 1; else m.prospectos += 1;
    }
    return m;
  }, [clientes, etapaActiva]);

  // El segmento se aplica ANTES que los chips de etapa: los conteos de etapa
  // deben reflejar lo que el usuario está viendo, no toda la cartera.
  const enSegmento = useMemo(() => {
    const r = clientes || [];
    if (segmento === 'prospectos') return r.filter((c) => !c.esCliente);
    if (segmento === 'clientes') return r.filter((c) => c.esCliente);
    return r;
  }, [clientes, segmento]);

  const conteos = useMemo(() => {
    const m = { __flag: 0 };
    for (const c of enSegmento) {
      m[c.estado] = (m[c.estado] || 0) + 1;
      if (c.necesitaSeguimiento) m.__flag += 1;
    }
    return m;
  }, [enSegmento]);

  const enEtapa = useMemo(() => {
    let r = enSegmento;
    if (etapaActiva === '__flag') r = r.filter((c) => c.necesitaSeguimiento);
    else if (etapaActiva) r = r.filter((c) => c.estado === etapaActiva);
    if (fuenteFiltro) r = r.filter((c) => infoFuente(c.fuente || '').label === fuenteFiltro);
    return r;
  }, [enSegmento, etapaActiva, fuenteFiltro]);

  // Conteo de cada filtro rápido sobre lo que dejan etapa/segmento/fuente.
  const conteoRapido = useMemo(() => Object.fromEntries(
    FILTROS_RAPIDOS.map((f) => [f.value, enEtapa.filter(f.test).length]),
  ), [enEtapa]);

  // Fuentes presentes en la cartera (para el selector; sin opciones vacías).
  const fuentesPresentes = useMemo(() => {
    const m = new Map();
    for (const c of clientes || []) {
      if (!c.fuente) continue;
      const l = infoFuente(c.fuente).label;
      m.set(l, (m.get(l) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [clientes]);

  // Filtro rápido → orden → página.
  const filas = useMemo(() => {
    const f = infoFiltroRapido(rapido);
    const r = f ? enEtapa.filter(f.test) : [...enEtapa];
    return r.sort(orden.cmp);
  }, [enEtapa, rapido, orden]);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);
  const hayFiltros = Boolean(etapaActiva || q || segmento !== 'todos' || rapido || fuenteFiltro);

  const abrirCrear = () => {
    setEditId(null); setErr('');
    setForm(FORM_VACIO); setFormAsesorId('');
    setOpen(true);
  };

  const abrirEditar = (c) => {
    setEditId(c.id); setErr('');
    setForm({
      nombre: c.nombre, apellidoP: c.apellidoP, apellidoM: c.apellidoM || '',
      email: c.email || '', telefono: c.telefono || '',
      estado: c.estado,
      notas: c.notas || '', fuente: c.fuente || '',
      productoInteres: c.productoInteres || '', productoCatalogoId: '',
      detalleInteres: c.detalleInteres || '', referidoPorId: c.referidoPorId || '',
    });
    setFormAsesorId(c.asesorId || '');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = { ...form };
      if (!payload.productoInteres) delete payload.productoInteres;
      if (!payload.referidoPorId) delete payload.referidoPorId;
      delete payload.productoCatalogoId;
      if (editId) {
        await api.patch(`/clientes/${editId}`, {
          ...payload,
          productoInteres: form.productoInteres || null,
          referidoPorId: form.referidoPorId || null,
          asesorId: !scoped && esAdmin() && formAsesorId ? formAsesorId : undefined,
        });
      } else {
        // En vista scoped los clientes nuevos se asignan al asesor consultado.
        await api.post('/clientes', {
          ...payload,
          asesorId: asesorId || formAsesorId || undefined,
        });
      }
      avisar(editId ? 'Datos guardados' : `${form.nombre.trim()} quedó registrado`);
      setOpen(false);
      setForm(FORM_VACIO);
      refetch();
      qc.invalidateQueries(['cliente', editId]);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  // DELETE hace borrado lógico en el backend: el cliente se archiva y conserva
  // sus pólizas, citas y referidos.
  const confirmarArchivar = async () => {
    if (!toArchive) return;
    setArchiving(true);
    try {
      await api.delete(`/clientes/${toArchive.id}`);
      avisar(`${toArchive.nombre} se archivó`);
      setToArchive(null);
      qc.invalidateQueries(['clientes']);
    } catch (e) {
      avisar(handleError(e), 'error');
    } finally {
      setArchiving(false);
    }
  };

  const restaurar = async (c) => {
    try {
      await api.patch(`/clientes/${c.id}`, { archivado: false });
      avisar(`${c.nombre} se restauró`);
      qc.invalidateQueries(['clientes']);
    } catch (e) {
      avisar(handleError(e), 'error');
    }
  };

  // Recordatorio desde el menú ⋯ (mismo modal que la ficha del cliente).
  const abrirRecordatorio = (c, destinatario) => {
    setRecordatorio({ cliente: c, destinatario });
  };

  // Cambio de etapa desde la lista (mismo endpoint que la ficha).
  const cambiarEtapa = async (c, estado) => {
    const pregunta = confirmacionCambioEtapa(c.estado, estado, c.nombre);
    if (pregunta && !window.confirm(pregunta)) return;
    try {
      await api.patch(`/clientes/${c.id}`, { estado });
      avisar(`${c.nombre}: ${infoEtapa(estado).label}`);
      qc.invalidateQueries(['clientes']);
      qc.invalidateQueries(['cliente', c.id]);
    } catch (e) {
      avisar(handleError(e), 'error');
    }
  };

  // Botón de llamada + menú ⋯ de cada fila (tabla y tarjetas comparten).
  const accionesFila = (c, conLlamada = false) => (
    <div className="inline-flex items-center">
      {conLlamada && !verArchivados && (
        <button
          type="button"
          onClick={() => setLlamada(c)}
          className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
          title="Registrar llamada"
          aria-label={`Registrar llamada con ${c.nombre}`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>
        </button>
      )}
      <MenuAcciones
        small
        label={`Acciones de ${c.nombre}`}
        items={verArchivados ? [
          { label: 'Ver expediente', onClick: () => navigate(`/clientes/${c.id}`) },
          'sep',
          { label: 'Restaurar cliente', onClick: () => restaurar(c) },
        ] : [
          { label: 'Registrar llamada', onClick: () => setLlamada(c) },
          { label: 'Ver expediente', onClick: () => navigate(`/clientes/${c.id}`) },
          { label: 'Editar', onClick: () => abrirEditar(c) },
          { label: 'Agendar cita', onClick: () => navigate(`/clientes/${c.id}`, { state: { abrirCita: true } }) },
          'sep',
          { label: 'Recordatorio para el asesor', onClick: () => abrirRecordatorio(c, 'ASESOR') },
          { label: 'Recordatorio para el cliente', onClick: () => abrirRecordatorio(c, 'CLIENTE') },
          'sep',
          { label: 'Archivar cliente', danger: true, onClick: () => setToArchive(c) },
        ]}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{titulo}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {filas.length !== (clientes?.length || 0) ? `${filas.length} de ${clientes?.length || 0}` : filas.length} contacto{(clientes?.length || 0) === 1 ? '' : 's'} · {subtitulo || (esAdmin() ? 'cartera del equipo' : 'tu cartera')}
            {verArchivados && ' · archivados'}
          </p>
        </div>
        <button onClick={abrirCrear} className="btn-primary">+ Nuevo cliente</button>
      </div>

      {banner}

      <div className="flex flex-wrap gap-3">
        <input className="input flex-1 min-w-[220px]" placeholder="Buscar por nombre, email, teléfono, RFC…" value={q} onChange={(e) => setQ(e.target.value)} />
        {esAdmin() && !scoped && (
          <select className="input w-auto" value={asesorFiltro} onChange={(e) => setAsesorFiltro(e.target.value)}>
            <option value="">Todos los asesores</option>
            {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
          </select>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 select-none cursor-pointer px-1">
          <input
            type="checkbox"
            className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
            checked={verArchivados}
            onChange={(e) => setVerArchivados(e.target.checked)}
          />
          Ver archivados
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
      {/* Segmento: prospectos vs. clientes. Es una lectura DERIVADA (cliente =
          tiene póliza viva), no un campo que alguien tenga que mantener a mano. */}
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
        {[
          { value: 'todos', label: 'Todos' },
          { value: 'clientes', label: 'Clientes' },
        ].map((s) => {
          const on = segmento === s.value;
          return (
            <button
              key={s.value}
              onClick={() => ponerFiltros({ segmento: s.value === 'todos' ? null : s.value, etapa: null })}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                on
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {s.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                on ? 'bg-brand-100 text-brand-700 dark:bg-brand-800/60 dark:text-brand-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                {conteoSegmento[s.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Pipeline: el filtro de etapa es un solo botón disparador + menú
          agrupado (En el embudo / Fuera del embudo / bandera de seguimiento).
          Rediseño 2026-08-25, segunda vuelta: la fila de chips de texto
          (punto + label + conteo) "no le gustó" al usuario — pidió algo
          "limpio, minimalista y profesional" tomando como referencia un menú
          desplegable con grupos. El proyecto no usa shadcn/ark-ui (JS puro,
          sin esas dependencias — convención explícita en CLAUDE.md, mismo
          precedente que el DatePicker hecho a mano), así que el menú se
          construyó con React/Tailwind ya presentes: mismo patrón de
          click-outside que `EtapaCell`/`MenuAcciones` de este archivo, sin
          instalar nada nuevo. Un solo lugar ocupado en vez de 12 botones en
          fila; el color de cada etapa sigue viviendo solo en su punto, nunca
          como fondo/borde (misma convención que el resto del sistema). */}
      <div className="relative inline-block" ref={filtroEtapaRef}>
        <button
          type="button"
          onClick={() => setFiltroEtapaAbierto((o) => !o)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/60 transition"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              etapaActiva === '__flag' ? FLAG_SEGUIMIENTO.dot : etapaActiva ? infoEtapa(etapaActiva).dot : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          {etapaActiva === '__flag' ? FLAG_SEGUIMIENTO.label : etapaActiva ? infoEtapa(etapaActiva).label : 'Todas las etapas'}
          <svg
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${filtroEtapaAbierto ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {filtroEtapaAbierto && (
          <div className="absolute left-0 top-full mt-2 z-30 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-2 text-sm">
            <button
              type="button"
              onClick={() => { setEtapaActiva(null); setFiltroEtapaAbierto(false); }}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-medium transition ${
                etapaActiva === null
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
              }`}
            >
              Todas las etapas
              <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">{enSegmento.length}</span>
            </button>

            <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-700" />
            <p className="px-3 py-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">En el embudo</p>
            {ETAPAS.map((e) => {
              const on = etapaActiva === e.value;
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => { setEtapaActiva(on ? null : e.value); setFiltroEtapaAbierto(false); }}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left font-medium transition ${
                    on
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.dot}`} />
                  <span className="flex-1">{e.label}</span>
                  <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">{conteos[e.value] || 0}</span>
                </button>
              );
            })}

            <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-700" />
            <p className="px-3 py-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Fuera del embudo</p>
            {ETAPAS_FUERA_EMBUDO.map((e) => {
              const on = etapaActiva === e.value;
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => { setEtapaActiva(on ? null : e.value); setFiltroEtapaAbierto(false); }}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left font-medium transition ${
                    on
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.dot}`} />
                  <span className="flex-1">{e.label}</span>
                  <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">{conteos[e.value] || 0}</span>
                </button>
              );
            })}

            <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-700" />
            <button
              type="button"
              onClick={() => { setEtapaActiva(etapaActiva === '__flag' ? null : '__flag'); setFiltroEtapaAbierto(false); }}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left font-medium transition ${
                etapaActiva === '__flag'
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
              }`}
            >
              <svg className={`h-3.5 w-3.5 shrink-0 ${FLAG_SEGUIMIENTO.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              <span className="flex-1">{FLAG_SEGUIMIENTO.label}</span>
              <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">{conteos.__flag}</span>
            </button>
          </div>
        )}
      </div>

        {fuentesPresentes.length > 1 && (
          <select className="input w-auto py-2" value={fuenteFiltro} onChange={(e) => ponerFiltros({ fuente: e.target.value })} aria-label="Filtrar por fuente">
            <option value="">Todas las fuentes</option>
            {fuentesPresentes.map(([l, n]) => <option key={l} value={l}>{l} ({n})</option>)}
          </select>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Ordenar por
          <select className="input w-auto py-2" value={orden.value} onChange={(e) => ponerFiltros({ orden: e.target.value === 'accion' ? null : e.target.value })}>
            {ORDENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* Filtros rápidos (2026-10-15, auditoría): lo que el asesor busca a
          diario — vencidos, para hoy, sin próxima acción, nunca llamados,
          nuevos. Un clic, se combinan con etapa/segmento/fuente. */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS_RAPIDOS.map((fr) => {
          const on = rapido === fr.value;
          const n = conteoRapido[fr.value] || 0;
          const urgente = fr.tono === 'red' && n > 0 && !on;
          return (
            <button
              key={fr.value}
              type="button"
              onClick={() => ponerFiltros({ rapido: on ? null : fr.value })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                on
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200'
                  : urgente
                    ? 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-500/10'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50'
              }`}
            >
              {fr.label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <Card>
        {isLoading ? (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : filas.length === 0 ? (
          <EmptyState
            message={hayFiltros ? 'Nadie coincide con estos filtros.' : verArchivados ? 'No hay contactos archivados.' : 'Aún no tienes contactos.'}
            accion={hayFiltros
              ? { label: 'Quitar filtros', onClick: () => ponerFiltros({ etapa: null, q: null, segmento: null, rapido: null, fuente: null }) }
              : verArchivados ? null : { label: '+ Nuevo cliente', onClick: abrirCrear }}
          />
        ) : (
          <>
            {/* Celular: tarjetas con lo que se usa en campo — nombre, etapa,
                próxima acción y los botones de contacto. */}
            <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-700/60 md:hidden">
              {visibles.map((c) => {
                const wa = ligaWhatsApp(c.telefono);
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/clientes/${c.id}`} className="font-semibold text-slate-800 dark:text-slate-100">
                          {c.nombre} {c.apellidoP} {c.apellidoM || ''}
                        </Link>
                        {c.leadSinVer && <span className="badge ml-2 align-middle bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">Nuevo</span>}
                        <div className="mt-1"><EtapaCell cliente={c} onCambiarEtapa={cambiarEtapa} /></div>
                      </div>
                      {accionesFila(c)}
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <ProximaAccion pa={c.proximaAccion} />
                      <p className="shrink-0 text-xs text-slate-400 dark:text-slate-500">Llamada: {haceCuanto(c.fechaUltimaLlamada)}</p>
                    </div>
                    {!verArchivados && (
                      <div className="mt-2 flex gap-2">
                        {c.telefono && <a href={`tel:${c.telefono}`} className="btn-secondary justify-center px-3 py-1.5 text-xs">Llamar</a>}
                        {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary justify-center px-3 py-1.5 text-xs">WhatsApp</a>}
                        <button type="button" onClick={() => setLlamada(c)} className="flex-1 whitespace-nowrap rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">Registrar llamada</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Escritorio: nombre ancho con teléfono debajo, etapa como chip y
                la próxima acción como columna protagonista. Citas/Ventas
                salieron de la tabla (viven en la ficha) — auditoría 2026-10. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="py-2 pr-4">Contacto</th>
                    {esAdmin() && !scoped && <th className="py-2 pr-4">Asesor</th>}
                    <th className="py-2 pr-4">Etapa</th>
                    <th className="py-2 pr-4">Próxima acción</th>
                    <th className="py-2 pr-4">Última llamada</th>
                    <th className="py-2 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                      <td className="py-2.5 pr-4 min-w-[220px]">
                        <Link to={`/clientes/${c.id}`} className="font-semibold text-slate-800 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400">
                          {c.nombre} {c.apellidoP} {c.apellidoM || ''}
                        </Link>
                        {/* Lead de landing que el dueño aún no abre (se apaga al abrir la ficha). */}
                        {c.leadSinVer && (
                          <span className="badge ml-2 align-middle bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">Nuevo</span>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {c.telefono || c.email || 'Sin datos de contacto'}
                          {c.fuente && <span className="text-slate-400 dark:text-slate-500"> · {infoFuente(c.fuente).label}</span>}
                        </p>
                      </td>
                      {esAdmin() && !scoped && (
                        <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="avatar !h-7 !w-7 text-[11px]">{`${c.asesor?.nombre?.[0] || ''}${c.asesor?.apellidoP?.[0] || ''}`}</span>
                            {c.asesor?.nombre} {c.asesor?.apellidoP}
                          </div>
                        </td>
                      )}
                      <td className="py-2.5 pr-4"><EtapaCell cliente={c} onCambiarEtapa={cambiarEtapa} /></td>
                      <td className="py-2.5 pr-4"><ProximaAccion pa={c.proximaAccion} /></td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{haceCuanto(c.fechaUltimaLlamada)}</td>
                      <td className="py-2.5 text-right whitespace-nowrap">{accionesFila(c, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <span className="tabular-nums">
                  {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, filas.length)} de {filas.length}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={paginaActual <= 1} onClick={() => ponerFiltros({ pagina: paginaActual - 1 > 1 ? String(paginaActual - 1) : null })} className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Anterior</button>
                  <span className="px-2 tabular-nums">{paginaActual} / {totalPaginas}</span>
                  <button type="button" disabled={paginaActual >= totalPaginas} onClick={() => ponerFiltros({ pagina: String(paginaActual + 1) })} className="btn-secondary px-3 py-1 text-xs disabled:opacity-40">Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar cliente' : 'Nuevo registro'}>
        <form onSubmit={submit} className="space-y-3">
          {/* Selector de tipo de registro (solo alta): un candidato a asesor
              NO es un cliente — su expediente vive en el módulo de Candidatos. */}
          {!editId && (
            <Field label="¿Qué vas a registrar?">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="rounded-lg border border-brand-500 bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                  Cliente
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setOpenCandidato(true); }}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-200 transition"
                >
                  Candidato a asesor
                </button>
              </div>
            </Field>
          )}
          {esAdmin() && !scoped && asesores?.length > 0 && (
            <Field label="Asesor asignado">
              <select className="input" value={formAsesorId} onChange={(e) => setFormAsesorId(e.target.value)}>
                <option value="">Sin especificar</option>
                {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre*"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Apellido paterno"><input className="input" value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
            <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" type="tel" inputMode="tel" placeholder="444 123 4567" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Etapa del pipeline">
              <select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {ETAPAS_SELECCIONABLES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                {!ETAPAS_SELECCIONABLES.some((e) => e.value === form.estado) && <option value={form.estado}>{infoEtapa(form.estado).label}</option>}
              </select>
            </Field>
            <Field label="Fuente">
              <select className="input" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })}>
                <option value="">Sin especificar</option>
                {opcionesFuente(form.fuente).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
          </div>
          {/* "Cliente frío": teléfono y correo son opcionales a propósito — un
              prospecto sin datos de contacto se da de alta igual (antes se
              inventaba un correo falso para poder guardarlo). La bandera de
              seguimiento ya no se pide aquí: vive en el menú ⋯ de la ficha. */}
          {!editId && !form.telefono && !form.email && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
              Sin teléfono ni correo se registra como <strong>cliente frío</strong>. Podrás
              agregar sus datos después desde su ficha.
            </p>
          )}

          {/* La clínica telefónica se llena sola: un prospecto sin llamada
              registrada entra al evaluador de la semana, y vuelve a entrar si
              se queda atorado en PROSPECTO. Aquí solo se avisa, no se pregunta. */}
          {!editId && form.estado === 'PROSPECTO' && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
              Entrará a tu <strong>clínica telefónica</strong> hasta que le llames y avance a cita
              (o lo descartes).
            </p>
          )}

          {/* Producto de interés — catálogo de productos NYL */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mt-1">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Producto de interés (Seguros Monterrey NYL)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ramo">
                <select
                  className="input"
                  value={form.productoInteres || ''}
                  onChange={(e) => setForm({ ...form, productoInteres: e.target.value, productoCatalogoId: '' })}
                >
                  <option value="">Sin seleccionar</option>
                  {Object.entries(RAMOS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Producto específico">
                <select
                  className="input"
                  value={form.productoCatalogoId || ''}
                  onChange={(e) => {
                    const prod = productosCatalogo?.find((p) => p.id === e.target.value);
                    setForm({ ...form, productoCatalogoId: e.target.value, detalleInteres: prod ? `${prod.nombre} (${RAMOS_LABEL[prod.ramo]})` : form.detalleInteres });
                  }}
                  disabled={!form.productoInteres}
                >
                  <option value="">{form.productoInteres ? '— elegir producto —' : 'Primero elige ramo'}</option>
                  {productosCatalogo?.filter((p) => p.ramo === form.productoInteres).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.comisionPct ? ` · comisión ${p.comisionPct}%` : ''}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Detalle de interés">
              <textarea className="input" rows={2} value={form.detalleInteres || ''} onChange={(e) => setForm({ ...form, detalleInteres: e.target.value })} placeholder="Ej: Busca protección familiar, prima mensual estimada $1,500" />
            </Field>
          </div>

          {/* Referidos */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mt-1">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Referido por</p>
            <Field label="¿Quién lo refirió? (opcional)">
              <select className="input" value={form.referidoPorId || ''} onChange={(e) => setForm({ ...form, referidoPorId: e.target.value })}>
                <option value="">Ninguno / captación directa</option>
                {clientes?.filter((c) => c.id !== editId).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} {c.apellidoP} {c.apellidoM || ''}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notas"><textarea className="input" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <CandidatoFormModal
        open={openCandidato}
        onClose={() => setOpenCandidato(false)}
        onSaved={(creado) => {
          // El promotor va directo al expediente nuevo; el asesor (sin acceso
          // al módulo) solo captura y recibe la confirmación del cierre.
          if (creado && esAdmin()) navigate(`/candidatos/${creado.id}`);
        }}
      />

      <RegistrarLlamadaModal
        open={!!llamada}
        onClose={() => setLlamada(null)}
        cliente={llamada}
        onCita={() => navigate(`/clientes/${llamada.id}`, { state: { abrirCita: true } })}
      />

      {/* Recordatorio desde el menú ⋯ (mismo modal que usa la ficha) */}
      <NotaFormModal
        open={!!recordatorio}
        onClose={() => setRecordatorio(null)}
        clienteId={recordatorio?.cliente?.id}
        tipo="RECORDATORIO"
        destinatario={recordatorio?.destinatario || 'ASESOR'}
        nombreCliente={recordatorio ? `${recordatorio.cliente.nombre} ${recordatorio.cliente.apellidoP}` : null}
      />

      <Modal open={!!toArchive} onClose={() => setToArchive(null)} title="Archivar cliente">
        {toArchive && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Archivar a <strong>{toArchive.nombre} {toArchive.apellidoP}</strong>? Dejará de aparecer
              en tus listas, pero <strong>sus pólizas, citas y referidos se conservan</strong> y podrás
              restaurarlo cuando quieras con «Ver archivados».
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setToArchive(null)} className="btn-secondary">Cancelar</button>
              <button
                type="button"
                onClick={confirmarArchivar}
                disabled={archiving}
                className="btn-danger"
              >
                {archiving ? 'Archivando…' : 'Archivar cliente'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
