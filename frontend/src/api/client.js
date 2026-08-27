import axios from 'axios';

// En producción (Railway, un solo servicio) la API vive en el mismo origen
// que el frontend, así que el default es la ruta relativa /api; en desarrollo
// Vite corre aparte del backend y el default apunta al puerto 4000.
const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');

// 15 s es el techo razonable para una consulta normal (listados, PATCH): si
// tarda más, algo está mal y conviene avisar. NO aplica a subir archivos ni al
// análisis con IA, que legítimamente tardan más — esos pasan su propio
// `timeout` por petición (ver constantes de abajo). Con el default global el
// asesor veía "timeout of 15000ms exceeded" en medio de un análisis que del
// lado del servidor seguía corriendo bien.
export const api = axios.create({ baseURL, timeout: 15000 });

// Subir un archivo de hasta 35 MB desde datos móviles puede tomar minutos: el
// límite aquí es la conexión del asesor, no el servidor.
export const TIMEOUT_SUBIDA = 120000;

// Subida + análisis con Gemini. Debe quedar POR ENCIMA del presupuesto del
// servidor (GEMINI_TIMEOUT_MS, 150 s por default en
// backend/src/services/extraccionPoliza.js) para que quien corte sea el
// backend, que sí sabe por qué falló y responde un mensaje accionable.
export const TIMEOUT_ANALISIS = 240000;

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
        // La sesión venció (o el token dejó de ser válido). Se avisa en la
        // pantalla de login en lenguaje llano: el usuario no debe ver nunca
        // el error crudo del servidor ("Token no proporcionado").
        sessionStorage.setItem('sesionExpirada', '1');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const handleError = (err) => {
  // Los errores de token son de mecánica interna: al usuario se le dice que
  // su sesión venció (el interceptor ya lo mandó a /login), nunca el texto
  // crudo del servidor.
  if (err?.response?.status === 401) {
    return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  }
  // Los errores de transporte de axios llegan en inglés y con milisegundos
  // ("timeout of 15000ms exceeded"): no le dicen nada al asesor ni le sugieren
  // qué hacer.
  if (err?.code === 'ECONNABORTED') {
    return 'La operación tardó demasiado y se canceló. Revisa tu conexión e inténtalo de nuevo.';
  }
  if (err?.code === 'ERR_NETWORK') {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  const msg = err?.response?.data?.error || err?.message || 'Error desconocido';
  return msg;
};
