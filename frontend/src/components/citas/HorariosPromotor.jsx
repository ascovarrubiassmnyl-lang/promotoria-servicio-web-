import { useMemo } from 'react';
import { DISPONIBILIDAD_ESTILO } from './tipos.js';
import { hora } from '../../lib/format.js';

// Ventana de agenda que se ofrece (también la rejilla de Semana en escritorio).
export const HORA_INI = 8;
export const HORA_FIN = 20;

// Franja horaria del calendario (8:00–20:00) partida en "ocupado" (bloques del
// promotor) y "libre" (huecos entre ellos, incluidos los extremos del día).
// Cada hueco libre agenda directo un acompañamiento a esa hora — el asesor no
// tiene que ir a buscar la celda vacía en la grilla. Compartido por escritorio
// (panel del día) y móvil (vista Día).
export default function HorariosPromotor({ dia, bloques, promotor, onAgendar }) {
  const segmentos = useMemo(() => {
    const ini = new Date(dia); ini.setHours(HORA_INI, 0, 0, 0);
    const fin = new Date(dia); fin.setHours(HORA_FIN, 0, 0, 0);
    // Hoy no se ofrece lo que ya pasó: el primer hueco arranca en la próxima media hora.
    const ahora = new Date();
    if (ahora.toDateString() === ini.toDateString()) {
      const sig = new Date(ahora);
      sig.setSeconds(0, 0);
      sig.setMinutes(ahora.getMinutes() <= 30 ? 30 : 60);
      if (sig > ini) ini.setTime(sig.getTime());
    }
    const ocupados = [...bloques]
      .map((b) => ({ inicio: new Date(b.inicio), fin: new Date(b.fin) }))
      .sort((a, b) => a.inicio - b.inicio);
    const out = [];
    let cursor = ini;
    for (const b of ocupados) {
      const bIni = b.inicio < ini ? ini : b.inicio;
      const bFin = b.fin > fin ? fin : b.fin;
      if (bFin <= cursor) continue; // fuera de rango o ya cubierto
      if (bIni > cursor) out.push({ tipo: 'libre', inicio: cursor, fin: bIni });
      out.push({ tipo: 'ocupado', inicio: bIni, fin: bFin });
      cursor = bFin > cursor ? bFin : cursor;
    }
    if (cursor < fin) out.push({ tipo: 'libre', inicio: cursor, fin });
    return out;
  }, [dia, bloques]);

  return (
    <div className="mb-3 space-y-1.5 border-b border-slate-100 dark:border-slate-700 pb-3">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Horarios de {promotor ? `${promotor.nombre} ${promotor.apellidoP}` : 'el promotor'}
      </p>
      {segmentos.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sin horarios disponibles de {HORA_INI}:00 a {HORA_FIN}:00.</p>
      ) : (
        <ul className="space-y-1">
          {segmentos.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 ${s.tipo === 'ocupado' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                <span className={`w-2 h-2 rounded-full ${s.tipo === 'ocupado' ? 'bg-slate-400 dark:bg-slate-500' : 'bg-emerald-500'}`} />
                {hora(s.inicio)} – {hora(s.fin)} · {s.tipo === 'ocupado' ? DISPONIBILIDAD_ESTILO.label : 'Libre'}
              </span>
              {s.tipo === 'libre' && (
                <button type="button" onClick={() => onAgendar(s.inicio)} className="min-h-[32px] px-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  Agendar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
