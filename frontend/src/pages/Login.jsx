import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { handleError } from '../api/client.js';

export default function Login() {
  const { login } = useAuth();
  const { tema, alternar } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const logoSrc = tema === 'dark' ? '/origen-blanco.png' : '/origen-negro.png';

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

  const fillDemo = (em) => { setEmail(em); setPassword(em === 'superadmin@demo.com' ? 'super123' : em === 'admin@demo.com' ? 'admin123' : 'asesor123'); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-700 dark:from-slate-900 dark:to-slate-800 p-4 relative">
      <button
        onClick={alternar}
        className="btn-secondary !px-3 !py-1.5 absolute top-4 right-4"
        title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        aria-label="alternar tema"
      >
        {tema === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="card w-full max-w-md p-8">
        <div className="flex justify-center mb-2">
          <img src={logoSrc} alt="Origen" className="h-20 w-auto object-contain" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">Inicia sesión para continuar</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <div className="mt-6 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 text-xs text-slate-500 dark:text-slate-400">
          <p className="font-semibold mb-1">Cuentas demo (carga el seed):</p>
          <button onClick={() => fillDemo('superadmin@demo.com')} className="block w-full text-left hover:text-brand-600 dark:hover:text-brand-400">superadmin@demo.com · super123</button>
          <button onClick={() => fillDemo('admin@demo.com')} className="block w-full text-left hover:text-brand-600 dark:hover:text-brand-400">admin@demo.com · admin123</button>
          <button onClick={() => fillDemo('asesor1@demo.com')} className="block w-full text-left hover:text-brand-600 dark:hover:text-brand-400">asesor1@demo.com · asesor123</button>
        </div>
      </div>
    </div>
  );
}
