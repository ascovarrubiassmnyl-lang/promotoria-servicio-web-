import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useMemo, useRef } from 'react';
import { api, handleError } from '../api/client.js';
import { Card, Modal, Field, CitaBadge, VentaBadge, EmptyState } from '../components/ui.jsx';
import { mxn, fechaHora, fechaCorta, isoLocalInput, isoLocalDateInput, RAMOS, RAMOS_LABEL, ESTADOS_CLIENTE, ESTADOS_CLIENTE_LABEL, ESTADOS_VENTA, ESTADOS_VENTA_LABEL, FORMAS_PAGO, FORMAS_PAGO_LIST } from '../lib/format.js';

const TIPO_CITA = { TELEFONICA: 'Telefónica', VIDEO: 'Videollamada', PRESENCIAL: 'Presencial' };
const MODALIDAD_CITA_LABEL = { CITA_UNICA: 'Cita única', ACOMPANAMIENTO: 'Acompañamiento' };
// Pólizas en estado PAGADA o FIRMADA se consideran "activas"
const POLIZA_ACTIVA = new Set(['PAGADA', 'FIRMADA', 'APROBADA']);
const ESTADO_CITA = ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'];
const PAGOS_POR_ANIO = { MENSUAL: 12, TRIMESTRAL: 4, SEMESTRAL: 2, ANUAL: 1, UNICO: 1 };
const PERIODO_LABEL = { MENSUAL: 'mensuales', TRIMESTRAL: 'por trimestre', SEMESTRAL: 'por semestre' };

function tamanoLegible(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const POLIZA_FORM_INICIAL = {
  ramo: 'VIDA', productoCatalogoId: '', producto: '', primaAnual: '',
  comisionPct: 10, formaPago: 'ANUAL', estado: 'PENDIENTE_PAGAR',
  fechaInicioVigencia: '', fechaProximoPago: '', notas: '',
};

export default function ClienteDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toDeleteClient, setToDeleteClient] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  // Nota modal
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaForm, setNotaForm] = useState({ tipo: 'NOTA', texto: '', fechaAviso: '' });
  const [notaSaving, setNotaSaving] = useState(false);

  // Cita modal
  const [citaOpen, setCitaOpen] = useState(false);
  const [citaForm, setCitaForm] = useState({ titulo: '', descripcion: '', tipo: 'TELEFONICA', fechaHoraInicio: '', fechaHoraFin: '', ubicacion: '', estado: 'PROGRAMADA' });
  const [citaSaving, setCitaSaving] = useState(false);

  // Producto modal (interés)
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoForm, setProductoForm] = useState(null);
  const [productoSaving, setProductoSaving] = useState(false);

  // Póliza modal (crear/editar venta desde la ficha)
  const [polizaOpen, setPolizaOpen] = useState(false);
  const [polizaEditId, setPolizaEditId] = useState(null); // null = crear, id = editar
  const [polizaForm, setPolizaForm] = useState(POLIZA_FORM_INICIAL);
  const [polizaSaving, setPolizaSaving] = useState(false);
  const [polizaErr, setPolizaErr] = useState('');

  // Archivos del cliente
  const archivoInputRef = useRef(null);
  const [docSubiendo, setDocSubiendo] = useState(false);
  const [docErr, setDocErr] = useState('');
  const [delDocId, setDelDocId] = useState(null);

  // Eliminar
  const [delCitaId, setDelCitaId] = useState(null);
  const [delNotaId, setDelNotaId] = useState(null);
  const [delPolizaId, setDelPolizaId] = useState(null);
  const [delPolizaBusy, setDelPolizaBusy] = useState(false);

  const { data: c, isLoading } = useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => (await api.get(`/clientes/${id}`)).data,
  });

  const { data: catalogo } = useQuery({
    queryKey: ['productos-catalogo'],
    queryFn: async () => (await api.get('/productos-catalogo', { params: { soloActivos: true } })).data,
  });

  const productosPorRamo = useMemo(
    () => (catalogo || []).filter((p) => p.ramo === polizaForm.ramo),
    [catalogo, polizaForm.ramo]
  );

  if (isLoading) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Cargando…</div>;
  if (!c) return <EmptyState message="Cliente no encontrado" />;

  const startEdit = () => setForm({
    nombre: c.nombre, apellidoP: c.apellidoP, apellidoM: c.apellidoM || '',
    email: c.email || '', telefono: c.telefono || '', estado: c.estado,
    notas: c.notas || '', fuente: c.fuente || '', direccion: c.direccion || '', rfc: c.rfc || '',
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

  // Cambiar estado inline
  const cambiarEstado = async (estado) => {
    try {
      await api.patch(`/clientes/${id}`, { estado });
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['clientes']);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Agregar nota o recordatorio
  const abrirNota = (tipo) => {
    setNotaForm({ tipo, texto: '', fechaAviso: tipo === 'RECORDATORIO' ? isoLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)) : '' });
    setNotaOpen(true);
  };

  const guardarNota = async (e) => {
    e.preventDefault();
    setNotaSaving(true);
    try {
      await api.post('/notas', {
        clienteId: id,
        tipo: notaForm.tipo,
        texto: notaForm.texto,
        fechaAviso: notaForm.fechaAviso || null,
      });
      setNotaOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setNotaSaving(false); }
  };

  const eliminarNota = async () => {
    try {
      await api.delete(`/notas/${delNotaId}`);
      setDelNotaId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Agendar cita
  const abrirCita = () => {
    const ahora = new Date(); ahora.setHours(ahora.getHours() + 1, 0, 0, 0);
    setCitaForm({ titulo: '', descripcion: '', tipo: 'TELEFONICA', fechaHoraInicio: isoLocalInput(ahora), fechaHoraFin: '', ubicacion: '', estado: 'PROGRAMADA' });
    setCitaOpen(true);
  };

  const guardarCita = async (e) => {
    e.preventDefault();
    if (!citaForm.titulo || !citaForm.fechaHoraInicio) { alert('Título y fecha de inicio son requeridos'); return; }
    setCitaSaving(true);
    try {
      await api.post('/citas', { clienteId: id, ...citaForm });
      setCitaOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setCitaSaving(false); }
  };

  const eliminarCita = async () => {
    try {
      await api.delete(`/citas/${delCitaId}`);
      setDelCitaId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  // Producto
  const abrirProducto = () => {
    setProductoForm({
      productoInteres: c.productoInteres || '',
      detalleInteres: c.detalleInteres || '',
    });
    setProductoOpen(true);
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    setProductoSaving(true);
    try {
      const payload = {
        productoInteres: productoForm.productoInteres || null,
        detalleInteres: productoForm.detalleInteres || null,
      };
      await api.patch(`/clientes/${id}`, payload);
      setProductoOpen(false);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); } finally { setProductoSaving(false); }
  };

  // Crear póliza desde la ficha del cliente
  const abrirPoliza = () => {
    setPolizaErr('');
    setPolizaEditId(null);
    // Si el cliente tiene producto de interés, arranca con ese ramo preseleccionado
    setPolizaForm({ ...POLIZA_FORM_INICIAL, ramo: c.productoInteres || 'VIDA' });
    setPolizaOpen(true);
  };

  // Editar una póliza existente con el mismo formulario completo
  const abrirEditarPoliza = (v) => {
    setPolizaErr('');
    setPolizaEditId(v.id);
    setPolizaForm({
      ramo: v.ramo,
      productoCatalogoId: v.productoCatalogoId || '',
      producto: v.producto || '',
      primaAnual: v.primaAnual ?? '',
      comisionPct: v.comisionPct ?? 10,
      formaPago: v.formaPago || 'ANUAL',
      estado: v.estado,
      fechaInicioVigencia: v.fechaInicioVigencia ? isoLocalDateInput(v.fechaInicioVigencia) : '',
      fechaProximoPago: v.fechaProximoPago ? isoLocalDateInput(v.fechaProximoPago) : '',
      notas: v.notas || '',
    });
    setPolizaOpen(true);
  };

  const onPolizaRamo = (ramo) => {
    setPolizaForm({ ...polizaForm, ramo, productoCatalogoId: '', producto: '', comisionPct: 10 });
  };

  // Al elegir producto del catálogo se llena el nombre y la comisión oficial
  const onPolizaProducto = (prodId) => {
    const p = catalogo?.find((x) => x.id === prodId);
    setPolizaForm({
      ...polizaForm,
      productoCatalogoId: prodId,
      producto: p?.nombre || polizaForm.producto,
      comisionPct: p?.comisionPct ?? polizaForm.comisionPct,
    });
  };

  const guardarPoliza = async (e) => {
    e.preventDefault();
    setPolizaSaving(true); setPolizaErr('');
    try {
      const prima = +polizaForm.primaAnual;
      const pagosAnio = PAGOS_POR_ANIO[polizaForm.formaPago] || 1;
      const payload = {
        ramo: polizaForm.ramo,
        producto: polizaForm.producto,
        primaAnual: prima,
        comisionPct: polizaForm.comisionPct !== '' ? +polizaForm.comisionPct : undefined,
        formaPago: polizaForm.formaPago,
        estado: polizaForm.estado,
        montoPago: polizaForm.formaPago !== 'UNICO' ? +(prima / pagosAnio).toFixed(2) : null,
      };
      if (polizaEditId) {
        // Editar: los campos opcionales se mandan explícitos para poder limpiarlos
        await api.patch(`/ventas/${polizaEditId}`, {
          ...payload,
          productoCatalogoId: polizaForm.productoCatalogoId || null,
          fechaInicioVigencia: polizaForm.fechaInicioVigencia || null,
          fechaProximoPago: polizaForm.fechaProximoPago || null,
          notas: polizaForm.notas || null,
        });
      } else {
        await api.post('/ventas', {
          ...payload,
          clienteId: id,
          productoCatalogoId: polizaForm.productoCatalogoId || undefined,
          montoPago: payload.montoPago ?? undefined,
          fechaInicioVigencia: polizaForm.fechaInicioVigencia || undefined,
          fechaProximoPago: polizaForm.fechaProximoPago || undefined,
          notas: polizaForm.notas || undefined,
        });
      }
      setPolizaOpen(false);
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['ventas']);
    } catch (e2) { setPolizaErr(handleError(e2)); } finally { setPolizaSaving(false); }
  };

  const eliminarPoliza = async () => {
    setDelPolizaBusy(true);
    try {
      await api.delete(`/ventas/${delPolizaId}`);
      setDelPolizaId(null);
      setPolizaOpen(false);
      qc.invalidateQueries(['cliente', id]);
      qc.invalidateQueries(['ventas']);
    } catch (e2) { alert(handleError(e2)); } finally { setDelPolizaBusy(false); }
  };

  // Archivos del cliente
  const subirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
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

  const descargarArchivo = async (doc) => {
    try {
      const r = await api.get(`/documentos/${doc.id}/descargar`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e2) { alert(handleError(e2)); }
  };

  const eliminarArchivo = async () => {
    try {
      await api.delete(`/documentos/${delDocId}`);
      setDelDocId(null);
      qc.invalidateQueries(['cliente', id]);
    } catch (e2) { alert(handleError(e2)); }
  };

  const confirmarEliminarCliente = async () => {
    setDeleting(true);
    try {
      await api.delete(`/clientes/${id}`);
      qc.invalidateQueries(['clientes']);
      navigate('/clientes');
    } catch (e) {
      alert(handleError(e));
    } finally {
      setDeleting(false);
    }
  };

  // Separar notas y recordatorios
  const notas = c.notasItems?.filter((n) => n.tipo === 'NOTA') || [];
  const recordatorios = c.notasItems?.filter((n) => n.tipo === 'RECORDATORIO') || [];

  // Cálculo en vivo de la comisión de la póliza que se está capturando
  const polizaPrima = +polizaForm.primaAnual || 0;
  const polizaPct = +polizaForm.comisionPct || 0;
  const polizaComision = polizaPrima * polizaPct / 100;
  const polizaPagosAnio = PAGOS_POR_ANIO[polizaForm.formaPago] || 1;
  const polizaMontoPago = polizaPrima / polizaPagosAnio;
  const productoSel = catalogo?.find((p) => p.id === polizaForm.productoCatalogoId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/clientes" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Volver a clientes</Link>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">{c.nombre} {c.apellidoP} {c.apellidoM || ''}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Asesor: {c.asesor?.nombre} {c.asesor?.apellidoP} · Creado {fechaCorta(c.creadoEn)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto"
            value={c.estado}
            onChange={(e) => cambiarEstado(e.target.value)}
            title="Cambiar estado del cliente"
          >
            {ESTADOS_CLIENTE.map((e) => <option key={e} value={e}>{ESTADOS_CLIENTE_LABEL[e]}</option>)}
          </select>
          <button onClick={() => { startEdit(); setEditing(true); }} className="btn-secondary">Editar</button>
          <button onClick={() => setToDeleteClient(true)} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Contacto */}
        <Card title="Contacto">
          <dl className="text-sm space-y-1">
            <div><dt className="text-slate-400 dark:text-slate-500">Teléfono</dt><dd className="text-slate-700 dark:text-slate-300">{c.telefono || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">Email</dt><dd className="text-slate-700 dark:text-slate-300">{c.email || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">RFC</dt><dd className="text-slate-700 dark:text-slate-300">{c.rfc || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">Dirección</dt><dd className="text-slate-700 dark:text-slate-300">{c.direccion || '—'}</dd></div>
            <div><dt className="text-slate-400 dark:text-slate-500">Fuente</dt><dd className="text-slate-700 dark:text-slate-300">{c.fuente || '—'}</dd></div>
          </dl>
        </Card>

        {/* Notas libres */}
        <Card title="Notas generales" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => abrirNota('NOTA')}>+ Nota</button>}>
          {c.notas && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap border-l-2 border-slate-200 dark:border-slate-700 pl-3 italic">{c.notas}</p>}
          {notas.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {notas.map((n) => (
                <li key={n.id} className="group flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <p className="text-slate-600 dark:text-slate-300">{n.texto}</p>
                  <button
                    onClick={() => setDelNotaId(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity shrink-0"
                    title="Eliminar nota"
                  >Eliminar</button>
                </li>
              ))}
            </ul>
          ) : !c.notas && <EmptyState message="Sin notas" />}
        </Card>

        {/* Recordatorios */}
        <Card title="Recordatorios" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => abrirNota('RECORDATORIO')}>+ Recordatorio</button>}>
          {recordatorios.length ? (
            <ul className="space-y-2 text-sm">
              {recordatorios.map((n) => (
                <li key={n.id} className="group flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <div>
                    <p className="text-slate-700 dark:text-slate-300">{n.texto}</p>
                    {n.fechaAviso && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Avisar: {fechaHora(n.fechaAviso)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setDelNotaId(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity shrink-0"
                    title="Eliminar recordatorio"
                  >Eliminar</button>
                </li>
              ))}
            </ul>
          ) : <EmptyState message="Sin recordatorios" />}
        </Card>
      </div>

      {/* Pólizas del cliente */}
      <Card
        title={`Póliza${(c.ventas?.length || 0) === 1 ? '' : 's'}${c.ventas?.length ? ` (${c.ventas.length})` : ''}`}
        className="md:col-span-3"
        actions={<button onClick={abrirPoliza} className="btn-primary text-xs py-1 px-2">+ Crear póliza</button>}
      >
        {/* Producto de interés (cuando aún no hay pólizas) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Producto de interés</h4>
            {c.productoInteres && (
              <button onClick={() => abrirProducto()} className="btn-secondary text-xs py-1 px-2">Editar</button>
            )}
          </div>
          {c.productoInteres ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/40">
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">{RAMOS_LABEL[c.productoInteres]}</p>
              {c.detalleInteres && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.detalleInteres}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Sin producto de interés registrado</p>
          )}
        </div>

        {/* Lista de Pólizas (Ventas) con ramo + producto + estado activo/inactivo */}
        {c.ventas?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Ramo</th>
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4 text-right">Prima anual</th>
                  <th className="py-2 pr-4 text-right">Comisión</th>
                  <th className="py-2 pr-4">Forma de pago</th>
                  <th className="py-2 pr-4">Póliza</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {c.ventas.map((v) => {
                  const activa = POLIZA_ACTIVA.has(v.estado);
                  return (
                    <tr key={v.id} className="border-b border-slate-50 dark:border-slate-700/50">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{RAMOS_LABEL[v.ramo] || v.ramo}</span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {v.productoCatalogo?.nombre || v.producto || '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">{mxn(v.primaAnual)}</td>
                      <td className="py-2 pr-4 text-right">
                        <p className="text-emerald-600 dark:text-emerald-400 font-medium">{mxn(v.comisionMonto)}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{v.comisionPct}% de la prima</p>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {v.formaPago ? ({ MENSUAL: 'Mensual', TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual', UNICO: 'Único' }[v.formaPago] || v.formaPago) : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${activa ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          <span className={`w-2 h-2 rounded-full ${activa ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          {activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="py-2 pr-4"><VentaBadge estado={v.estado} /></td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => abrirEditarPoliza(v)}
                          className="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline"
                        >Editar</button>
                        <button
                          onClick={() => setDelPolizaId(v.id)}
                          className="ml-3 text-red-500 text-xs font-medium hover:underline"
                        >Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="Sin pólizas registradas · usa el botón «+ Crear póliza» para registrar la primera" />
        )}
      </Card>

      {/* Próximas citas */}
      <Card
        title="Próximas citas"
        actions={<button onClick={abrirCita} className="btn-primary text-xs py-1 px-2">+ Agendar cita</button>}
      >
        {c.citas?.length ? (
          <ul className="space-y-2 text-sm">
            {c.citas.slice(0, 10).map((ci) => (
              <li key={ci.id} className="group flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{ci.titulo}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {TIPO_CITA[ci.tipo] || ci.tipo}
                    {ci.modalidad === 'ACOMPANAMIENTO' && ' · Acompañamiento'}
                    {ci.promotor && ` con promotor ${ci.promotor.nombre} ${ci.promotor.apellidoP}`}
                    {' · '}
                    {fechaHora(ci.fechaHoraInicio)}
                    {ci.ubicacion && ` · ${ci.ubicacion}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CitaBadge estado={ci.estado} />
                  <button
                    onClick={() => setDelCitaId(ci.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 text-xs transition-opacity"
                    title="Eliminar cita"
                  >Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState message="Sin citas programadas" />}
      </Card>

      {/* Archivos del cliente */}
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
                    onClick={() => descargarArchivo(d)}
                    className="block max-w-full truncate font-medium text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 hover:underline text-left"
                    title="Descargar archivo"
                  >{d.nombre}</button>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {tamanoLegible(d.tamano)} · subido el {fechaCorta(d.creadoEn)}{d.asesor ? ` por ${d.asesor.nombre} ${d.asesor.apellidoP}` : ''}
                  </p>
                </div>
                <button onClick={() => descargarArchivo(d)} className="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline shrink-0">Descargar</button>
                <button onClick={() => setDelDocId(d.id)} className="text-red-500 text-xs font-medium hover:underline shrink-0">Eliminar</button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="Sin archivos · usa «+ Subir archivo» para agregar documentos al expediente" />
        )}
      </Card>

      {/* Modal editar cliente */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Editar cliente">
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre"><input className="input" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
              <Field label="Apellido paterno"><input className="input" required value={form.apellidoP} onChange={(e) => setForm({ ...form, apellidoP: e.target.value })} /></Field>
              <Field label="Apellido materno"><input className="input" value={form.apellidoM} onChange={(e) => setForm({ ...form, apellidoM: e.target.value })} /></Field>
              <Field label="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Estado"><select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS_CLIENTE.map((e) => <option key={e} value={e}>{ESTADOS_CLIENTE_LABEL[e]}</option>)}</select></Field>
              <Field label="RFC"><input className="input" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} /></Field>
              <Field label="Fuente"><input className="input" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} /></Field>
            </div>
            <Field label="Dirección"><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></Field>
            <Field label="Notas generales"><textarea className="input" rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal nota / recordatorio */}
      <Modal open={notaOpen} onClose={() => setNotaOpen(false)} title={notaForm.tipo === 'NOTA' ? 'Agregar nota' : 'Agregar recordatorio'}>
        <form onSubmit={guardarNota} className="space-y-3">
          <Field label={notaForm.tipo === 'NOTA' ? 'Nota' : 'Recordatorio'}>
            <textarea
              className="input"
              rows={4}
              required
              value={notaForm.texto}
              onChange={(e) => setNotaForm({ ...notaForm, texto: e.target.value })}
              placeholder={notaForm.tipo === 'NOTA' ? 'Escribe aquí…' : 'Qué quieres recordar…'}
            />
          </Field>
          {notaForm.tipo === 'RECORDATORIO' && (
            <Field label="Fecha y hora de aviso">
              <input
                type="datetime-local"
                className="input"
                required
                value={notaForm.fechaAviso}
                onChange={(e) => setNotaForm({ ...notaForm, fechaAviso: e.target.value })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Te avisaremos mediante notificación push cuando se acerque esta fecha.
              </p>
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setNotaOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={notaSaving} className="btn-primary">{notaSaving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal cita */}
      <Modal open={citaOpen} onClose={() => setCitaOpen(false)} title="Agendar cita">
        <form onSubmit={guardarCita} className="space-y-3">
          <Field label="Título"><input className="input" required value={citaForm.titulo} onChange={(e) => setCitaForm({ ...citaForm, titulo: e.target.value })} /></Field>
          <Field label="Descripción"><textarea className="input" rows={2} value={citaForm.descripcion} onChange={(e) => setCitaForm({ ...citaForm, descripcion: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo"><select className="input" value={citaForm.tipo} onChange={(e) => setCitaForm({ ...citaForm, tipo: e.target.value })}>{Object.entries(TIPO_CITA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Estado"><select className="input" value={citaForm.estado} onChange={(e) => setCitaForm({ ...citaForm, estado: e.target.value })}>{ESTADO_CITA.map((e) => <option key={e} value={e}>{e}</option>)}</select></Field>
            <Field label="Inicio"><input type="datetime-local" className="input" required value={citaForm.fechaHoraInicio} onChange={(e) => setCitaForm({ ...citaForm, fechaHoraInicio: e.target.value })} /></Field>
            <Field label="Fin (opcional)"><input type="datetime-local" className="input" value={citaForm.fechaHoraFin} onChange={(e) => setCitaForm({ ...citaForm, fechaHoraFin: e.target.value })} /></Field>
          </div>
          <Field label="Ubicación"><input className="input" value={citaForm.ubicacion} onChange={(e) => setCitaForm({ ...citaForm, ubicacion: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCitaOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={citaSaving} className="btn-primary">{citaSaving ? 'Agendando…' : 'Agendar'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal producto interés */}
      <Modal
        open={productoOpen}
        onClose={() => setProductoOpen(false)}
        title="Producto de interés"
      >
        {productoForm && (
          <form onSubmit={guardarProducto} className="space-y-3">
            <Field label="Ramo de interés">
              <select className="input" required value={productoForm.productoInteres} onChange={(e) => setProductoForm({ ...productoForm, productoInteres: e.target.value })}>
                <option value="">Selecciona…</option>
                {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field label="Detalle / observaciones">
              <textarea className="input" rows={4} value={productoForm.detalleInteres} onChange={(e) => setProductoForm({ ...productoForm, detalleInteres: e.target.value })} placeholder="Ej. Busca protección para su familia, 2 hijos, ingreso aproximado $35K mensual…" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setProductoOpen(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={productoSaving} className="btn-primary">{productoSaving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal crear/editar póliza */}
      <Modal
        open={polizaOpen}
        onClose={() => setPolizaOpen(false)}
        title={polizaEditId ? `Editar póliza de ${c.nombre} ${c.apellidoP}` : `Crear póliza para ${c.nombre} ${c.apellidoP}`}
      >
        <form onSubmit={guardarPoliza} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ramo*">
              <select className="input" required value={polizaForm.ramo} onChange={(e) => onPolizaRamo(e.target.value)}>
                {RAMOS.map((r) => <option key={r} value={r}>{RAMOS_LABEL[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Producto del catálogo">
              <select className="input" value={polizaForm.productoCatalogoId} onChange={(e) => onPolizaProducto(e.target.value)}>
                <option value="">— Personalizado —</option>
                {productosPorRamo.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.comisionPct != null ? ` · comisión ${p.comisionPct}%` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Nombre del producto*">
              <input
                className="input"
                required
                value={polizaForm.producto}
                onChange={(e) => setPolizaForm({ ...polizaForm, producto: e.target.value })}
                placeholder={productosPorRamo.length ? 'Se llena al elegir del catálogo' : 'Ej. Póliza personalizada'}
              />
            </Field>
            <Field label="Prima anual (MXN)*">
              <input type="number" step="0.01" min="0" className="input" required value={polizaForm.primaAnual} onChange={(e) => setPolizaForm({ ...polizaForm, primaAnual: e.target.value })} />
            </Field>
            <Field label="Forma de pago">
              <select className="input" value={polizaForm.formaPago} onChange={(e) => setPolizaForm({ ...polizaForm, formaPago: e.target.value })}>
                {FORMAS_PAGO_LIST.map((f) => <option key={f} value={f}>{FORMAS_PAGO[f]}</option>)}
              </select>
            </Field>
            <Field label="Comisión (%)">
              <input type="number" step="0.1" min="0" className="input" value={polizaForm.comisionPct} onChange={(e) => setPolizaForm({ ...polizaForm, comisionPct: e.target.value })} placeholder="Auto del catálogo" />
            </Field>
            <Field label="Estado">
              <select className="input" value={polizaForm.estado} onChange={(e) => setPolizaForm({ ...polizaForm, estado: e.target.value })}>
                {ESTADOS_VENTA.map((es) => <option key={es} value={es}>{ESTADOS_VENTA_LABEL[es]}</option>)}
              </select>
            </Field>
            <Field label="Inicio de vigencia">
              <input type="date" className="input" value={polizaForm.fechaInicioVigencia} onChange={(e) => setPolizaForm({ ...polizaForm, fechaInicioVigencia: e.target.value })} />
            </Field>
            <Field label="Próximo pago">
              <input type="date" className="input" value={polizaForm.fechaProximoPago} onChange={(e) => setPolizaForm({ ...polizaForm, fechaProximoPago: e.target.value })} />
            </Field>
          </div>

          {productoSel?.descripcion && (
            <p className="text-xs text-slate-500 dark:text-slate-400 border-l-2 border-slate-200 dark:border-slate-600 pl-2">{productoSel.descripcion}</p>
          )}

          {/* Resumen en vivo: lo que ganará el asesor con esta póliza */}
          {polizaPrima > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/25 px-4 py-3 space-y-1.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">Tu comisión ({polizaPct}% de la prima anual)</span>
                <span className="text-right shrink-0">
                  {polizaPagosAnio > 1 ? (
                    <>
                      <span className="block text-base font-bold text-emerald-700 dark:text-emerald-400">
                        {mxn(polizaComision / polizaPagosAnio)} {PERIODO_LABEL[polizaForm.formaPago]}
                      </span>
                      <span className="block text-xs font-medium text-emerald-700/80 dark:text-emerald-400/80">
                        {mxn(polizaComision)} al año
                      </span>
                    </>
                  ) : (
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">{mxn(polizaComision)} al año</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>Cobro al cliente ({FORMAS_PAGO[polizaForm.formaPago].toLowerCase()})</span>
                <span className="font-medium">
                  {mxn(polizaMontoPago)}{polizaPagosAnio > 1 ? ` × ${polizaPagosAnio} pagos al año` : ''}
                </span>
              </div>
              {polizaForm.productoCatalogoId && productoSel?.comisionPct != null && (
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  % según el esquema de comisiones registrado para este producto{productoSel.comisionBonoPct ? ` · bono adicional posible: ${productoSel.comisionBonoPct}%` : ''}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Con forma de pago recurrente y fecha de <strong>próximo pago</strong>, el sistema genera recordatorios push automáticos de cada cobro.
          </p>
          <Field label="Notas">
            <textarea className="input" rows={2} value={polizaForm.notas} onChange={(e) => setPolizaForm({ ...polizaForm, notas: e.target.value })} />
          </Field>
          {polizaErr && <p className="text-sm text-red-600">{polizaErr}</p>}
          <div className="flex items-center gap-2 pt-2">
            {polizaEditId && (
              <button
                type="button"
                onClick={() => setDelPolizaId(polizaEditId)}
                className="text-red-500 text-sm font-medium hover:underline"
              >Eliminar póliza</button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setPolizaOpen(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={polizaSaving} className="btn-primary">{polizaSaving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Referidos */}
      <ReferidosBlock clienteId={c.id} referidoPor={c.referidoPor} referidos={c.referidos} />

      {/* Confirmación eliminar cliente */}
      <Modal open={toDeleteClient} onClose={() => setToDeleteClient(false)} title="Eliminar cliente">
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            ¿Seguro que deseas eliminar a <strong>{c.nombre} {c.apellidoP}</strong>?
            Esta acción también borrará sus citas, notas y ventas asociadas y no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setToDeleteClient(false)} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={confirmarEliminarCliente} disabled={deleting} className="btn-primary bg-red-600 hover:bg-red-700">
              {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmación eliminar nota/recordatorio */}
      <Modal open={!!delNotaId} onClose={() => setDelNotaId(null)} title="Eliminar nota">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar esta nota/recordatorio?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelNotaId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarNota} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </Modal>

      {/* Confirmación eliminar póliza */}
      <Modal open={!!delPolizaId} onClose={() => setDelPolizaId(null)} title="Eliminar póliza">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
          ¿Eliminar esta póliza? También se borrarán sus recordatorios de pago. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelPolizaId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarPoliza} disabled={delPolizaBusy} className="btn-primary bg-red-600 hover:bg-red-700">
            {delPolizaBusy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      {/* Confirmación eliminar archivo */}
      <Modal open={!!delDocId} onClose={() => setDelDocId(null)} title="Eliminar archivo">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar este archivo del expediente del cliente?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelDocId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarArchivo} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </Modal>

      {/* Confirmación eliminar cita */}
      <Modal open={!!delCitaId} onClose={() => setDelCitaId(null)} title="Eliminar cita">
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">¿Eliminar esta cita?</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDelCitaId(null)} className="btn-secondary">Cancelar</button>
          <button onClick={eliminarCita} className="btn-primary bg-red-600 hover:bg-red-700">Eliminar</button>
        </div>
      </Modal>
    </div>
  );
}

function ReferidosBlock({ clienteId, referidoPor, referidos }) {
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

  const actualizarEstado = async (id, estado) => {
    await api.patch(`/referidos/${id}`, { estado });
    qc.invalidateQueries(['referidos-cliente', clienteId]);
  };

  const lista = referidosLista || [];
  return (
    <div className="space-y-3">
      <Card title="Referidos" actions={<button className="btn-secondary text-xs py-1 px-2" onClick={() => setOpen(true)}>+ Registrar referido</button>}>
        {referidoPor && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
            Referido por: <Link to={`/clientes/${referidoPor.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">{referidoPor.nombre} {referidoPor.apellidoP}</Link>
          </p>
        )}
        {lista.length === 0 ? (
          <EmptyState message="Aún no hay referidos registrados por este cliente" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4">Referido</th>
                  <th className="py-2 pr-4">Contacto</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/60">
                    <td className="py-2 pr-4">
                      {r.clienteReferido ? (
                        <Link to={`/clientes/${r.clienteReferido.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">{r.clienteReferido.nombre} {r.clienteReferido.apellidoP}</Link>
                      ) : (
                        <span className="font-medium text-slate-700 dark:text-slate-300">{r.nombreReferido || '—'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                      {r.telefonoReferido && <p>{r.telefonoReferido}</p>}
                      {r.emailReferido && <p className="text-xs">{r.emailReferido}</p>}
                      {!r.telefonoReferido && !r.emailReferido && <p className="text-xs text-slate-400">—</p>}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        className="input w-auto text-xs"
                        value={r.estado}
                        onChange={(e) => actualizarEstado(r.id, e.target.value)}
                      >
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="CONTACTADO">Contactado</option>
                        <option value="CONVERTIDO">Convertido</option>
                        <option value="DESCARTADO">Descartado</option>
                      </select>
                    </td>
                    <td className="py-2 pr-4 text-right text-xs text-slate-400 dark:text-slate-500">
                      {new Date(r.fecha).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </div>
  );
}
