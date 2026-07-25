import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../../api/client.js';
import PolicyList from './PolicyList.jsx';
import PolicyDetail from './PolicyDetail.jsx';
import PolizaFormModal from './PolizaFormModal.jsx';

// Vista de pólizas compartida por ambos roles.
//  - asesorId=null  → cartera propia del usuario autenticado (asesor).
//  - asesorId=X     → cartera del asesor X (promotor, control total; las
//    pólizas nuevas se asignan a ese asesor). readOnly=true la vuelve consulta.
// La autorización real vive en el backend: un ASESOR siempre recibe solo sus
// pólizas aunque manipule el parámetro asesorId.
export default function PolizasView({ asesorId = null, readOnly = false, titulo = 'Pólizas', subtitulo, breadcrumbs = null, banner = null }) {
  const qc = useQueryClient();
  const [polizaSel, setPolizaSel] = useState(null); // id de póliza abierta en detalle
  const [formOpen, setFormOpen] = useState(false);
  const [ventaEdit, setVentaEdit] = useState(null);

  const { data: ventas, isLoading } = useQuery({
    queryKey: ['ventas', asesorId || 'self'],
    queryFn: async () => (await api.get('/ventas', { params: { asesorId: asesorId || undefined } })).data,
  });

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar la póliza "${p.producto}" de ${p.cliente?.nombre || ''} ${p.cliente?.apellidoP || ''}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/ventas/${p.id}`);
      qc.invalidateQueries(['ventas']);
      qc.invalidateQueries(['equipo-resumen']);
      setPolizaSel(null);
    } catch (e) { alert(handleError(e)); }
  };

  return (
    <div className="space-y-4">
      {breadcrumbs}
      {!polizaSel && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{titulo}</h2>
              {subtitulo && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitulo}</p>}
            </div>
            {!readOnly && (
              <button onClick={() => { setVentaEdit(null); setFormOpen(true); }} className="btn-primary">+ Nueva póliza</button>
            )}
          </div>
          {banner}
          <PolicyList ventas={ventas} loading={isLoading} onOpen={(v) => setPolizaSel(v.id)} />
        </>
      )}

      {polizaSel && (
        <>
          {banner}
          <PolicyDetail
            polizaId={polizaSel}
            readOnly={readOnly}
            onBack={() => setPolizaSel(null)}
            onEditar={(p) => { setVentaEdit(p); setFormOpen(true); }}
            onEliminar={eliminar}
          />
        </>
      )}

      {!readOnly && (
        <PolizaFormModal open={formOpen} onClose={() => setFormOpen(false)} venta={ventaEdit} asesorId={asesorId} />
      )}
    </div>
  );
}
