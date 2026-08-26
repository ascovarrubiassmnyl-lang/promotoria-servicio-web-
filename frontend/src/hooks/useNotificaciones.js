import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Datos de la bandeja de notificaciones. Vive aparte de NotifContext, que se
// encarga del ciclo de vida del service worker / suscripción push del
// navegador — aquí solo son datos de servidor cacheados por react-query.
// Único consumidor: el bloque "Requiere tu atención" del Dashboard
// (`pages/Dashboard.jsx`) — se eliminó la sección /notificaciones y su enlace
// de nav (campana), ver esa sección en CLAUDE.md. `GET /notificaciones/:id`
// y `/no-leidas` de la API siguen existiendo tal cual (self-service, sin
// cambios de servidor), solo cambió qué parte del frontend los consume.
//
// No hay WebSockets en el proyecto, así que se refresca por polling ligero.
const INTERVALO_MS = 30000;

// Lista paginada + conteos de la bandeja. `filtros` = { estado, tipo, pagina }.
export function useListaNotificaciones(filtros = {}) {
  const { user } = useAuth();
  const { estado = 'todas', tipo = null, pagina = 1 } = filtros;
  return useQuery({
    queryKey: ['notificaciones', 'lista', estado, tipo, pagina],
    queryFn: async () => {
      const params = { pagina };
      if (estado !== 'todas') params.estado = estado;
      if (tipo) params.tipo = tipo;
      return (await api.get('/notificaciones', { params })).data;
    },
    enabled: !!user,
    refetchInterval: INTERVALO_MS,
    placeholderData: (prev) => prev, // evita parpadeo al cambiar de página
  });
}

// Todas las mutaciones invalidan el árbol completo ['notificaciones'] para que
// la lista, los conteos y el badge del nav queden consistentes de una vez.
function useMutacionNotificacion(mutationFn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useMarcarLeida() {
  return useMutacionNotificacion(({ id, leida = true }) => api.patch(`/notificaciones/${id}`, { leida }));
}

export function useMarcarTodasLeidas() {
  return useMutacionNotificacion(() => api.patch('/notificaciones/leer-todas'));
}

export function useEliminarNotificacion() {
  return useMutacionNotificacion((id) => api.delete(`/notificaciones/${id}`));
}
