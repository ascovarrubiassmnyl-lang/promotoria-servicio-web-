import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Modal, Field, CitaBadge, VentaBadge, EmptyState, MenuAcciones, DatePicker } from '../components/ui.jsx';
import PolizaFormModal from '../components/polizas/PolizaFormModal.jsx';
import CitaFormModal from '../components/citas/CitaFormModal.jsx';
import NotaFormModal from '../components/notas/NotaFormModal.jsx';
import VisorDocumento, { useVisorDocumento } from '../components/documentos/VisorDocumento.jsx';
import ActivityTimeline from '../components/actividad/ActivityTimeline.jsx';
import { ETAPAS, infoEtapa, siguienteEtapa } from '../components/clientes/etapas.js';
import { infoFuente, opcionesFuente } from '../components/clientes/fuentes.js';
import { infoCanal, CITA_VIVA } from '../components/citas/tipos.js';
import {
  mxn, fechaHora, fechaCorta, edad, tamanoLegible,
  RAMOS, RAMOS_LABEL,
  FORMAS_PAGO, esVentaGanada, esVentaPipeline,
} from '../lib/format.js';

// Subestado derivado: una póliza está "activa" en función de su estado — no es
// un campo independiente (por eso se muestra como subestado, no como columna).
const POLIZA_ACTIVA = new Set(['PAGADA', 'FIRMADA', 'APROBADA']);

const iniciales = (c) => `${c.nombre?.[0] || ''}${c.apellidoP?.[0] || ''}`.toUpperCase();

// Stepper del embudo: posición sobre el enum ordenado de etapas, pintado con
// el color de la etapa actual (el color encodea progreso — mapa único en
// components/clientes/etapas.js).
function PipelineStepper({ estado }) {
  const actual = infoEtapa(estado);
  const idx = actual.orden;
  const ultimo = ETAPAS.length - 1;
  return (
    <div className="card px-6 py-5 overflow-x-auto">
      <div className="flex min-w-[620px]">
        {ETAPAS.map((e, i) => {
          const done = idx >= 0 && i < idx;
          const current = i === idx;
          return (
            <div key={e.value} className="relative flex-1 pt-6 text-center">
              <div className={`absolute top-[6px] h-0.5 ${i === 0 ? 'left-1/2' : 'left-0'} ${i === ultimo ? 'right-1/2' : 'right-0'} ${done || current ? actual.dot : 'bg-slate-200 dark:bg-slate-700'}`} />
              <span className={`absolute top-0 left-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 ${done || current
                ? `${actual.border} ${actual.dot}`
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'} ${current ? `ring-4 ${actual.halo}` : ''}`} />
              <p className={`text-xs px-1 ${current
                ? 'font-semibold text-slate-800 dark:text-slate-100'
                : done ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {e.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Lista de recordatorios compartida por los dos bloques segmentados (asesor /
// cliente): mismo layout, distinta fuente. Los de pago los genera el sistema
// desde la póliza y no se borran a mano — solo se marcan pagados desde ahí.
function ListaRecordatorios({ items, onEliminar, vacio }) {
  if (!items.length) return <p className="text-sm text-slate-400 dark:text-slate-500 py-1">{vacio}</p>;
  const ahora = new Date();
  return (
    <ul className="space-y-2 text-sm">
      {items.map((n) => {
        const vencido = n.fechaAviso && !n.completada && new Date(n.fechaAviso) < ahora;
        const automatico = n.tipo === 'RECORDATORIO_PAGO';
        return (
          <li key={n.id} className="group flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className={`text-slate-700 dark:text-slate-300 ${n.completada ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>{n.texto}</p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                {n.fechaAviso && (
                  <span className={`text-xs ${vencido ? 'text-red-600 dark:text-red-400 font-medium' : 'text-amber-600 dark:text-amber-400'}`}>
                    {n.completada ? 'Completado' : vencido ? 'Vencido' : 'Avisar'}: {fechaHora(n.fechaAviso)}
                  </span>
                )}
                {automatico && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Generado por la póliza</span>
                )}
              </div>
            </div>
            {!automatico && (
              <button
                onClick={() => onEliminar(n.id)}
                className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity shrink-0"
                title="Eliminar recordatorio"
              >Eliminar</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, esAdmin } = useAuth();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Archivar (borrado lógico) del cliente
  const [archivarOpen, setArchivarOpen] = useState(false);
  const [archivando, setArchivando] = useState(false);

  // Nota / recordatorio
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaForm, setNotaForm] = useState({ tipo: 'RECORDATORIO', destinatario: 'ASESOR' });

  // Cita: modal compartido del módulo de Citas (clienteId fija el cliente)
  const [citaOpen, setCitaOpen] = useState(false);

  // Producto de interés
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoForm, setProductoForm] = useState(null);
  const [productoSaving, setProductoSaving] = useState(false);

  // Pólizas: modal compartido de Pólizas (crear/editar) + acciones destructivas
  const [polizaModal, setPolizaModal] = useState({ open: false, venta: null });
  const [cancelarPoliza, setCancelarPoliza] = useState(null);
  const [cancelandoPoliza, setCancelandoPoliza] = useState(false);
  const [delPolizaId, setDelPolizaId] = useState(null);
  const [delPolizaBusy, setDelPolizaBusy] = useState(false);

  // Archivos
  const archivoInputRef = useRef(null);
  const [docSubiendo, setDocSubiendo] = useState(false);
  const [docErr, setDocErr] = useState('');
  const [delDocId, setDelDocId] = useState(null);
  // Visor de archivos: se previsualiza en un modal; la descarga es secundaria.
  const { visor, verArchivo, cerrarVisor, descargarArchivo } = useVisorDocumento();

  const [delNotaId, setDelNotaId] = useState(null);

  const location = useLocation();

  const { data: c, isLoading } = useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => (await api.get(`/clientes/${id}`)).data,
  });

  // Actividad reciente del cliente (mismo timeline del módulo de Actividad)
  const { data: actividadCliente, isLoading: actividadLoading } = useQuery({
    queryKey: ['actividad-cliente', id],
    queryFn: async () => (await api.get('/actividad', { params: { clienteId: id, limit: 20 } })).data,
  });

  // "Agendar cita" desde el menú de la lista de clientes abre el modal directo
  useEffect(() => {
    if (location.state?.abrirCita) {
      setCitaOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => {
    const ventas = c?.ventas || [];
    const vigentes = ventas.filter((v) => !['CANCELADA', 'RECHAZADA'].includes(v.estado));
    return {
      polizas: ventas.length,
      primaTotal: vigentes.reduce((s, v) => s + (v.primaAnual || 0), 0),
      comisionGanada: ventas.filter(esVentaGanada).reduce((s, v) => s + (v.comisionMonto || 0), 0),
      comisionPipeline: ventas.filter(esVentaPipeline).reduce((s, v) => s + (v.comisionMonto || 0), 0),
    };
  }, [c]);

  if (isLoading) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>;
  if (!c) return <EmptyState message="Cliente no encontrado" />;

  const startEdit = () => setForm({
    nombre: c.nombre, apellidoP: c.apellidoP, apellidoM: c.apellidoM || '',
    email: c.email || '', telefono: c.telefono || '', estado: c.estado,
    fuente: c.fuente || '', direccion: c.direccion || '', rfc: c.rfc || '',
    curp: c.curp || '', fechaNacimiento: c.fechaNacimiento ? c.fechaNacimiento.slice(0, 10) : '',
  });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await api.patch(`/clientes/${id}`, form);
      setEditing(false);
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const cambiarEstado = async (estado) => {
    try {
      await api.patch(`/clientes/${id}`, { estado });
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Archivar (DELETE hace borrado lógico en el backend) y restaurar
  const confirmarArchivar = async () => {
    setArchivando(true);
    try {
      await api.delete(`/clientes/${id}`);
      qc.invalidateQueries(['clientes']);
      navigate('/clientes');
    } catch (e2) { alert(handleError(e2)); } finally { setArchivando(false); }
  };

  const restaurarCliente = async () => {
    try {
      await api.patch(`/clientes/${id}`, { archivado: false });
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Notas y recordatorios (el formulario vive en NotaFormModal, compartido con
  // el menú ⋯ de la lista de clientes).
  const abrirNota = (tipo, destinatario = 'ASESOR') => {
    setNotaForm({ tipo, destinatario });
    setNotaOpen(true);
  };

  const eliminarNota = async () => {
    try {
      await api.delete(`/notas/${delNotaId}`);
      setDelNotaId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Citas: el alta usa CitaFormModal; la baja normal es "Cancelar" (conserva
  // el registro). El borrado real vive en el calendario, con confirmación.
  const abrirCita = () => setCitaOpen(true);

  const cancelarCita = async (citaId) => {
    try {
      await api.patch(`/citas/${citaId}`, { estado: 'CANCELADA' });
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['citas-cal']);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Producto de interés
  const abrirProducto = () => {
    setProductoForm({ productoInteres: c.productoInteres || '' });
    setProductoOpen(true);
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    setProductoSaving(true);
    try {
      await api.patch(`/clientes/${id}`, {
        productoInteres: productoForm.productoInteres || null,
      });
      setProductoOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setProductoSaving(false); }
  };

  // Pólizas: cancelar (soft) y eliminar definitivo, siempre desde menú + confirmación
  const confirmarCancelarPoliza = async () => {
    setCancelandoPoliza(true);
    try {
      await api.patch(`/ventas/${cancelarPoliza.id}`, { estado: 'CANCELADA' });
      setCancelarPoliza(null);
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['ventas']);
    } catch (e2) { alert(handleError(e2)); } finally { setCancelandoPoliza(false); }
  };

  const eliminarPoliza = async () => {
    setDelPolizaBusy(true);
    try {
      await api.delete(`/ventas/${delPolizaId}`);
      setDelPolizaId(null);
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['ventas']);
    } catch (e2) { alert(handleError(e2)); } finally { setDelPolizaBusy(false); }
  };

  // Archivos
  const subirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setDocSubiendo(true); setDocErr('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('clienteId', id);
      await api.post('/documentos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { setDocErr(handleError(e2)); } finally { setDocSubiendo(false); }
  };

  const eliminarArchivo = async () => {
    try {
      await api.delete(`/documentos/${delDocId}`);
      setDelDocId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Recordatorios segmentados: los del asesor (su propia gestión: llamadas,
  // seguimientos) y los que tocan al cliente (pagos, renovaciones). Los de
  // pago los genera el sistema desde la póliza, por eso entran aquí también.
  const recordatoriosTodos = c.notasItems?.filter((n) => n.tipo === 'RECORDATORIO' || n.tipo === 'RECORDATORIO_PAGO') || [];
  const recordatoriosAsesor = recordatoriosTodos.filter((n) => n.destinatario !== 'CLIENTE');
  const recordatoriosCliente = recordatoriosTodos.filter((n) => n.destinatario === 'CLIENTE');
  const fichaAjena = esAdmin() && c.asesorId !== user?.id;
  const proxima = siguienteEtapa(c.estado);

  const toggleSeguimiento = async () => {
    try {
      await api.patch(`/clientes/${id}`, { necesitaSeguimiento: !c.necesitaSeguimiento });
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { alert(handleError(e2)); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <Link to="/clientes" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Volver a clientes</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div className="flex items-center gap-4">
            <div className="avatar !h-14 !w-14 text-xl">{iniciales(c)}</div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{c.nombre} {c.apellidoP} {c.apellidoM || ''}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Asesor: <span className="font-medium text-slate-700 dark:text-slate-300">{c.asesor?.nombre} {c.asesor?.apellidoP}</span>
                {' · '}Creado {fechaCorta(c.creadoEn)}
                {c.fuente && <> · Fuente {c.fuente}</>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 pl-0.5">Etapa del pipeline</label>
              <select
                className="input w-auto font-semibold"
                value={c.estado}
                onChange={(e) => cambiarEstado(e.target.value)}
              >
                {ETAPAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                {infoEtapa(c.estado).orden === -1 && <option value={c.estado}>{infoEtapa(c.estado).label}</option>}
              </select>
            </div>
            {proxima && (
              <button onClick={() => cambiarEstado(proxima.value)} className="btn-primary" title={`Pasar a ${proxima.label}`}>
                Avanzar etapa →
              </button>
            )}
            <MenuAcciones
              label="Más acciones del cliente"
              items={c.archivadoEn ? [
                { label: 'Restaurar cliente', onClick: restaurarCliente },
              ] : [
                { label: 'Agregar datos del cliente', onClick: () => { startEdit(); setEditing(true); } },
                { label: c.necesitaSeguimiento ? 'Quitar marca de seguimiento' : 'Marcar «necesita seguimiento»', onClick: toggleSeguimiento },
                'sep',
                { label: 'Archivar cliente', danger: true, onClick: () => setArchivarOpen(true) },
              ]}
            />
          </div>
        </div>
      </div>

      {fichaAjena && (
        <div className="scope-banner">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          <span>Estás viendo la ficha de un cliente de <strong>{c.asesor?.nombre} {c.asesor?.apellidoP}</strong> como promotor.</span>
        </div>
      )}

      {c.archivadoEn && (
        <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm border border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
          <span>Cliente <strong>archivado</strong> el {fechaCorta(c.archivadoEn)}. Sus pólizas, citas y referidos se conservan.</span>
          <button onClick={restaurarCliente} className="ml-auto font-semibold text-brand-600 dark:text-brand-400 hover:underline shrink-0">Restaurar</button>
        </div>
      )}

      {c.necesitaSeguimiento && (
        <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/25 dark:text-amber-300 font-medium">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          <span>Este cliente está marcado como <strong>necesita seguimiento</strong> (independiente de su etapa).</span>
          <button onClick={toggleSeguimiento} className="ml-auto font-semibold hover:underline shrink-0">Quitar marca</button>
        </div>
      )}

      <PipelineStepper estado={c.estado} />

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Riel izquierdo: contacto + resumen + referidos */}
        <div className="space-y-4">
          <Card
            title="Contacto"
            actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => { startEdit(); setEditing(true); }}>Agregar datos</button>}
          >
            <div className="space-y-3">
              <div><p className="kv-k">Teléfono</p><p className="kv-v tabular-nums">{c.telefono || <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div><p className="kv-k">Email</p><p className="kv-v break-all">{c.email || <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div><p className="kv-k">RFC</p><p className="kv-v">{c.rfc || <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div><p className="kv-k">CURP</p><p className="kv-v">{c.curp || <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div><p className="kv-k">Fecha de nacimiento</p><p className="kv-v">{c.fechaNacimiento ? `${fechaCorta(c.fechaNacimiento)} · ${edad(c.fechaNacimiento)} años` : <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div><p className="kv-k">Dirección</p><p className="kv-v">{c.direccion || <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div><p className="kv-k">Fuente</p><p className="kv-v">{infoFuente(c.fuente).label || <span className="text-slate-400 dark:text-slate-500 font-normal">Sin registrar</span>}</p></div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <p className="kv-k !mb-0">Producto de interés</p>
                  <button onClick={abrirProducto} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">{c.productoInteres ? 'Editar' : '+ Registrar'}</button>
                </div>
                {c.productoInteres
                  ? <p className="kv-v mt-1">{RAMOS_LABEL[c.productoInteres]}</p>
                  : <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Sin registrar</p>}
              </div>
            </div>
          </Card>

          <Card title="Resumen">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{resumen.polizas}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Póliza{resumen.polizas === 1 ? '' : 's'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{mxn(resumen.primaTotal)}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Prima anual</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <p className="text-lg font-bold money-earned">{mxn(resumen.comisionGanada)}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Comisión ganada</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                <p className="text-lg font-bold money-pending">{mxn(resumen.comisionPipeline)}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">En pipeline</p>
              </div>
            </div>
          </Card>

          <ReferidosCard clienteId={c.id} referidoPor={c.referidoPor} />
        </div>

        {/* Columna principal: pólizas, citas, notas/recordatorios, archivos */}
        <div className="space-y-4">
          <Card
            title={`Pólizas${c.ventas?.length ? ` · ${c.ventas.length}` : ''}`}
            actions={<button onClick={() => setPolizaModal({ open: true, venta: null })} className="btn-primary text-xs py-1 px-2">+ Crear póliza</button>}
          >
            {c.ventas?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-2 pr-4">Producto</th>
                      <th className="py-2 pr-4 text-right">Prima anual</th>
                      <th className="py-2 pr-4 text-right">Comisión</th>
                      <th className="py-2 pr-4">Forma de pago</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {c.ventas.map((v) => {
                      const activa = POLIZA_ACTIVA.has(v.estado);
                      const anulada = ['CANCELADA', 'RECHAZADA'].includes(v.estado);
                      return (
                        <tr key={v.id} className="border-b border-slate-50 dark:border-slate-700/50">
                          <td className="py-2.5 pr-4">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{v.productoCatalogo?.nombre || v.producto || '—'}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{RAMOS_LABEL[v.ramo] || v.ramo}</p>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{mxn(v.primaAnual)}</td>
                          <td className="py-2.5 pr-4 text-right">
                            {/* Verde SOLO si la comisión está ganada (PAGADA/APROBADA) */}
                            <p className={esVentaGanada(v) ? 'money-earned' : anulada ? 'font-semibold tabular-nums text-slate-400 dark:text-slate-500 line-through' : 'money-pending'}>{mxn(v.comisionMonto)}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{v.comisionPct}% de la prima</p>
                          </td>
                          <td className="py-2.5 pr-4">{v.formaPago ? <span className="tag">{FORMAS_PAGO[v.formaPago] || v.formaPago}</span> : '—'}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex flex-col items-start gap-0.5">
                              <VentaBadge estado={v.estado} />
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 pl-0.5">Póliza {activa ? 'activa' : 'inactiva'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            <MenuAcciones
                              small
                              label={`Acciones de la póliza ${v.producto || ''}`}
                              items={[
                                { label: 'Editar póliza', onClick: () => setPolizaModal({ open: true, venta: v }) },
                                'sep',
                                v.estado !== 'CANCELADA' && { label: 'Cancelar póliza', danger: true, onClick: () => setCancelarPoliza(v) },
                                { label: 'Eliminar definitivamente', danger: true, onClick: () => setDelPolizaId(v.id) },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="Sin pólizas registradas · usa «+ Crear póliza» para registrar la primera" />
            )}
          </Card>

          <Card title="Próximas citas" actions={<button onClick={abrirCita} className="btn-primary text-xs py-1 px-2">+ Agendar cita</button>}>
            {c.citas?.length ? (
              <ul className="space-y-2 text-sm">
                {c.citas.slice(0, 10).map((ci) => (
                  <li key={ci.id} className="group flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">{ci.titulo}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {infoCanal(ci.tipo).label}
                        {ci.modalidad === 'ACOMPANAMIENTO' && ' · Acompañamiento'}
                        {ci.promotor && ` con promotor ${ci.promotor.nombre} ${ci.promotor.apellidoP}`}
                        {' · '}
                        {fechaHora(ci.fechaHoraInicio)}
                        {ci.ubicacion && ` · ${ci.ubicacion}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CitaBadge estado={ci.estado} />
                      {CITA_VIVA.includes(ci.estado) && (
                        <button
                          onClick={() => cancelarCita(ci.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs transition-opacity"
                          title="Cancelar cita (conserva el registro)"
                        >Cancelar</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-400 dark:text-slate-500 py-1">Sin citas programadas.</p>}
          </Card>

          {/* Actividad reciente: mismo ActivityTimeline del módulo de Actividad,
              filtrado a este cliente (metadata.clienteId) */}
          <Card title="Actividad reciente" subtitle="Eventos registrados sobre este cliente">
            <ActivityTimeline
              eventos={actividadCliente || []}
              loading={actividadLoading}
              mensajeVacio="Sin actividad registrada de este cliente."
            />
          </Card>

          {/* Recordatorios: compactos, abajo — no dominan la ficha cuando están
              vacíos. Los de "sobre el cliente" (pagos, renovaciones) le llegan
              igual al asesor: el CRM NO le escribe al asegurado. */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card
              title="Recordatorios del asesor"
              subtitle="Tu propia gestión: llamadas, seguimientos, pendientes"
              actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => abrirNota('RECORDATORIO', 'ASESOR')}>+ Recordatorio</button>}
            >
              <ListaRecordatorios items={recordatoriosAsesor} onEliminar={setDelNotaId} vacio="Sin recordatorios de gestión." />
            </Card>

            <Card
              title="Recordatorios sobre el cliente"
              subtitle="Pagos y renovaciones · el aviso te llega a ti para que lo contactes"
              actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => abrirNota('RECORDATORIO', 'CLIENTE')}>+ Recordatorio</button>}
            >
              <ListaRecordatorios items={recordatoriosCliente} onEliminar={setDelNotaId} vacio="Sin recordatorios de pago o renovación." />
            </Card>
          </div>

          <Card
            title="Archivos del cliente"
            subtitle="Identificaciones, solicitudes, pólizas escaneadas y cualquier documento del expediente"
            actions={
              <button
                onClick={() => archivoInputRef.current?.click()}
                disabled={docSubiendo}
                className="btn-primary text-xs py-1 px-2"
              >{docSubiendo ? 'Subiendo…' : '+ Subir archivo'}</button>
            }
          >
            <input ref={archivoInputRef} type="file" className="hidden" onChange={subirArchivo} />
            {docErr && <p className="text-sm text-red-600 mb-3">{docErr}</p>}
            {c.documentos?.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                {c.documentos.map((d) => (
                  <li key={d.id} className="group flex items-center gap-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-base">
                      {d.mime?.startsWith('image/') ? '🖼️' : d.mime === 'application/pdf' ? '📄' : '📎'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => verArchivo(d)}
                        className="block max-w-full truncate font-medium text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 hover:underline text-left"
                        title="Previsualizar archivo"
                      >{d.nombre}</button>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {tamanoLegible(d.tamano)} · subido el {fechaCorta(d.creadoEn)}{d.asesor ? ` por ${d.asesor.nombre} ${d.asesor.apellidoP}` : ''}
                      </p>
                    </div>
                    <button onClick={() => verArchivo(d)} className="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline shrink-0">Ver</button>
                    <MenuAcciones
                      label={`Más acciones de ${d.nombre}`}
                      items={[
                        { label: 'Descargar', onClick: () => descargarArchivo(d) },
                        'sep',
                        { label: 'Eliminar archivo', danger: true, onClick: () => setDelDocId(d.id) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Sin archivos · usa «+ Subir archivo» para agregar documentos al expediente
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal editar cliente */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Agregar datos del cliente">
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
              <Field label="Apellido paterno"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
              <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
              <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Etapa del pipeline"><select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ETAPAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}{infoEtapa(form.estado).orden === -1 && <option value={form.estado}>{infoEtapa(form.estado).label}</option>}</select></Field>
              <Field label="RFC"><input className="input" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} placeholder="13 caracteres" /></Field>
              <Field label="CURP"><input className="input" value={form.curp} onChange={(e) => setForm({ ...form, curp: e.target.value.toUpperCase() })} placeholder="18 caracteres" /></Field>
              <Field label="Fecha de nacimiento">
                <DatePicker value={form.fechaNacimiento} onChange={(v) => setForm({ ...form, fechaNacimiento: v })} />
              </Field>
              <Field label="Fuente">
                <select className="input" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })}>
                  <option value="">Sin especificar</option>
                  {opcionesFuente(form.fuente).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Dirección"><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal nota / recordatorio (compartido con la lista de clientes) */}
      <NotaFormModal
        open={notaOpen}
        onClose={() => setNotaOpen(false)}
        clienteId={id}
        tipo={notaForm.tipo}
        destinatario={notaForm.destinatario}
      />

      {/* Agendar cita: modal compartido del módulo de Citas (cliente fijo; con
          ficha ajena el asesorId del dueño delimita clientes y aviso de empalme) */}
      <CitaFormModal
        open={citaOpen}
        onClose={() => setCitaOpen(false)}
        clienteId={id}
        asesorId={c.asesorId}
        onSaved={() => qc.invalidateQueries(['cliente', id])}
      />

      {/* Modal producto de interés */}
      <Modal open={productoOpen} onClose={() => setProductoOpen(false)} title="Producto de interés">
        {productoForm && (
          <form onSubmit={guardarProducto} className="space-y-3">
            <Field label="Ramo de interés">
              <select className="input" required value={productoForm.productoInteres} onChange={(e) => setProductoForm({ ...productoForm, productoInteres: e.target.value })}>
                <option value="">Selecciona…</option>
                {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r]}</option>)}
              </select>
            </Field>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Las observaciones del cliente van en <strong>Notas y recordatorios</strong>, más abajo en la ficha.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setProductoOpen(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={productoSaving} className="btn-primary">{productoSaving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Crear/editar póliza: modal compartido del módulo de Pólizas */}
      <PolizaFormModal
        open={polizaModal.open}
        onClose={() => setPolizaModal({ open: false, venta: null })}
        venta={polizaModal.venta}
        clienteId={c.id}
        asesorId={fichaAjena ? c.asesorId : null}
        onSaved={() => qc.invalidateQueries(['cliente', id])}
      />

      <VisorDocumento visor={visor} onClose={cerrarVisor} onDescargar={descargarArchivo} />

      {/* Confirmación archivar cliente (borrado lógico) */}
      <Modal open={archivarOpen} onClose={() => setArchivarOpen(false)} title="Archivar cliente">
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            ¿Archivar a <strong>{c.nombre} {c.apellidoP}</strong>? El cliente dejará de aparecer
            en tus listas, pero <strong>sus pólizas, citas, notas y referidos se conservan</strong> y
            podrás restaurarlo cuando quieras desde «Ver archivados».
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setArchivarOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={confirmarArchivar} disabled={archivando} className="btn-danger">
              {archivando ? 'Archivando…' : 'Archivar cliente'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmación cancelar póliza (soft) */}
      <Modal open={!!cancelarPoliza} onClose={() => setCancelarPoliza(null)} title="Cancelar póliza">
        {cancelarPoliza && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Cancelar la póliza <strong>{cancelarPoliza.producto}</strong>? Pasará a estado
              «Cancelada»: deja de contar en comisiones pero <strong>se conserva su historial</strong>.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCancelarPoliza(null)} className="btn-secondary">Volver</button>
              <button type="button" onClick={confirmarCancelarPoliza} disabled={cancelandoPoliza} className="btn-danger">
                {cancelandoPoliza ? 'Cancelando…' : 'Cancelar póliza'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmación eliminar póliza definitivamente */}
      <Modal open={!!delPolizaId} onClose={() => setDelPolizaId(null)} title="Eliminar póliza definitivamente">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
          ¿Eliminar esta póliza <strong>definitivamente</strong>? También se borrarán sus recordatorios
          de pago y <strong>no se puede deshacer</strong>. Si solo quieres darla de baja, usa «Cancelar póliza».
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelPolizaId(null)} className="btn-secondary">Volver</button>
          <button onClick={eliminarPoliza} disabled={delPolizaBusy} className="btn-danger">
            {delPolizaBusy ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </Modal>

      {/* Confirmación eliminar nota/recordatorio */}
      <Modal open={!!delNotaId} onClose={() => setDelNotaId(null)} title="Eliminar nota">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar esta nota/recordatorio?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelNotaId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarNota} className="btn-danger">Eliminar</button>
        </div>
      </Modal>

      {/* Confirmación eliminar archivo */}
      <Modal open={!!delDocId} onClose={() => setDelDocId(null)} title="Eliminar archivo">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar este archivo del expediente del cliente?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelDocId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarArchivo} className="btn-danger">Eliminar</button>
        </div>
      </Modal>

    </div>
  );
}

// Referidos del cliente: quién lo refirió y a quiénes ha referido (compacto,
// para el riel izquierdo de la ficha).
function ReferidosCard({ clienteId, referidoPor }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ nombreReferido: '', telefonoReferido: '', emailReferido: '' });

  const { data: referidosLista } = useQuery({
    queryKey: ['referidos-cliente', clienteId],
    queryFn: async () => (await api.get('/referidos', { params: { clienteOrigenId: clienteId } })).data,
  });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await api.post('/referidos', { clienteOrigenId: clienteId, ...form });
      setOpen(false);
      setForm({ nombreReferido: '', telefonoReferido: '', emailReferido: '' });
      qc.invalidateQueries(['referidos-cliente', clienteId]);
    } catch (e2) { setErr(handleError(e2)); } finally { setSaving(false); }
  };

  const actualizarEstado = async (rid, estado) => {
    await api.patch(`/referidos/${rid}`, { estado });
    qc.invalidateQueries(['referidos-cliente', clienteId]);
  };

  const lista = referidosLista || [];
  return (
    <>
      <Card title="Referidos" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => setOpen(true)}>+ Registrar</button>}>
        <div className="space-y-3">
          <div>
            <p className="kv-k">Referido por</p>
            {referidoPor ? (
              <Link to={`/clientes/${referidoPor.id}`} className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                {referidoPor.nombre} {referidoPor.apellidoP}
              </Link>
            ) : <p className="text-sm text-slate-400 dark:text-slate-500">Captación directa</p>}
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="kv-k">Ha referido a</p>
            {lista.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Aún no ha generado referidos</p>
            ) : (
              <ul className="space-y-2 mt-1">
                {lista.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      {r.clienteReferido ? (
                        <Link to={`/clientes/${r.clienteReferido.id}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline truncate block">
                          {r.clienteReferido.nombre} {r.clienteReferido.apellidoP}
                        </Link>
                      ) : (
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{r.nombreReferido || '—'}</p>
                      )}
                      {(r.telefonoReferido || r.emailReferido) && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.telefonoReferido || r.emailReferido}</p>
                      )}
                    </div>
                    <select
                      className="input w-auto !py-1 text-xs shrink-0"
                      value={r.estado}
                      onChange={(e) => actualizarEstado(r.id, e.target.value)}
                    >
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="CONTACTADO">Contactado</option>
                      <option value="CONVERTIDO">Convertido</option>
                      <option value="DESCARTADO">Descartado</option>
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar referido">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Agrega a alguien referido por este cliente para gestionar su conversión.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre del referido*"><input className="input" required value={form.nombreReferido} onChange={(e) => setForm({ ...form, nombreReferido: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefonoReferido} onChange={(e) => setForm({ ...form, telefonoReferido: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input className="input" type="email" value={form.emailReferido} onChange={(e) => setForm({ ...form, emailReferido: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar referido'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
