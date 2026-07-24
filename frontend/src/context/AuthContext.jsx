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

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const esAdmin = () => user?.rol === 'ADMIN' || user?.rol === 'SUPERADMIN';
  const esSuperadmin = () => user?.rol === 'SUPERADMIN';

  // Permisos por sección. Devuelve true si el usuario puede ver la sección.
  // Reglas por rol (default si no hay override):
  //   dashboard, clientes, citas, ventas, actividad → todos
  //   asesores, configuracion, metas → solo ADMIN/SUPERADMIN
  // Override: user.permisos[seccion] === false bloquea explícitamente.
  const puede = (seccion) => {
    if (!user) return false;
    const perms = user.permisos && typeof user.permisos === 'object' && !Array.isArray(user.permisos) ? user.permisos : {};
    if (perms[seccion] === false) return false;
    const adminOnly = ['asesores', 'configuracion', 'metas'];
    if (adminOnly.includes(seccion) && !esAdmin()) return false;
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, esAdmin, esSuperadmin, puede }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
