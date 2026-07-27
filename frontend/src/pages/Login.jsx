import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { handleError } from '../api/client.js';
import { soportaWebGL, Silencioso } from '../components/decor/util3d.jsx';

// El 3D es decorativo y nunca bloquea el formulario: se carga con lazy
// (code-split, three no entra al bundle inicial) y solo si hay WebGL; si el
// chunk falla o el render truena, el ErrorBoundary deja el gradiente CSS.
const LoginScene = lazy(() => import('../components/login/LoginScene.jsx'));

const DEMOS = [
  ['superadmin@demo.com', 'super123'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [conWebGL] = useState(soportaWebGL);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  // El login es de tema oscuro fijo (sin toggle): estilos explícitos, sin
  // variantes dark: que dependan de la clase del <html>.
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

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-indigo-300/20 bg-slate-900/70 backdrop-blur-xl p-8 shadow-2xl shadow-black/40">
        <div className="flex justify-center mb-2">
          <img src="/origen-blanco.png" alt="Origen" className="h-20 w-auto object-contain" />
        </div>
        <p className="text-sm text-slate-400 mt-2 text-center">Inicia sesión para continuar</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-200 mb-1">Email</label>
            <input
              id="login-email"
              type="email"
              className="w-full rounded-lg border border-indigo-300/20 bg-white/5 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="tu@correo.com"
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-200 mb-1">Contraseña</label>
            <div className="relative">
              <input
                id="login-password"
                type={verPassword ? 'text' : 'password'}
                className="w-full rounded-lg border border-indigo-300/20 bg-white/5 px-3 py-2 pr-11 text-slate-100 placeholder-slate-500 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300"
                aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={verPassword}
              >
                {verPassword ? (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A9.9 9.9 0 0 1 12 4c6.5 0 10 7 10 7a19.9 19.9 0 0 1-3.22 4.31" />
                    <path d="m1 1 22 22" />
                  </svg>
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="2.6" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-6 rounded-lg border border-indigo-300/15 bg-white/5 p-3 text-xs text-slate-400">
            <p className="font-semibold mb-1 flex items-center gap-2">
              Cuentas demo
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-400">SOLO DESARROLLO</span>
            </p>
            {DEMOS.map(([em, pw]) => (
              <button
                key={em}
                type="button"
                onClick={() => { setEmail(em); setPassword(pw); }}
                className="block w-full text-left font-mono tabular-nums hover:text-brand-400"
              >
                <b className="font-semibold text-slate-300">{em}</b> · {pw}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
