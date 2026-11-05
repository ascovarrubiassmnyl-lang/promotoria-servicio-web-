import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';
import { ROLES_ADMIN } from '../components/configuracion/secciones.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // No se pudo confirmar la sesión por un problema de red o del servidor (no
  // porque el token sea inválido): se conserva el token y se ofrece reintentar.
  const [sinConexion, setSinConexion] = useState(false);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setUser(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.usuario);
      setSinConexion(false);
    } catch (err) {
      // Solo un 401 significa que la sesión ya no vale (el interceptor ya
      // borró el token). Antes cualquier falla —abrir la app instalada sin
      // señal, o justo durante un deploy en Railway— borraba el token y
      // sacaba a la persona aunque su sesión siguiera vigente.
      if (err?.response?.status === 401) {
        localStorage.removeItem('token');
        setSinConexion(false);
      } else {
        setSinConexion(true);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setSinConexion(false);
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

  // Ambas cierran las sesiones de los demás dispositivos en el servidor y
  // devuelven un token nuevo para ESTE, que se guarda para no salir de aquí.
  const cambiarPassword = async (actual, nueva) => {
    const { data } = await api.post('/auth/cambiar-password', { actual, nueva });
    localStorage.setItem('token', data.token);
  };
  const cerrarOtrasSesiones = async () => {
    const { data } = await api.post('/auth/cerrar-otras-sesiones');
    localStorage.setItem('token', data.token);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setSinConexion(false);
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
    <AuthContext.Provider value={{ user, loading, sinConexion, login, loginConInvitacion, cambiarPassword, cerrarOtrasSesiones, logout, refresh, esAdmin, esSuperadmin, puede }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
