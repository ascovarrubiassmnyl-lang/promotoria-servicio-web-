import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, EmptyState, Badge } from '../components/ui.jsx';
import { fechaHora, fechaCorta, nombreMes } from '../lib/format.js';

const TIPO_COLOR = {
  CLIENTE_CREADO: 'blue',
  CITA_CREADA: 'purple',
  VENTA_CREADA: 'green',
  NOTA_CREADA: 'amber',
  RECORDATORIO_CREADO: 'amber',
  USUARIO_CREADO: 'slate',
  PAGO_CONFIRMADO: 'green',
  PAGO_RECORDADO: 'amber',
  LLAMADA: 'blue',
};
const TIPO_LABEL = {
  CLIENTE_CREADO: 'Cliente nuevo',
  CITA_CREADA: 'Cita agendada',
  VENTA_CREADA: 'Póliza creada',
  NOTA_CREADA: 'Nota',
  RECORDATORIO_CREADO: 'Recordatorio',
  USUARIO_CREADO: 'Usuario',
  PAGO_CONFIRMADO: 'Pago confirmado',
  PAGO_RECORDADO: 'Recordatorio de pago',
  LLAMADA: 'Llamada',
};

const diaKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const diaLabel = (iso) => {
  const d = new Date(iso);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy - a) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff === -1) return 'Mañana';
  return fechaCorta(iso);
};

// Devuelve {inicio, fin, num, label} para cada semana del mes (1-5)
// Semana N cubre los días (N-1)*7 + 1 hasta N*7, capped al último día del mes.
function semanasDelMes(year, month) {
  const diasEnMes = new Date(year, month + 1, 0).getDate();
  const numSemanas = Math.ceil(diasEnMes / 7);
  const res = [];
  for (let n = 1; n <= numSemanas; n++) {
    const diaIni = (n - 1) * 7 + 1;
    const diaFin = Math.min(n * 7, diasEnMes);
    res.push({
      num: n,
      label: `Semana ${n} · ${diaIni}-${diaFin} ${nombreMes(month + 1)}`,
      inicio: new Date(year, month, diaIni, 0, 0, 0),
      fin: new Date(year, month, diaFin, 23, 59, 59),
    });
  }
  return res;
}

// Semana que contiene Hoy
function semanaActualDelMes(d = new Date()) {
  return Math.floor(d.getDate() / 7) + 1;
}

export default function Actividad() {
  const { esAdmin, puede } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [semanaNum, setSemanaNum] = useState(semanaActualDelMes(today));
  const [asesorId, setAsesorId] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');

  const semanas = useMemo(() => semanasDelMes(year, month), [year, month]);
  const semanaSel = semanas.find((s) => s.num === semanaNum) || semanas[0];

  const params = {
    desde: semanaSel.inicio.toISOString(),
    hasta: semanaSel.fin.toISOString(),
    limit: 500,
  };
  if (asesorId) params.asesorId = asesorId;

  const { data, isLoading } = useQuery({
    queryKey: ['actividad', year, month, semanaNum, asesorId],
    queryFn: async () => (await api.get('/actividad', { params })).data,
  });

  const { data: asesoresList } = useQuery({
    queryKey: ['asesores-list'],
    queryFn: async () => (await api.get('/usuarios/asesores')).data,
    enabled: esAdmin() && puede('asesores'),
  });

  const actividades = useMemo(() => {
    if (!data) return [];
    return tipoFiltro ? data.filter((a) => a.tipo === tipoFiltro) : data;
  }, [data, tipoFiltro]);

  const tiposActividad = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.map((a) => a.tipo));
    return Array.from(set).sort();
  }, [data]);

  const grupos = useMemo(() => {
    const m = new Map();
    for (const a of actividades) {
      const k = diaKey(a.creadoEn);
      if (!m.has(k)) m.set(k, { key: k, label: diaLabel(a.creadoEn), items: [] });
      m.get(k).items.push(a);
    }
    return Array.from(m.values());
  }, [actividades]);

  // Resumen: cuenta por tipo en la semana seleccionada
  const resumen = useMemo(() => {
    const m = new Map();
    for (const a of actividades) {
      m.set(a.tipo, (m.get(a.tipo) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [actividades]);

  const prevMes = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1);
    const nuevoAño = month === 0 ? year - 1 : year;
    const nuevoMes = month === 0 ? 11 : month - 1;
    // Clamp al número de semanas del mes destino
    const numS = Math.ceil(new Date(nuevoAño, nuevoMes + 1, 0).getDate() / 7);
    setSemanaNum((s) => Math.min(s, numS));
  };
  const nextMes = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1);
    const nuevoAño = month === 11 ? year + 1 : year;
    const nuevoMes = month === 11 ? 0 : month + 1;
    const numS = Math.ceil(new Date(nuevoAño, nuevoMes + 1, 0).getDate() / 7);
    setSemanaNum((s) => Math.min(s, numS));
  };
  const goHoy = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSemanaNum(semanaActualDelMes(today));
  };

  const limpiarFiltros = () => { setAsesorId(''); setTipoFiltro(''); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Actividad</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {actividades.length} evento(s) · {esAdmin() ? 'Vista promotora' : 'Tu actividad'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          {esAdmin() && (
            <div>
              <label className="block text-xs uppercase text-slate-400 dark:text-slate-500 mb-1">Asesor</label>
              <select className="input w-auto" value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
                <option value="">Todos los asesores</option>
                {asesoresList?.map((a) => <option key={a.id} value={a.id}>{a.nombre} {a.apellidoP}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs uppercase text-slate-400 dark:text-slate-500 mb-1">Semana</label>
            <select className="input w-auto" value={semanaNum} onChange={(e) => setSemanaNum(+e.target.value)}>
              {semanas.map((s) => <option key={s.num} value={s.num}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 dark:text-slate-500 mb-1">Tipo</label>
            <select className="input w-auto" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
              <option value="">Todos los tipos</option>
              {tiposActividad.map((t) => <option key={t} value={t}>{TIPO_LABEL[t] || t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Navegación de mes */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={prevMes} className="btn-secondary px-3">← Mes anterior</button>
          <button onClick={goHoy} className="btn-secondary px-3">Hoy</button>
          <button onClick={nextMes} className="btn-secondary px-3">Mes siguiente →</button>
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {nombreMes(month + 1)} {year} · {semanaSel.label}
        </p>
        <button onClick={limpiarFiltros} className="btn-secondary text-xs">Limpiar filtros</button>
      </div>

      {/* Resumen compacto de la semana */}
      {resumen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resumen.slice(0, 6).map(([tipo, count]) => (
            <span key={tipo} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs">
              <Badge color={TIPO_COLOR[tipo] || 'slate'}>{TIPO_LABEL[tipo] || tipo}</Badge>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{count}</span>
            </span>
          ))}
          {resumen.length > 6 && (
            <span className="inline-flex items-center text-xs text-slate-400 dark:text-slate-500 px-2">
              +{resumen.length - 6} tipos más
            </span>
          )}
        </div>
      )}

      <Card>
        {isLoading ? <EmptyState message="Cargando…" /> :
          grupos.length === 0 ? <EmptyState message="Sin actividad en esta semana" /> : (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{g.label}</h4>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{g.items.length} evento(s)</span>
                    <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700"></div>
                  </div>
                  <ul className="space-y-1">
                    {g.items.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 py-2 border-b border-slate-50 dark:border-slate-700/50">
                        <Badge color={TIPO_COLOR[a.tipo] || 'slate'}>{TIPO_LABEL[a.tipo] || a.tipo.replace(/_/g, ' ')}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-300">{a.descripcion}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {fechaHora(a.creadoEn)}{esAdmin() && a.asesor ? ` · ${a.asesor.nombre} ${a.asesor.apellidoP}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}
