import axios from 'axios';

// En producción (Railway, un solo servicio) la API vive en el mismo origen
// que el frontend, así que el default es la ruta relativa /api; en desarrollo
// Vite corre aparte del backend y el default apunta al puerto 4000.
const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');

export const api = axios.create({ baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Solo es "sesión expirada" si había un token que el servidor rechazó.
    // Peticiones anónimas (login, invitaciones) también pueden responder 401
    // por credenciales inválidas — eso lo debe mostrar la propia pantalla,
    // no una redirección forzada a /login que se traga el mensaje de error.
    const habiaSesion = !!localStorage.getItem('token');
    if (err.response?.status === 401 && habiaSesion) {
      localStorage.removeItem('token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const handleError = (err) => {
  const msg = err?.response?.data?.error || err?.message || 'Error desconocido';
  return msg;
};
