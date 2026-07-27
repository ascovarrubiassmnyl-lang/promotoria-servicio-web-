import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.usuario);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.usuario);
    return data.usuario;
  };

  // credential = ID token del botón de Google (GIS); el backend lo verifica
  // y responde igual que /login. Si la cuenta es nueva o está inactiva, el
  // backend responde 403 con {pendiente: true} y aquí solo se propaga.
  const loginConGoogle = async (credential) => {
    const { data } = await api.post('/auth/google', { credential });
    localStorage.setItem('token', data.token);
    setUser(data.usuario);
    return data.usuario;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const esAdmin = () => user?.rol === 'ADMIN' || user?.rol === 'SUPERADMIN';
  const esSuperadmin = () => user?.rol === 'SUPERADMIN';

  // Permisos por sección. `user.accesos` viene calculado del servidor en
  // /auth/login y /auth/me (excepción del usuario → política del rol →
  // denegar). El frontend NO re-deriva reglas: consume el mapa y falla
  // cerrado si no está. SUPERADMIN siempre tiene acceso total (anti-lockout).
  const puede = (seccion) => {
    if (!user) return false;
    if (user.rol === 'SUPERADMIN') return true;
    return user.accesos?.[seccion] === true;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginConGoogle, logout, refresh, esAdmin, esSuperadmin, puede }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
