import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { soportaWebGL, Silencioso } from '../components/decor/util3d.jsx';
import BotonGoogle from '../components/login/BotonGoogle.jsx';

// El 3D es decorativo, igual que en Login (lazy + WebGL, nunca bloquea).
const LoginScene = lazy(() => import('../components/login/LoginScene.jsx'));

// Página pública (fuera de ProtectedRoute) para redimir el link de un solo
// uso que un promotor genera en Asesores → Equipo. No hay registro abierto:
// esta pantalla solo activa una cuenta que ya existe, y solo si el correo de
// Google coincide exactamente con el del token.
export default function Invitacion() {
  const { token } = useParams();
  const { loginConInvitacion } = useAuth();
  const navigate = useNavigate();
  const [estado, setEstado] = useState('cargando'); // cargando | valida | invalida
  const [invitado, setInvitado] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [conWebGL] = useState(soportaWebGL);

  const passwordCorta = password.length > 0 && password.length < 6;
  const passwordNoCoincide = confirmar.length > 0 && password !== confirmar;
  const passwordValida = password.length >= 6 && password === confirmar;

  useEffect(() => {
    let activo = true;
    api.get(`/invitaciones/${token}`)
      .then(({ data }) => { if (activo) { setInvitado(data); setEstado('valida'); } })
      .catch((err) => {
        if (!activo) return;
        setError(err?.response?.data?.error || 'Este enlace de invitación no es válido.');
        setEstado('invalida');
      });
    return () => { activo = false; };
  }, [token]);

  const conGoogle = async (credential) => {
    setError('');
    try {
      await loginConInvitacion(token, credential, password);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo confirmar tu acceso.');
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(120% 120% at 50% 20%, #131a52, #070a24)' }}
    >
      {conWebGL && (
        <div className="absolute inset-0" aria-hidden="true">
          <Silencioso>
            <Suspense fallback={null}>
              <LoginScene />
            </Suspense>
          </Silencioso>
        </div>
      )}

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-indigo-300/20 bg-slate-900/70 backdrop-blur-xl p-8 shadow-2xl shadow-black/40 text-center">
        <div className="flex justify-center mb-2">
          <img src="/origen-blanco.png" alt="Origen" className="h-20 w-auto object-contain" />
        </div>

        {estado === 'cargando' && <p className="text-sm text-slate-400 mt-4">Verificando invitación…</p>}

        {estado === 'invalida' && (
          <>
            <p className="text-sm text-slate-300 mt-4">{error}</p>
            <p className="mt-2 text-xs text-slate-500">Pide a tu promotor que te comparta un enlace nuevo.</p>
          </>
        )}

        {estado === 'valida' && (
          <>
            <p className="text-sm text-slate-400 mt-2">Hola, {invitado.nombre}</p>
            <p className="mt-1 text-xs text-slate-500">
              Crea tu contraseña y confirma con la cuenta de Google de{' '}
              <b className="text-slate-300">{invitado.email}</b> para activar tu cuenta.
            </p>

            <div className="mt-4 space-y-3 text-left">
              <div>
                <label htmlFor="inv-password" className="block text-sm font-medium text-slate-200 mb-1">Contraseña</label>
                <input
                  id="inv-password"
                  type="password"
                  className="w-full rounded-lg border border-indigo-300/20 bg-white/5 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label htmlFor="inv-confirmar" className="block text-sm font-medium text-slate-200 mb-1">Confirmar contraseña</label>
                <input
                  id="inv-confirmar"
                  type="password"
                  className="w-full rounded-lg border border-indigo-300/20 bg-white/5 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                />
              </div>
              {passwordCorta && <p className="text-xs text-amber-400">La contraseña debe tener al menos 6 caracteres.</p>}
              {passwordNoCoincide && <p className="text-xs text-amber-400">Las contraseñas no coinciden.</p>}
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            )}

            {passwordValida ? (
              <BotonGoogle onCredential={conGoogle} caption="El correo de Google debe coincidir con el de tu invitación." />
            ) : (
              <p className="mt-5 text-center text-xs text-slate-500">Completa tu contraseña para continuar con Google.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
