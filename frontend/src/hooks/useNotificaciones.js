import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Datos de la bandeja de notificaciones. Vive aparte de NotifContext, que se
// encarga del ciclo de vida del service worker / suscripción push del
// navegador — aquí solo son datos de servidor cacheados por react-query.
// La sección /notificaciones (con enlace de nav y campana con badge) se había
// eliminado el 2026-08-25 a favor de "Requiere tu atención" del Dashboard, y
// se restauró el 2026-09-25 (pedido explícito del usuario: la extrañó al
// crecer el volumen de invitaciones de citas con el nuevo sistema de
// invitados) — ambas siguen consumiendo la misma bandeja.
//
// No hay WebSockets en el proyecto, así que se refresca por polling ligero.
const INTERVALO_MS = 30000;

// Solo el conteo, para el badge de la campana de navegación (no la lista
// completa — evita traer páginas enteras solo para pintar un número).
export function useNoLeidas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notificaciones', 'no-leidas'],
    queryFn: async () => (await api.get('/notificaciones/no-leidas')).data.noLeidas,
    enabled: !!user,
    refetchInterval: INTERVALO_MS,
  });
}

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
