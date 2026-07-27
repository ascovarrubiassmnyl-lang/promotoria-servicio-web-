import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import ActividadView from '../components/actividad/ActividadView.jsx';

// Página de Actividad.
//  - Asesor: su propia línea de tiempo (el backend fuerza asesorId = su id).
//  - Promotor: actividad de todo el equipo, con selector de asesor.
export default function Actividad() {
  const { esAdmin, puede } = useAuth();
  const [asesorId, setAsesorId] = useState('');

  const { data: asesores } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin() && puede('asesores'),
  });

  return (
    <ActividadView
      asesorId={asesorId || null}
      scopeLabel={esAdmin() ? 'Vista promotora' : 'Tu actividad'}
      mostrarAsesor={esAdmin() && !asesorId}
      onLimpiar={esAdmin() ? () => setAsesorId('') : undefined}
      filtrosExtra={esAdmin() ? (
        <div>
          <label className="block text-xs uppercase text-slate-400 dark:text-slate-500 mb-1">Asesor</label>
          <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
            <option value="">Todos los asesores</option>
            {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
          </select>
        </div>
      ) : null}
    />
  );
}
