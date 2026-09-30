import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Datos de "Agrega tu sitio web" (leads de landing pages) (backend: routes/fuentesCaptura.js).
// Una "fuente" = una landing / formulario conectado, con el nombre que el
// usuario le ponga. El alcance lo decide el servidor: cada quien lo suyo, y un
// promotor puede pedir `todos` (solo lectura de lo ajeno).

// URL pública que se pega en la landing. En producción la API vive en el mismo
// origen (/api); en desarrollo apunta al backend de :4000.
export function urlCaptura(clave) {
  const base = new URL(api.defaults.baseURL, window.location.origin).href.replace(/\/$/, '');
  return `${base}/captura/${clave}`;
}

export function useFuentesCaptura({ todos = false } = {}) {
  return useQuery({
    queryKey: ['fuentes-captura', 'lista', todos],
    queryFn: async () => (await api.get('/fuentes-captura', { params: todos ? { todos: 1 } : {} })).data,
  });
}

export function useLeadsRecibidos({ todos = false, fuenteId = '', resultado = '', pagina = 1 } = {}) {
  return useQuery({
    queryKey: ['fuentes-captura', 'leads', todos, fuenteId, resultado, pagina],
    queryFn: async () => {
      const params = { pagina };
      if (todos) params.todos = 1;
      if (fuenteId) params.fuenteId = fuenteId;
      if (resultado) params.resultado = resultado;
      return (await api.get('/fuentes-captura/leads', { params })).data;
    },
    placeholderData: (prev) => prev, // evita parpadeo al cambiar de página
    refetchInterval: 60000,
  });
}

// Conteo para el badge del menú: leads propios que el dueño no ha abierto.
export function useLeadsSinVer() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['fuentes-captura', 'sin-ver'],
    queryFn: async () => (await api.get('/fuentes-captura/sin-ver')).data.total,
    enabled: !!user,
    refetchInterval: 60000,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['fuentes-captura'] });
    qc.invalidateQueries({ queryKey: ['clientes'] });
  };
}

export function useGuardarFuente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, ...data }) => (
      id ? (await api.patch(`/fuentes-captura/${id}`, data)).data : (await api.post('/fuentes-captura', data)).data
    ),
    onSuccess: invalidar,
  });
}

export function useRegenerarClave() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id) => (await api.post(`/fuentes-captura/${id}/regenerar`)).data,
    onSuccess: invalidar,
  });
}

export function useEliminarFuente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id) => (await api.delete(`/fuentes-captura/${id}`)).data,
    onSuccess: invalidar,
  });
}

export function useMarcarLeadsVistos() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async () => (await api.patch('/fuentes-captura/sin-ver')).data,
    onSuccess: invalidar,
  });
}
