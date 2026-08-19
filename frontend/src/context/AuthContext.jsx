import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';
import { ROLES_ADMIN } from '../components/configuracion/secciones.js';

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

  // Redime un link de invitación (creado por un promotor en Asesores →
  // Equipo): la persona crea su contraseña aquí y confirma con Google solo
  // para verificar que el correo coincide con el del perfil ya creado. De
  // ahí en adelante entra siempre por /login con email + esa contraseña.
  const loginConInvitacion = async (token, credential, password) => {
    const { data } = await api.post(`/invitaciones/${token}/google`, { credential, password });
    localStorage.setItem('token', data.token);
    setUser(data.usuario);
    return data.usuario;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const esAdmin = () => ROLES_ADMIN.includes(user?.rol);
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
    <AuthContext.Provider value={{ user, loading, login, loginConInvitacion, logout, refresh, esAdmin, esSuperadmin, puede }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
