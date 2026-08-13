import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Datos de la campana de notificaciones. Vive aparte de NotifContext, que se
// encarga del ciclo de vida del service worker / suscripción push del
// navegador — aquí solo son datos de servidor cacheados por react-query.
//
// No hay WebSockets en el proyecto, así que el contador se refresca por
// polling ligero (GET /notificaciones/no-leidas solo hace un count()).
const INTERVALO_MS = 30000;

export function useNoLeidas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notificaciones', 'no-leidas'],
    queryFn: async () => (await api.get('/notificaciones/no-leidas')).data.noLeidas,
    enabled: !!user,
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
    initialData: 0,
  });
}

// La lista completa solo se pide cuando el panel está abierto.
export function useListaNotificaciones(abierto) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notificaciones', 'lista'],
    queryFn: async () => (await api.get('/notificaciones')).data,
    enabled: !!user && abierto,
  });
}

export function useMarcarLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.patch(`/notificaciones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useMarcarTodasLeidas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notificaciones/leer-todas'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}
