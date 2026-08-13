import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotif } from '../context/NotifContext.jsx';
import { Card, EmptyState } from '../components/ui.jsx';
import { SECCIONES, SECCIONES_SENSIBLES, ROLES_LABEL, infoSeccion } from '../components/configuracion/secciones.js';

// Configuración = plano de control de acceso (RBAC por rol):
//   1) "Roles y accesos": política por rol, el único control de acceso.
//   2) Notificaciones push (panel existente, se conserva).
//   3) "Registro de cambios": bitácora de quién cambió qué y sobre quién.
// La edición es SOLO Súper Admin; el servidor la enforcea (403) además de la UI.

export default function Configuracion() {
  const { esSuperadmin, puede } = useAuth();
  const [tab, setTab] = useState('roles');

  const tabs = [
    { id: 'roles', label: 'Roles y accesos' },
    { id: 'notificaciones', label: 'Notificaciones' },
    { id: 'bitacora', label: 'Registro de cambios' },
  ];

  if (!puede('configuracion')) {
    return <div className="p-10 text-center text-slate-400">Sin acceso a configuración</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Configuración</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {esSuperadmin()
            ? 'Como Súper Administrador controlas el acceso de cada rol y las notificaciones.'
            : 'Consulta de accesos y notificaciones. Solo un Súper Administrador puede editar permisos.'}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'roles' && <RolesTab esSuperadmin={esSuperadmin()} />}
      {tab === 'notificaciones' && (
        <div className="space-y-4">
          <NotificacionesTab />
          <GoogleCalendarPanel />
        </div>
      )}
      {tab === 'bitacora' && <BitacoraTab />}
    </div>
  );
}

// ---------- Pestaña 1: política por rol ----------

function Toggle({ on, locked, onClick, title }) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`relative inline-flex h-[22px] w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-600'} ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[20px]' : 'left-[2px]'}`} />
    </button>
  );
}

function RolesTab({ esSuperadmin }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ['config-politicas'],
    queryFn: async () => (await api.get('/configuracion/politicas')).data,
  });
  const { data: usuarios } = useQuery({
    queryKey: ['config-usuarios'],
    queryFn: async () => (await api.get('/configuracion/usuarios')).data,
  });

  const conteo = useMemo(() => {
    const c = { ASESOR: 0, ADMIN: 0, SUPERADMIN: 0 };
    (usuarios || []).forEach((u) => { if (u.activo) c[u.rol] = (c[u.rol] || 0) + 1; });
    return c;
  }, [usuarios]);

  const cambiar = async (rol, seccion, permitido) => {
    const info = infoSeccion(seccion);
    if (SECCIONES_SENSIBLES.includes(seccion)) {
      const ok = window.confirm(`${permitido ? 'Dar' : 'Quitar'} acceso a "${info.label}" para TODOS los usuarios con rol ${ROLES_LABEL[rol]}. ¿Confirmas?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      await api.patch(`/configuracion/politicas/${rol}`, { seccion, permitido });
      qc.invalidateQueries(['config-politicas']);
      qc.invalidateQueries(['config-bitacora']);
    } catch (e) {
      alert(handleError(e));
    } finally {
      setSaving(false);
    }
  };

  const politicas = data?.politicas;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <span aria-hidden className="mt-0.5">⚠️</span>
        <p>
          Define aquí qué ve cada <b>rol</b>: cambiarlo afecta a todos los usuarios con ese rol.
          Para dar acceso de administración a una persona, cámbiale el rol en Asesores.
        </p>
      </div>

      <Card
        title="Acceso por rol"
        subtitle="El acceso de cada persona parte de su rol. El servidor valida cada permiso: sin política, el acceso se niega."
      >
        {!politicas ? <EmptyState message="Cargando políticas…" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-4 text-left">Rol</th>
                  {SECCIONES.map((s) => <th key={s.id} className="py-2 px-2 text-center" title={s.desc}>{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {['ASESOR', 'ADMIN', 'SUPERADMIN'].map((rol) => {
                  const bloqueado = rol === 'SUPERADMIN';
                  return (
                    <tr key={rol} className="border-b border-slate-50 dark:border-slate-700/60">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{ROLES_LABEL[rol]}</p>
                        <p className="text-xs text-slate-400">
                          {conteo[rol]} usuario(s) activo(s){bloqueado ? ' · acceso total, no editable' : ''}
                        </p>
                      </td>
                      {SECCIONES.map((s) => {
                        // Piso de rol: las secciones de administración no se
                        // conceden al rol Asesor (el servidor también lo niega).
                        const pisoAsesor = rol === 'ASESOR' && s.soloAdmin;
                        return (
                          <td key={s.id} className="py-3 px-2 text-center">
                            <Toggle
                              on={politicas[rol]?.[s.id] === true}
                              locked={bloqueado || pisoAsesor || !esSuperadmin || saving}
                              title={bloqueado ? 'El rol Súper Admin siempre tiene acceso total'
                                : pisoAsesor ? `${s.label}: sección de administración, requiere rol Admin`
                                : !esSuperadmin ? 'Solo un Súper Administrador puede editar' : s.desc}
                              onClick={() => cambiar(rol, s.id, !(politicas[rol]?.[s.id] === true))}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!esSuperadmin && <p className="mt-3 text-xs text-slate-400">Solo un Súper Administrador puede editar el acceso por rol.</p>}
      </Card>
    </div>
  );
}

// ---------- Google Calendar (2026-08): conexión self-service, por usuario ----------
// Cada quien conecta SU propia cuenta (como las push): no es configuración
// global de la promotoría. Al aceptar una invitación de acompañamiento, la
// cita se escribe en el Google Calendar de quien aceptó.
function GoogleCalendarPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // El callback de Google redirige aquí con ?google=ok|error&mensaje=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const estado = p.get('google');
    if (!estado) return;
    setMsg(p.get('mensaje') || (estado === 'ok' ? 'Cuenta conectada' : 'No se pudo conectar'));
    qc.invalidateQueries(['google-calendar-estado']);
    window.history.replaceState({}, '', window.location.pathname);
  }, [qc]);

  const { data: estado, isLoading } = useQuery({
    queryKey: ['google-calendar-estado'],
    queryFn: async () => (await api.get('/google-calendar/estado')).data,
  });

  const conectar = async () => {
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/google-calendar/conectar');
      window.location.href = data.url; // consentimiento en Google
    } catch (e) {
      setMsg(handleError(e));
      setBusy(false);
    }
  };

  const desconectar = async () => {
    if (!window.confirm('¿Desconectar tu Google Calendar? Las citas nuevas dejarán de escribirse ahí.')) return;
    setBusy(true); setMsg('');
    try {
      await api.delete('/google-calendar');
      setMsg('Cuenta desconectada');
      qc.invalidateQueries(['google-calendar-estado']);
    } catch (e) { setMsg(handleError(e)); } finally { setBusy(false); }
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Google Calendar</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Conecta tu cuenta para que los acompañamientos que aceptes se agenden automáticamente
        en tu Google Calendar. Antes de aceptar se revisa que tengas el espacio libre.
      </p>

      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !estado?.configurado ? (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/25 p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold mb-1">Falta configurar el servidor</p>
          <p>
            El administrador debe definir <span className="font-mono">GOOGLE_CLIENT_ID</span> y
            <span className="font-mono"> GOOGLE_CLIENT_SECRET</span> (Google Cloud → APIs y servicios →
            Credenciales, con la Google Calendar API activada) y agregar
            <span className="font-mono"> /api/google-calendar/callback</span> como URI de redirección autorizado.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Estado label="Conexión" valor={estado.conectado ? 'Conectada' : 'Sin conectar'} color={estado.conectado ? 'green' : 'slate'} />
            <Estado label="Cuenta" valor={estado.email || '—'} color="slate" />
          </div>
          <div className="flex flex-wrap gap-2">
            {estado.conectado ? (
              <button onClick={desconectar} disabled={busy} className="btn-secondary">Desconectar</button>
            ) : (
              <button onClick={conectar} disabled={busy} className="btn-primary">Conectar con Google</button>
            )}
          </div>
        </>
      )}

      {msg && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{msg}</p>}
    </Card>
  );
}

// ---------- Pestaña 2: notificaciones push (panel existente, se conserva) ----------

function NotificacionesTab() {
  const { status, subscription, error, subscribeUser, unsubscribeUser, sendTest } = useNotif();
  const { esAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const grant = async () => { setBusy(true); setMsg(''); const ok = await subscribeUser(); setMsg(ok ? 'Suscripción activa ✓' : (error || 'No se pudo suscribir')); setBusy(false); };
  const revoke = async () => { setBusy(true); setMsg(''); const ok = await unsubscribeUser(); setMsg(ok ? 'Des-suscrito' : 'Error al desuscribir'); setBusy(false); };
  const test = async () => { setBusy(true); setMsg(''); const ok = await sendTest(); setMsg(ok ? 'Prueba enviada — revisa el navegador' : (error || 'No se pudo enviar')); setBusy(false); };

  const activa = !!subscription;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Notificaciones push del navegador</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
        Recibe avisos de tus recordatorios programados en la ficha de cada cliente. Requiere que autorices notificaciones en este navegador.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Esto es solo el aviso del navegador o el celular: los mismos avisos
        quedan guardados en la campana de notificaciones del panel aunque la
        push no se entregue.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Estado label="Soporte" valor={status === 'unsupported' ? 'No soportado' : 'Soportado'} color={status === 'unsupported' ? 'red' : 'green'} />
        <Estado label="Permiso" valor={status === 'granted' ? 'Concedido' : status === 'denied' ? 'Bloqueado' : 'Pendiente'} color={status === 'granted' ? 'green' : status === 'denied' ? 'red' : 'amber'} />
        <Estado label="Suscripción" valor={activa ? 'Activa' : 'Inactiva'} color={activa ? 'green' : 'slate'} />
      </div>

      {/* Los botones reflejan el estado real: con suscripción activa se ofrece
          probar/desactivar; sin ella, solo activar. */}
      <div className="flex flex-wrap gap-2">
        {activa ? (
          <>
            <button onClick={test} disabled={busy} className="btn-secondary">Enviar prueba</button>
            <button onClick={revoke} disabled={busy} className="btn-secondary">Desactivar</button>
          </>
        ) : (
          <button onClick={grant} disabled={busy || status === 'unsupported' || status === 'denied'} className="btn-primary">Activar notificaciones</button>
        )}
      </div>

      {msg && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {status === 'denied' && <p className="mt-2 text-xs text-slate-400">Tienes el permiso bloqueado. Para revivirlo: en el navegador, abre la información del sitio → Permisos → Notificaciones → Permitir.</p>}

      {esAdmin() && (
        <div className="mt-5 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 text-xs text-slate-500 dark:text-slate-400">
          <p className="font-semibold mb-1">Cómo funciona el backend</p>
          <p>• Un job automático (cada 60s) revisa las <span className="font-mono">Notas</span> tipo <span className="font-mono">RECORDATORIO</span> con <span className="font-mono">fechaAviso</span> vencida y <span className="font-mono">notificacionEnviada=false</span>.</p>
          <p>• Cuando vence, guarda la notificación del asesor dueño de la nota (la que se ve en la campana) y luego intenta la push.</p>
          <p>• <span className="font-mono">notificacionEnviada=true</span> se marca al guardar esa notificación, no al entregar la push: si la push falla el aviso no se pierde, queda en la campana.</p>
          <p>• Lo mismo aplica a las invitaciones de acompañamiento y sus respuestas.</p>
        </div>
      )}
    </Card>
  );
}

function Estado({ label, valor, color }) {
  const colors = {
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  };
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
      <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>{valor}</span>
    </div>
  );
}

// ---------- Pestaña 3: bitácora ----------

function textoLog(l) {
  const d = l.detalle || {};
  const sec = d.seccion ? infoSeccion(d.seccion).label : '';
  switch (l.accion) {
    case 'ROL_POLITICA':
      return <>{d.ahora ? 'permitió' : 'bloqueó'} <b>{sec}</b> para el rol <b>{ROLES_LABEL[d.rol] || d.rol}</b></>;
    case 'EXCEPCION_USUARIO':
      if (d.ahora === null) return <>restableció <b>{sec}</b> de <b>{d.usuarioNombre}</b> (vuelve a heredar del rol)</>;
      return <>{d.ahora ? 'permitió' : 'bloqueó'} <b>{sec}</b> {d.ahora ? 'a' : 'para'} <b>{d.usuarioNombre}</b> (excepción)</>;
    case 'ROL_USUARIO':
      return <>cambió el rol de <b>{d.usuarioNombre}</b>: {ROLES_LABEL[d.antes] || d.antes} → <b>{ROLES_LABEL[d.ahora] || d.ahora}</b></>;
    case 'USUARIO_CREADO':
      return <>creó al usuario <b>{d.usuarioNombre}</b> con rol <b>{ROLES_LABEL[d.rol] || d.rol}</b></>;
    case 'USUARIO_ELIMINADO':
      return <>eliminó permanentemente al usuario <b>{d.usuarioNombre}</b></>;
    case 'INVITACION_CREADA':
      return <>generó un link de invitación para <b>{d.usuarioNombre}</b></>;
    case 'INVITACION_REDIMIDA':
      return <><b>{d.usuarioNombre}</b> activó su cuenta con la invitación</>;
    default:
      return <>{l.accion}</>;
  }
}

function cuando(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const dia = d.toDateString() === hoy.toDateString() ? 'Hoy'
    : d.toDateString() === ayer.toDateString() ? 'Ayer'
    : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `${dia}, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
}

function BitacoraTab() {
  const { data: logs } = useQuery({
    queryKey: ['config-bitacora'],
    queryFn: async () => (await api.get('/configuracion/bitacora')).data,
  });

  const exportar = () => {
    const filas = (logs || []).map((l) => [
      new Date(l.creadoEn).toISOString(),
      l.actorNombre,
      l.accion,
      JSON.stringify(l.detalle),
    ]);
    const csv = ['fecha,actor,accion,detalle', ...filas.map((f) => f.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bitacora-permisos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      title="Registro de cambios de permisos"
      subtitle="Quién cambió qué acceso, cuándo y sobre quién. Indispensable en control de acceso."
      actions={<button className="btn-secondary" onClick={exportar} disabled={!logs?.length}>Exportar</button>}
    >
      {!logs ? <EmptyState message="Cargando bitácora…" /> : logs.length === 0 ? (
        <EmptyState message="Aún no hay cambios registrados" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {logs.map((l) => (
            <li key={l.id} className="flex gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200"><b>{l.actorNombre}</b> {textoLog(l)}</p>
                <p className="text-xs text-slate-400">{cuando(l.creadoEn)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
