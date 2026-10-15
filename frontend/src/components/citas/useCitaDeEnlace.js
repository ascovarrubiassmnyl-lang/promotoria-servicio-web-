import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, handleError } from '../../api/client.js';
import { avisar } from '../../lib/toast.js';

// Enlace directo a una cita (2026-10-15): /citas?cita=<id>. Lo usan las
// notificaciones (campana, push y "Hoy") para abrir la ficha de la cita en su
// fecha. Antes todas llevaban a /citas a secas y el invitado tenía que buscar
// el evento a mano — si caía en otra semana, no lo veía y no respondía.
// `abrir(cita)` recibe la cita completa (GET /citas/:id, mismo alcance por rol
// que el listado) y decide cómo mostrarla (escritorio o móvil). El parámetro
// se quita de la URL al terminar para que recargar no la vuelva a abrir.
export default function useCitaDeEnlace(abrir) {
  const [params, setParams] = useSearchParams();
  const citaId = params.get('cita');

  useEffect(() => {
    if (!citaId) return;
    api.get(`/citas/${citaId}`)
      .then(({ data }) => abrir(data))
      .catch((e) => avisar(e?.response?.status === 404 ? 'Esa cita ya no existe.' : handleError(e), 'error'))
      .finally(() => {
        const siguiente = new URLSearchParams(params);
        siguiente.delete('cita');
        setParams(siguiente, { replace: true });
      });
  }, [citaId]); // eslint-disable-line react-hooks/exhaustive-deps
}
