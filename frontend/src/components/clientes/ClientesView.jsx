import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, handleError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Modal, Field, EmptyState, MenuAcciones } from '../ui.jsx';
import CandidatoFormModal from '../candidatos/CandidatoFormModal.jsx';
import NotaFormModal from '../notas/NotaFormModal.jsx';
import { ETAPAS, ETAPAS_SELECCIONABLES, infoEtapa, FLAG_SEGUIMIENTO } from './etapas.js';
import { infoFuente, opcionesFuente } from './fuentes.js';
import { RAMOS_LABEL, fechaCorta, hora } from '../../lib/format.js';

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

const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Próxima acción (derivada en el backend de citas pendientes y recordatorios
// abiertos): fecha + tipo, en rojo lo vencido.
function ProximaAccion({ pa }) {
  if (!pa) return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  const fecha = new Date(pa.fecha);
  const ahora = new Date();
  const vencida = fecha < ahora;
  const esHoy = mismoDia(fecha, ahora);
  const d = vencida
    ? (esHoy ? `Hoy · ${hora(fecha)}` : `Vencida · ${fechaCorta(fecha)}`)
    : (esHoy ? `Hoy · ${hora(fecha)}` : fechaCorta(fecha));
  return (
    <div className="text-sm">
      <p className={`font-medium tabular-nums ${vencida ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{d}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[180px] truncate" title={pa.titulo}>
        {pa.tipo === 'CITA' ? 'Cita' : 'Recordatorio'} · {pa.titulo}
      </p>
    </div>
  );
}

// Celda de etapa: pill de la etapa + bandera de seguimiento + mini indicador
// de posición en el embudo (segmentos, color por progreso).
// La pill es un botón: abre un popover para cambiar la etapa sin entrar al
// expediente (mismo PATCH que usa la ficha). Patrón de click-outside clonado
// de MenuAcciones — su contrato es de acciones, no de selección de valor.
function EtapaCell({ cliente, onCambiarEtapa }) {
  const e = infoEtapa(cliente.estado);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const cerrar = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false); };
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [open]);
  return (
    <div className="space-y-1.5">
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
          {open && (
            <div className="absolute left-0 top-full mt-1 z-30 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-1.5">
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
            </div>
          )}
        </div>
        {cliente.necesitaSeguimiento && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${FLAG_SEGUIMIENTO.text}`}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
            Seguimiento
          </span>
        )}
      </div>
      {/* Indicador de posición en el embudo. Una etapa terminal (Descartado)
          no tiene posición: en vez de pintar la barra vacía se dice por qué. */}
      {e.terminal ? (
        <p className={`text-[11px] font-medium ${e.text}`}>Fuera del embudo</p>
      ) : (
        <div className="flex gap-[3px]">
          {ETAPAS.map((et, i) => (
            <span key={et.value} className={`h-1 w-4 rounded-full ${i <= e.orden ? e.dot : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientesView({ asesorId = null, titulo = 'Clientes', subtitulo = null, banner = null }) {
  const { esAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scoped = !!asesorId; // cartera de un asesor concreto (vista de promotor)
  const [q, setQ] = useState('');
  const [asesorFiltro, setAsesorFiltro] = useState('');
  const [etapaActiva, setEtapaActiva] = useState(null); // valor de etapa o '__flag'
  const [verArchivados, setVerArchivados] = useState(false);
  // Segmento: 'todos' | 'prospectos' | 'clientes'. Se DERIVA del flag esCliente
  // que calcula el servidor (tiene póliza viva), no de un campo capturado.
  const [segmento, setSegmento] = useState('todos');

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

  // Captura de candidato a asesor (reclutamiento): mismo botón de alta, el
  // selector "Cliente | Candidato" del modal rutea al formulario correcto.
  const [openCandidato, setOpenCandidato] = useState(false);

  // q y asesor se filtran en el servidor; los chips de etapa filtran en
  // cliente para poder mostrar el conteo de todas las etapas a la vez.
  const { data: clientes, refetch, isFetching } = useQuery({
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
  const conteoSegmento = useMemo(() => {
    const m = { todos: 0, prospectos: 0, clientes: 0 };
    for (const c of clientes || []) {
      m.todos += 1;
      if (c.esCliente) m.clientes += 1; else m.prospectos += 1;
    }
    return m;
  }, [clientes]);

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

  const filas = useMemo(() => {
    let r = enSegmento;
    if (etapaActiva === '__flag') r = r.filter((c) => c.necesitaSeguimiento);
    else if (etapaActiva) r = r.filter((c) => c.estado === etapaActiva);
    return r;
  }, [enSegmento, etapaActiva]);

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
      setToArchive(null);
      qc.invalidateQueries(['clientes']);
    } catch (e) {
      alert(handleError(e));
    } finally {
      setArchiving(false);
    }
  };

  const restaurar = async (c) => {
    try {
      await api.patch(`/clientes/${c.id}`, { archivado: false });
      qc.invalidateQueries(['clientes']);
    } catch (e) {
      alert(handleError(e));
    }
  };

  // Recordatorio desde el menú ⋯ (mismo modal que la ficha del cliente).
  const abrirRecordatorio = (c, destinatario) => {
    setRecordatorio({ cliente: c, destinatario });
  };

  // Cambio de etapa desde la lista (mismo endpoint que la ficha).
  const cambiarEtapa = async (c, estado) => {
    try {
      await api.patch(`/clientes/${c.id}`, { estado });
      qc.invalidateQueries(['clientes']);
      qc.invalidateQueries(['cliente', c.id]);
    } catch (e) {
      alert(handleError(e));
    }
  };

  const chipBase = 'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition bg-white dark:bg-slate-800';
  const chipOff = 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{titulo}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {filas.length} cliente{filas.length === 1 ? '' : 's'} · {subtitulo || (esAdmin() ? 'cartera del equipo' : 'tu cartera')}
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

      {/* Segmento: prospectos vs. clientes. Es una lectura DERIVADA (cliente =
          tiene póliza viva), no un campo que alguien tenga que mantener a mano. */}
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
        {[
          { value: 'todos', label: 'Todos' },
          { value: 'prospectos', label: 'Prospectos' },
          { value: 'clientes', label: 'Clientes' },
        ].map((s) => {
          const on = segmento === s.value;
          return (
            <button
              key={s.value}
              onClick={() => { setSegmento(s.value); setEtapaActiva(null); }}
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

      {/* Pipeline: los chips de etapa son el filtro (clic = filtra, con conteo).
          "Necesita seguimiento" es bandera aparte, no etapa. */}
      <div className="flex flex-wrap gap-2">
        {ETAPAS_SELECCIONABLES.map((e) => {
          const on = etapaActiva === e.value;
          return (
            <button
              key={e.value}
              onClick={() => setEtapaActiva(on ? null : e.value)}
              className={`${chipBase} ${on ? `border-transparent ring-[1.5px] ring-inset ${e.chipOn} text-slate-800 dark:text-slate-100` : chipOff}`}
            >
              <span className={`h-2 w-2 rounded-full ${e.dot}`} />
              {e.label}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${on ? e.badgeOn : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {conteos[e.value] || 0}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setEtapaActiva(etapaActiva === '__flag' ? null : '__flag')}
          className={`${chipBase} ${etapaActiva === '__flag' ? `border-transparent ring-[1.5px] ring-inset ${FLAG_SEGUIMIENTO.chipOn} text-slate-800 dark:text-slate-100` : chipOff}`}
        >
          <svg className={`w-3.5 h-3.5 ${FLAG_SEGUIMIENTO.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          {FLAG_SEGUIMIENTO.label}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${etapaActiva === '__flag' ? FLAG_SEGUIMIENTO.badgeOn : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
            {conteos.__flag}
          </span>
        </button>
      </div>

      <Card>
        {isFetching ? (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>
        ) : filas.length === 0 ? (
          <EmptyState message={etapaActiva ? 'No hay clientes con este filtro' : 'No hay clientes que mostrar'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Contacto</th>
                  {esAdmin() && !scoped && <th className="py-2 pr-4">Asesor</th>}
                  <th className="py-2 pr-4">Etapa</th>
                  <th className="py-2 pr-4">Próxima acción</th>
                  <th className="py-2 pr-4 text-center">Citas</th>
                  <th className="py-2 pr-4 text-center">Ventas</th>
                  <th className="py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                    <td className="py-2.5 pr-4">
                      <Link to={`/clientes/${c.id}`} className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                        {c.nombre} {c.apellidoP} {c.apellidoM || ''}
                      </Link>
                      {c.fuente && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Fuente: {infoFuente(c.fuente).label}</p>}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                      {c.telefono && <p className="tabular-nums">{c.telefono}</p>}
                      {c.email && <p className="text-xs text-slate-400 dark:text-slate-500">{c.email}</p>}
                      {!c.telefono && !c.email && '—'}
                    </td>
                    {esAdmin() && !scoped && (
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="avatar !h-7 !w-7 text-[11px]">{`${c.asesor?.nombre?.[0] || ''}${c.asesor?.apellidoP?.[0] || ''}`}</span>
                          {c.asesor?.nombre} {c.asesor?.apellidoP}
                        </div>
                      </td>
                    )}
                    <td className="py-2.5 pr-4"><EtapaCell cliente={c} onCambiarEtapa={cambiarEtapa} /></td>
                    <td className="py-2.5 pr-4"><ProximaAccion pa={c.proximaAccion} /></td>
                    <td className="py-2.5 pr-4 text-center tabular-nums text-slate-600 dark:text-slate-300">{c._count?.citas || 0}</td>
                    <td className="py-2.5 pr-4 text-center tabular-nums text-slate-600 dark:text-slate-300">{c._count?.ventas || 0}</td>
                    <td className="py-2.5 text-right">
                      <MenuAcciones
                        small
                        label={`Acciones de ${c.nombre}`}
                        items={verArchivados ? [
                          { label: 'Ver expediente', onClick: () => navigate(`/clientes/${c.id}`) },
                          'sep',
                          { label: 'Restaurar cliente', onClick: () => restaurar(c) },
                        ] : [
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            <Field label="Apellido paterno*"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
            <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
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
