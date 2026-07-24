import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, handleError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotif } from '../context/NotifContext.jsx';
import { Card, Badge, EmptyState } from '../components/ui.jsx';

// Secciones controlables por permiso. Se muestran SI:
//   • El rol permitiría verla (admins ven casi todo, asesores ven sus secciones)
//   • AND (permisos[seccion] !== false)
const SECCIONES = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Panel principal con métricas' },
  { id: 'clientes', label: 'Clientes', desc: 'Listado y ficha de clientes' },
  { id: 'citas', label: 'Citas / Calendario', desc: 'Agenda personal o general' },
  { id: 'ventas', label: 'Ventas', desc: 'Polizas vendidas y comisiones' },
  { id: 'actividad', label: 'Actividad', desc: 'Bitácora de acciones' },
  { id: 'metas', label: 'Metas', desc: 'Targets mensuales' },
  { id: 'asesores', label: 'Asesores', desc: 'Gestión del equipo (solo admin/promotor)' },
  { id: 'configuracion', label: 'Configuración', desc: 'Permisos del sistema (solo admin/promotor)' },
];

export default function Configuracion() {
  const { esAdmin, esSuperadmin, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('permisos');

  const { data: usuarios } = useQuery({
    queryKey: ['usuarios', 'config'],
    queryFn: async () => (await api.get('/usuarios')).data,
  });

  const tabs = [
    { id: 'permisos', label: 'Permisos por usuario' },
    { id: 'notificaciones', label: 'Notificaciones push' },
  ];

  if (!esAdmin()) {
    return <div className="p-10 text-center text-slate-400">Sin acceso a configuración</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Configuración</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {esSuperadmin() ? 'Como Súper Administrador puedes controlar accesos y notificaciones.' : 'Como Promotor puedes controlar accesos de tus asesores.'}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'permisos' && (
        <PermisosTab usuarios={usuarios || []} qc={qc} esSuperadmin={esSuperadmin()} yoId={user?.id} />
      )}
      {tab === 'notificaciones' && <NotificacionesTab />}
    </div>
  );
}

function PermisosTab({ usuarios, qc, esSuperadmin, yoId }) {
  const [savingId, setSavingId] = useState(null);

  const togglePermiso = async (usuario, seccionId, valorActual) => {
    setSavingId(usuario.id);
    const permsActual = usuario.permisos && typeof usuario.permisos === 'object' && !Array.isArray(usuario.permisos) ? usuario.permisos : {};
    const nuevo = { ...permsActual };
    // Si valorActual es false → pasa a true (eliminar override, heredar). Si true → false.
    if (valorActual === false) delete nuevo[seccionId];
    else nuevo[seccionId] = false;
    try {
      await api.patch(`/usuarios/${usuario.id}`, { permisos: Object.keys(nuevo).length ? nuevo : null });
      qc.invalidateQueries(['usuarios']);
    } catch (e) {
      alert(handleError(e));
    } finally {
      setSavingId(null);
    }
  };

  if (!usuarios || usuarios.length === 0) return <Card><EmptyState message="Sin usuarios" /></Card>;

  return (
    <Card>
      <div className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Casilla <span className="font-semibold">marcada</span> = acceso habilitado (o sin override, hereda del rol).
        Casilla <span className="font-semibold">desmarcada</span> = explícitamente bloqueado para esta persona.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-4 sticky left-0 bg-white dark:bg-slate-800">Usuario / Sección</th>
              {SECCIONES.map((s) => <th key={s.id} className="py-2 px-2 text-center" title={s.desc}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const perms = u.permisos && typeof u.permisos === 'object' && !Array.isArray(u.permisos) ? u.permisos : {};
              const esAdminU = u.rol === 'ADMIN' || u.rol === 'SUPERADMIN';
              const yo = u.id === yoId;
              return (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-700/60 align-middle">
                  <td className="py-2 pr-4 sticky left-0 bg-white dark:bg-slate-800">
                    <p className="font-medium text-slate-700 dark:text-slate-300">{u.nombre} {u.apellidoP} {yo ? '(tú)' : ''}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge color={u.rol === 'SUPERADMIN' ? 'red' : u.rol === 'ADMIN' ? 'blue' : 'slate'}>{u.rol}</Badge>
                      {!u.activo && <Badge color="red">inactivo</Badge>}
                    </div>
                  </td>
                  {SECCIONES.map((s) => {
                    // Reglas: asesores/configuracion y metas requieren admin salvo deshabilitar.
                    // Bloqueado por override explícito → desmarcado.
                    const override = perms[s.id];
                    const checked = override !== false;
                    const soloAdmin = s.id === 'asesores' || s.id === 'configuracion';
                    const readonlyRol = !esSuperadmin && u.rol === 'SUPERADMIN'; // no se puede tocar un superadmin
                    return (
                      <td key={s.id} className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          disabled={!!savingId || readonlyRol}
                          checked={checked}
                          onChange={() => togglePermiso(u, s.id, override)}
                          title={soloAdmin && !esAdminU ? 'Disponible solo para admins' : (override === false ? 'Bloqueado (override)' : 'Heredado del rol')}
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
      {!esSuperadmin && <p className="mt-3 text-xs text-slate-400">Nota: solo un Súper Administrador puede editar permisos de cuentas Administrador/Súper Admin.</p>}
    </Card>
  );
}

function NotificacionesTab() {
  const { status, subscription, error, subscribeUser, unsubscribeUser, sendTest } = useNotif();
  const { esAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const grant = async () => { setBusy(true); setMsg(''); const ok = await subscribeUser(); setMsg(ok ? 'Suscripción activa ✓' : (error || 'No se pudo suscribir')); setBusy(false); };
  const revoke = async () => { setBusy(true); setMsg(''); const ok = await unsubscribeUser(); setMsg(ok ? 'Des-suscrito' : 'Error al desuscribir'); setBusy(false); };
  const test = async () => { setBusy(true); setMsg(''); const ok = await sendTest(); setMsg(ok ? 'Prueba enviada — revisa el navegador' : (error || 'No se pudo enviar')); setBusy(false); };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Notificaciones push del navegador</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Recibe avisos de tus recordatorios programados en la ficha de cada cliente. Requiere que autorices notificaciones en este navegador.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Estado label="Soporte" valor={status === 'unsupported' ? 'No soportado' : 'Soportado'} color={status === 'unsupported' ? 'red' : 'green'} />
        <Estado label="Permiso" valor={status === 'granted' ? 'Concedido' : status === 'denied' ? 'Bloqueado' : 'Pendiente'} color={status === 'granted' ? 'green' : status === 'denied' ? 'red' : 'amber'} />
        <Estado label="Suscripción" valor={subscription ? 'Activa' : 'Inactiva'} color={subscription ? 'green' : 'slate'} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={grant} disabled={busy || status === 'unsupported' || status === 'denied'} className="btn-primary">Activar notificaciones</button>
        <button onClick={test} disabled={busy || !subscription} className="btn-secondary">Enviar prueba</button>
        <button onClick={revoke} disabled={busy || !subscription} className="btn-secondary">Desactivar</button>
      </div>

      {msg && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {status === 'denied' && <p className="mt-2 text-xs text-slate-400">Tienes el permiso bloqueado. Para revivirlo: en el navegador, abre la información del sitio → Permisos → Notificaciones → Permitir.</p>}

      {esAdmin() && (
        <div className="mt-5 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 text-xs text-slate-500 dark:text-slate-400">
          <p className="font-semibold mb-1">Cómo funciona el backend</p>
          <p>• Un job automático (cada 60s) revisa las <span className="font-mono">Notas</span> tipo <span className="font-mono">RECORDATORIO</span> con <span className="font-mono">fechaAviso</span> vencida y <span className="font-mono">notificacionEnviada=false</span>.</p>
          <p>• Cuando vence, envía una push al asesor dueño de la nota y marca <span className="font-mono">notificacionEnviada=true</span>.</p>
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
