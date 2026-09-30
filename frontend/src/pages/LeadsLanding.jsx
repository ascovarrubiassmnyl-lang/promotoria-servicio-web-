import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, MenuAcciones, Modal, Field } from '../components/ui.jsx';
import { handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fechaHora } from '../lib/format.js';
import { ETAPAS_SELECCIONABLES, infoEtapa } from '../components/clientes/etapas.js';
import {
  urlCaptura, useFuentesCaptura, useLeadsRecibidos, useGuardarFuente,
  useRegenerarClave, useEliminarFuente, useMarcarLeadsVistos,
} from '../hooks/useLeadsLanding.js';

// "Agrega tu sitio web" (/leads): cada usuario conecta sus landings /
// formularios externos al CRM. Una landing = una "fuente" con el nombre que
// el usuario elija ("Landing tarjeta QR", "Formulario Facebook"…) y su propia
// URL; los leads que entran por ella quedan como clientes (prospectos) en su
// CRM, etiquetados con el nombre de la landing. Backend: routes/captura.js
// (público) y routes/fuentesCaptura.js (autoservicio).

function Copiar({ texto, label = 'Copiar', className = '' }) {
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* sin clipboard */ }
  };
  return (
    <button type="button" onClick={copiar} className={`btn-secondary text-xs px-2.5 py-1.5 shrink-0 ${className}`}>
      {ok ? 'Copiado ✓' : label}
    </button>
  );
}

function Codigo({ children }) {
  return (
    <pre className="text-[11px] leading-relaxed bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3 overflow-x-auto whitespace-pre text-slate-700 dark:text-slate-300">
      {children}
    </pre>
  );
}

const snippetFetch = (url) => `fetch("${url}", {
  method: "POST", mode: "no-cors", keepalive: true,
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({ nombre, telefono, modalidad, origen, etapa,
                         fecha: new Date().toISOString() })
});`;

const snippetCurl = (url) => `curl -i -X POST "${url}" \\
  -H "Content-Type: text/plain;charset=utf-8" \\
  -d '{"nombre":"Prueba CRM","telefono":"5512345678","modalidad":"Virtual","origen":"prueba_curl"}'`;

// --- Alta / edición de una landing ---------------------------------------
const FORM_VACIO = { nombre: '', etapaInicial: 'PROSPECTO', dominios: '' };

function FuenteModal({ open, onClose, fuente }) {
  const guardar = useGuardarFuente();
  const [form, setForm] = useState(FORM_VACIO);
  const [err, setErr] = useState('');
  // Se reinicia el formulario cada vez que se abre (alta o edición).
  useEffect(() => {
    if (!open) return;
    setErr('');
    setForm(fuente
      ? { nombre: fuente.nombre, etapaInicial: fuente.etapaInicial, dominios: (fuente.dominiosPermitidos || []).join(', ') }
      : FORM_VACIO);
  }, [open, fuente]);
  const cerrar = onClose;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setErr('Ponle un nombre para reconocer de dónde vienen los leads.'); return; }
    try {
      await guardar.mutateAsync({
        id: fuente?.id,
        nombre: form.nombre.trim(),
        etapaInicial: form.etapaInicial,
        dominiosPermitidos: form.dominios,
      });
      cerrar();
    } catch (e2) { setErr(handleError(e2)); }
  };

  return (
    <Modal open={open} onClose={cerrar} title={fuente ? 'Editar landing' : 'Conectar una landing'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre de la landing*">
          <input className="input" autoFocus maxLength={80} placeholder='Ej. "Landing tarjeta QR"'
            value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <p className="text-xs text-slate-400 mt-1">Así verás de dónde llegó cada lead en tu CRM. Usa un nombre por sitio o formulario.</p>
        </Field>
        <Field label="Etapa en la que entran los leads">
          <select className="input" value={form.etapaInicial} onChange={(e) => setForm({ ...form, etapaInicial: e.target.value })}>
            {ETAPAS_SELECCIONABLES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </Field>
        <Field label="Dominios permitidos (opcional)">
          <input className="input" placeholder="milanding.com, www.otra.com"
            value={form.dominios} onChange={(e) => setForm({ ...form, dominios: e.target.value })} />
          <p className="text-xs text-slate-400 mt-1">Vacío = acepta envíos desde cualquier sitio. Si pones dominios, solo esos (y sus subdominios) pueden enviar leads.</p>
        </Field>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={cerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : fuente ? 'Guardar cambios' : 'Crear y obtener URL'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --- Confirmaciones (regenerar / eliminar) -------------------------------
function Confirmar({ open, onClose, titulo, children, accion, peligro, onConfirmar, cargando }) {
  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        {children}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className={peligro ? 'btn-danger' : 'btn-primary'} disabled={cargando} onClick={onConfirmar}>
            {cargando ? 'Procesando…' : accion}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- Tarjeta de una landing ----------------------------------------------
function TarjetaFuente({ f, onEditar, onRegenerar, onEliminar, onVerLeads }) {
  const guardar = useGuardarFuente();
  const [verCodigo, setVerCodigo] = useState(false);
  const url = urlCaptura(f.clave);
  const etapa = infoEtapa(f.etapaInicial);

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{f.nombre}</h3>
            <span className={`badge badge-dot ${f.activa
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
              {f.activa ? 'Recibiendo' : 'Pausada'}
            </span>
            {f.sinVer > 0 && (
              <span className="badge bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">{f.sinVer} nuevo{f.sinVer === 1 ? '' : 's'}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {!f.esMia && f.usuario && <>De {f.usuario.nombre} {f.usuario.apellidoP} · </>}
            Entran como <span className={etapa.text}>{etapa.label}</span>
            {f.dominiosPermitidos?.length > 0 && <> · solo {f.dominiosPermitidos.join(', ')}</>}
          </p>
        </div>
        {f.esMia && (
          <MenuAcciones small items={[
            { label: 'Editar nombre y opciones', onClick: () => onEditar(f) },
            { label: f.activa ? 'Pausar (dejar de recibir)' : 'Reanudar', onClick: () => guardar.mutate({ id: f.id, activa: !f.activa }) },
            { label: 'Regenerar URL…', onClick: () => onRegenerar(f) },
            'sep',
            { label: 'Eliminar landing…', danger: true, onClick: () => onEliminar(f) },
          ]} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <button type="button" onClick={() => onVerLeads(f.id)} className="rounded-lg bg-slate-50 dark:bg-slate-900/40 py-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition">
          <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{f.totalRecibidos}</p>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Leads recibidos</p>
        </button>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 py-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">{f.ultimoUsoEn ? fechaHora(f.ultimoUsoEn) : 'Aún no'}</p>
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mt-0.5">Último lead</p>
        </div>
      </div>

      {f.esMia && (
        <>
          <div>
            <p className="label mb-1">URL para tu landing</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-600 dark:text-slate-300" title={url}>{url}</code>
              <Copiar texto={url} />
            </div>
          </div>
          <button type="button" onClick={() => setVerCodigo((v) => !v)} className="text-xs font-medium text-brand-600 dark:text-brand-400 text-left hover:underline">
            {verCodigo ? 'Ocultar cómo conectarla' : 'Ver cómo conectarla (código y prueba)'}
          </button>
          {verCodigo && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Código para el formulario del sitio</p>
                  <Copiar texto={snippetFetch(url)} />
                </div>
                <Codigo>{snippetFetch(url)}</Codigo>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Prueba desde la terminal</p>
                  <Copiar texto={snippetCurl(url)} />
                </div>
                <Codigo>{snippetCurl(url)}</Codigo>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Campos: <b>nombre</b>, <b>telefono</b> (al menos uno), email, modalidad, origen, etapa, fecha.
                Cualquier otro campo que mande el sitio se guarda tal cual y lo ves en la ficha del lead.
                Si agregas un campo oculto <code>website</code> vacío, sirve de trampa contra bots.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Tabla de leads recibidos --------------------------------------------
const RESULTADOS = {
  CREADO: { label: 'Nuevo contacto', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' },
  DUPLICADO: { label: 'Volvió a escribir', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' },
  SPAM: { label: 'Spam', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
};

const waLink = (tel) => `https://wa.me/${String(tel).replace(/\D/g, '')}`;

function TablaLeads({ todos, fuentes, fuenteId, setFuenteId }) {
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState('');
  const { data, isLoading } = useLeadsRecibidos({ todos, fuenteId, resultado, pagina });
  const leads = data?.leads || [];

  return (
    <Card
      title="Leads recibidos"
      subtitle="Cada envío de formulario. Clic en una fila para abrir la ficha del contacto."
      actions={(
        <div className="flex gap-2">
          <select className="input w-auto text-sm py-1.5" value={fuenteId} onChange={(e) => { setFuenteId(e.target.value); setPagina(1); }}>
            <option value="">Todas las landings</option>
            {fuentes.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <select className="input w-auto text-sm py-1.5" value={resultado} onChange={(e) => { setResultado(e.target.value); setPagina(1); }}>
            <option value="">Sin spam</option>
            <option value="CREADO">Nuevos contactos</option>
            <option value="DUPLICADO">Volvieron a escribir</option>
            <option value="SPAM">Spam descartado</option>
          </select>
        </div>
      )}
    >
      {isLoading ? <EmptyState message="Cargando…" /> : leads.length === 0 ? (
        <EmptyState message="Todavía no llegan leads. Conecta una landing y haz una prueba desde tu celular." />
      ) : (
        <div className="-mx-5 -my-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="px-5 py-2.5 font-medium">Recibido</th>
                <th className="px-3 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium">Teléfono</th>
                <th className="px-3 py-2.5 font-medium">Modalidad</th>
                <th className="px-3 py-2.5 font-medium">Landing</th>
                {todos && <th className="px-3 py-2.5 font-medium">Asesor</th>}
                <th className="px-3 py-2.5 font-medium">Etapa</th>
                <th className="px-5 py-2.5 font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const r = RESULTADOS[l.resultado];
                const puedeAbrir = l.cliente && !l.cliente.archivadoEn;
                return (
                  <tr key={l.id}
                    onClick={() => puedeAbrir && navigate(`/clientes/${l.cliente.id}`)}
                    className={`border-b border-slate-50 dark:border-slate-700/50 ${puedeAbrir ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30' : ''}`}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums">{fechaHora(l.recibidoEn)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{l.nombre || '—'}</span>
                        {l.cliente?.leadSinVer && <span className="badge bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">Nuevo</span>}
                      </div>
                      {l.email && <p className="text-xs text-slate-400">{l.email}</p>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                      {l.telefono ? (
                        <a href={waLink(l.telefono)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-brand-600 dark:text-brand-400 hover:underline" title="Abrir WhatsApp">{l.telefono}</a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{l.modalidad || '—'}</td>
                    <td className="px-3 py-2.5"><span className="tag">{l.fuente?.nombre || 'Landing eliminada'}</span></td>
                    {todos && <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{l.fuente?.usuario ? `${l.fuente.usuario.nombre} ${l.fuente.usuario.apellidoP}` : '—'}</td>}
                    <td className="px-3 py-2.5">
                      {l.cliente ? <span className={`badge ${infoEtapa(l.cliente.estado).pill}`}>{infoEtapa(l.cliente.estado).label}</span> : '—'}
                    </td>
                    <td className="px-5 py-2.5"><span className={`badge ${r?.cls || ''}`}>{r?.label || l.resultado}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.paginas > 1 && (
            <div className="flex items-center justify-between px-5 py-3 text-sm text-slate-500">
              <span>{data.total} envíos · página {data.pagina} de {data.paginas}</span>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                <button className="btn-secondary text-xs" disabled={pagina >= data.paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// --- Página --------------------------------------------------------------
export default function LeadsLanding() {
  const { esAdmin } = useAuth();
  const [todos, setTodos] = useState(false);
  const { data: fuentes = [], isLoading } = useFuentesCaptura({ todos });
  const regenerar = useRegenerarClave();
  const eliminar = useEliminarFuente();
  const marcarVistos = useMarcarLeadsVistos();

  const [modal, setModal] = useState({ open: false, fuente: null });
  const [aRegenerar, setARegenerar] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [fuenteId, setFuenteId] = useState('');

  const mias = fuentes.filter((f) => f.esMia);
  const activas = mias.filter((f) => f.activa).length;
  const total = mias.reduce((s, f) => s + f.totalRecibidos, 0);
  const sinVer = mias.reduce((s, f) => s + f.sinVer, 0);

  const verLeads = (id) => {
    setFuenteId(id);
    document.getElementById('leads-recibidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Agrega tu sitio web</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Conecta tu landing o formulario: cada persona que lo llene entra sola a tu CRM, con el nombre del sitio del que vino.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin() && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mr-2">
              <input type="checkbox" checked={todos} onChange={(e) => { setTodos(e.target.checked); setFuenteId(''); }} />
              Ver todo el equipo
            </label>
          )}
          <button className="btn-primary" onClick={() => setModal({ open: true, fuente: null })}>+ Conectar landing</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi kpi-accent">
          <p className="kpi-label">Landings recibiendo</p>
          <p className="kpi-val tabular-nums">{activas}</p>
          <p className="kpi-note">{mias.length - activas > 0 ? `${mias.length - activas} en pausa` : 'de tus landings'}</p>
        </div>
        <div className="kpi kpi-green">
          <p className="kpi-label">Leads recibidos</p>
          <p className="kpi-val tabular-nums">{total}</p>
          <p className="kpi-note">en todas tus landings</p>
        </div>
        <div className={`kpi ${sinVer > 0 ? 'kpi-amber' : ''}`}>
          <p className="kpi-label">Nuevos sin ver</p>
          <p className="kpi-val tabular-nums">{sinVer}</p>
          <p className="kpi-note">
            {sinVer > 0
              ? <button className="text-brand-600 dark:text-brand-400 hover:underline" onClick={() => marcarVistos.mutate()}>Marcar todos como vistos</button>
              : 'al día'}
          </p>
        </div>
      </div>

      {isLoading ? <EmptyState message="Cargando…" /> : fuentes.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Aún no conectas ninguna landing</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Crea una (por ejemplo "Landing tarjeta QR"), copia su URL y pásala a quien hace tu sitio. Para cada sitio nuevo, crea otra con su propio nombre.
          </p>
          <button className="btn-primary mt-4" onClick={() => setModal({ open: true, fuente: null })}>+ Conectar mi primera landing</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {fuentes.map((f) => (
            <TarjetaFuente key={f.id} f={f}
              onEditar={(x) => setModal({ open: true, fuente: x })}
              onRegenerar={setARegenerar}
              onEliminar={setAEliminar}
              onVerLeads={verLeads} />
          ))}
        </div>
      )}

      <div id="leads-recibidos" className="scroll-mt-4">
        <TablaLeads todos={todos} fuentes={fuentes} fuenteId={fuenteId} setFuenteId={setFuenteId} />
      </div>

      <FuenteModal open={modal.open} fuente={modal.fuente} onClose={() => setModal({ open: false, fuente: null })} />

      <Confirmar open={!!aRegenerar} onClose={() => setARegenerar(null)} titulo="Regenerar URL"
        accion="Regenerar" cargando={regenerar.isPending}
        onConfirmar={async () => { await regenerar.mutateAsync(aRegenerar.id).catch(() => {}); setARegenerar(null); }}>
        <p>La URL actual de <b>{aRegenerar?.nombre}</b> dejará de funcionar <b>de inmediato</b>. Úsalo si alguien está mandando basura con ella.</p>
        <p>Después tendrás que pegar la URL nueva en la landing.</p>
      </Confirmar>

      <Confirmar open={!!aEliminar} onClose={() => setAEliminar(null)} titulo="Eliminar landing" peligro
        accion="Eliminar" cargando={eliminar.isPending}
        onConfirmar={async () => { await eliminar.mutateAsync(aEliminar.id).catch(() => {}); setAEliminar(null); setFuenteId(''); }}>
        <p>Se eliminará <b>{aEliminar?.nombre}</b> y su URL dejará de recibir leads.</p>
        <p>Los contactos que ya entraron se quedan en tu CRM. Si solo quieres detenerla un tiempo, mejor usa <b>Pausar</b>.</p>
      </Confirmar>
    </div>
  );
}
