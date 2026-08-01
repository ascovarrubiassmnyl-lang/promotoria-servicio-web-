import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, handleError } from '../api/client.js';
import { Modal, EmptyState, MenuAcciones } from '../components/ui.jsx';
import CandidatoFormModal from '../components/candidatos/CandidatoFormModal.jsx';
import { ETAPAS_CANDIDATO, infoEtapaCandidato, SEMAFOROS, infoSemaforo } from '../components/candidatos/tipos.js';
import { fechaCorta, hora } from '../lib/format.js';

// CRM de candidatos a asesor (reclutamiento de la promotora). Solo
// ADMIN/SUPERADMIN llegan aquí (sección RBAC `candidatos` con piso de rol).
export default function Candidatos() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [etapaActiva, setEtapaActiva] = useState(null);
  const [semaforoActivo, setSemaforoActivo] = useState(null);
  const [verArchivados, setVerArchivados] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [toArchive, setToArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);

  // q se filtra en servidor; los chips de etapa/semáforo filtran en cliente
  // para poder mostrar los conteos de todos a la vez (mismo patrón que Clientes).
  const { data: candidatos, refetch } = useQuery({
    queryKey: ['candidatos', q, verArchivados],
    queryFn: async () => {
      const params = {};
      if (q) params.q = q;
      if (verArchivados) params.archivados = '1';
      return (await api.get('/candidatos', { params })).data;
    },
  });

  const conteos = useMemo(() => {
    const m = { etapa: {}, semaforo: {} };
    for (const c of candidatos || []) {
      m.etapa[c.etapa] = (m.etapa[c.etapa] || 0) + 1;
      m.semaforo[c.semaforo] = (m.semaforo[c.semaforo] || 0) + 1;
    }
    return m;
  }, [candidatos]);

  const filas = useMemo(() => {
    let r = candidatos || [];
    if (etapaActiva) r = r.filter((c) => c.etapa === etapaActiva);
    if (semaforoActivo) r = r.filter((c) => c.semaforo === semaforoActivo);
    return r;
  }, [candidatos, etapaActiva, semaforoActivo]);

  const confirmarArchivar = async () => {
    if (!toArchive) return;
    setArchiving(true);
    try {
      await api.delete(`/candidatos/${toArchive.id}`);
      setToArchive(null);
      qc.invalidateQueries(['candidatos']);
    } catch (e) { alert(handleError(e)); } finally { setArchiving(false); }
  };

  const restaurar = async (c) => {
    try {
      await api.patch(`/candidatos/${c.id}`, { archivado: false });
      qc.invalidateQueries(['candidatos']);
    } catch (e) { alert(handleError(e)); }
  };

  const chipBase = 'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition bg-white dark:bg-slate-800';
  const chipOff = 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Candidatos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {filas.length} candidato{filas.length === 1 ? '' : 's'} · reclutamiento de asesores
            {verArchivados && ' · archivados'}
          </p>
        </div>
        <button onClick={() => { setEditando(null); setOpenForm(true); }} className="btn-primary">+ Nuevo candidato</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className="input flex-1 min-w-[220px]" placeholder="Buscar por nombre, teléfono, email, fuente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 cursor-pointer">
          <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
          Ver archivados
        </label>
      </div>

      {/* Chips de etapa = el filtro (con conteo), mismo patrón que Clientes. */}
      <div className="flex flex-wrap gap-2">
        {ETAPAS_CANDIDATO.map((e) => (
          <button
            key={e.value}
            onClick={() => setEtapaActiva(etapaActiva === e.value ? null : e.value)}
            className={`${chipBase} ${etapaActiva === e.value ? `ring-2 ${e.chipOn} border-transparent ${e.text}` : chipOff}`}
          >
            <span className={`w-2 h-2 rounded-full ${e.dot}`} />
            {e.label}
            <span className="text-xs text-slate-400">{conteos.etapa[e.value] || 0}</span>
          </button>
        ))}
        <span className="mx-1 border-l border-slate-200 dark:border-slate-700" />
        {Object.values(SEMAFOROS).map((s) => (
          <button
            key={s.value}
            onClick={() => setSemaforoActivo(semaforoActivo === s.value ? null : s.value)}
            className={`${chipBase} ${semaforoActivo === s.value ? `ring-2 ${s.chipOn} border-transparent` : chipOff}`}
          >
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {s.label}
            <span className="text-xs text-slate-400">{conteos.semaforo[s.value] || 0}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {filas.length === 0 ? (
          <EmptyState message={candidatos?.length ? 'Ningún candidato coincide con el filtro' : 'Sin candidatos aún. Registra al primero con "+ Nuevo candidato".'} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="px-4 py-3">Candidato</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Semáforo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Reclutador</th>
                <th className="px-4 py-3">Próxima cita</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => {
                const e = infoEtapaCandidato(c.etapa);
                const s = infoSemaforo(c.semaforo);
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/candidatos/${c.id}`)}
                    className="border-b border-slate-50 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700 dark:text-slate-200">{c.nombre} {c.apellidoP} {c.apellidoM || ''}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{c.fuente}</p>
                    </td>
                    <td className="px-4 py-3"><span className={`badge ${e.pill}`}>{e.label}</span></td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                        <span className="text-slate-600 dark:text-slate-300">{s.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{c.telefono}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.reclutador ? `${c.reclutador.nombre} ${c.reclutador.apellidoP}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {c.proximaCita ? `${fechaCorta(c.proximaCita.fechaHoraInicio)} · ${hora(c.proximaCita.fechaHoraInicio)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <MenuAcciones
                        small
                        items={[
                          { label: 'Ver perfil', onClick: () => navigate(`/candidatos/${c.id}`) },
                          { label: 'Editar', onClick: () => { setEditando(c); setOpenForm(true); } },
                          'sep',
                          c.archivadoEn
                            ? { label: 'Restaurar', onClick: () => restaurar(c) }
                            : { label: 'Archivar', danger: true, onClick: () => setToArchive(c) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CandidatoFormModal
        open={openForm}
        onClose={() => setOpenForm(false)}
        candidato={editando}
        onSaved={() => refetch()}
      />

      <Modal open={!!toArchive} onClose={() => setToArchive(null)} title="Archivar candidato">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Archivar a <strong>{toArchive?.nombre} {toArchive?.apellidoP}</strong>? Su expediente,
          evaluación y citas se conservan; puedes restaurarlo desde "Ver archivados".
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={() => setToArchive(null)} className="btn-secondary">Cancelar</button>
          <button onClick={confirmarArchivar} disabled={archiving} className="btn-danger">{archiving ? 'Archivando…' : 'Archivar'}</button>
        </div>
      </Modal>
    </div>
  );
}
