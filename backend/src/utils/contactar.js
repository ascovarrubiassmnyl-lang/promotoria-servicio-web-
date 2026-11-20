// "Contactar ahora" (rediseño de Inicio, 2026-11-20): UNA sola fuente de
// verdad para los pendientes de contacto del día. Antes vivían en cuatro
// bloques de Inicio que se repetían entre sí (Recordatorios, Requiere tu
// atención → seguimientos, Leads nuevos sin llamar, A quién llamar esta
// semana) y la lista de la clínica salía sin orden ni motivo.
//
// Función pura: recibe lo que ya consulta GET /hoy y devuelve filas listas
// para pintar. Reglas:
//  - Grupo: VENCIDO > HOY > SEMANA; dentro de cada grupo, el más antiguo
//    primero (lo que más lleva esperando).
//      recordatorio/pago → VENCIDO si su aviso ya pasó, si no HOY
//      seguimiento       → HOY (alguien lo marcó a propósito)
//      lead nuevo        → VENCIDO si llegó antes de hoy (sin llamar ni un
//                          día), HOY si llegó hoy
//      clínica           → SEMANA (la lista de la semana)
//  - Una persona aparece UNA vez: si tiene varios motivos se queda la fila
//    más urgente y los demás viajan en `otrosMotivos`. Un recordatorio sin
//    cliente siempre es su propia fila.
//  - Leads, clínica y seguimientos de quien ya tiene cita hoy no se listan:
//    ya está en la franja de Hoy. Sus recordatorios sí (son tareas
//    concretas).

export const GRUPOS_CONTACTAR = ['VENCIDO', 'HOY', 'SEMANA'];
const RANGO = Object.fromEntries(GRUPOS_CONTACTAR.map((g, i) => [g, i]));

const nombreDe = (c) => (c ? `${c.nombre} ${c.apellidoP || ''}`.trim() : '');

export function armarBandejaContactar({ recordatorios = [], seguimientos = [], leads = [], porLlamar = [], conCitaHoy = new Set(), ahora = new Date(), inicioHoy }) {
  const filas = [];
  const persona = (c) => (c ? {
    clienteId: c.id,
    cliente: { id: c.id, nombre: c.nombre, apellidoP: c.apellidoP, telefono: c.telefono || null },
    nombre: nombreDe(c),
    telefono: c.telefono || null,
    etapa: c.estado || null,
    ultimoContacto: c.fechaUltimaLlamada || null,
  } : { clienteId: null, cliente: null, nombre: '', telefono: null, etapa: null, ultimoContacto: null });

  for (const n of recordatorios) {
    const pago = n.tipo === 'RECORDATORIO_PAGO';
    const p = persona(n.cliente);
    filas.push({
      key: `nota:${n.id}`,
      tipo: pago ? 'PAGO' : 'RECORDATORIO',
      grupo: n.fechaAviso < ahora ? 'VENCIDO' : 'HOY',
      fecha: n.fechaAviso,
      motivo: pago ? 'Pago de póliza' : `Recordatorio: ${n.texto}`,
      notaId: n.id,
      ...p,
      nombre: p.nombre || n.texto,
    });
  }
  for (const c of seguimientos) {
    if (conCitaHoy.has(c.id)) continue;
    filas.push({
      key: `seguimiento:${c.id}`,
      tipo: 'SEGUIMIENTO',
      grupo: 'HOY',
      fecha: c.fechaUltimaLlamada || c.actualizadoEn || c.creadoEn,
      motivo: 'Necesita seguimiento',
      ...persona(c),
    });
  }
  for (const c of leads) {
    if (conCitaHoy.has(c.id)) continue;
    filas.push({
      key: `lead:${c.id}`,
      tipo: 'LEAD',
      grupo: inicioHoy && c.creadoEn < inicioHoy ? 'VENCIDO' : 'HOY',
      fecha: c.creadoEn,
      motivo: c.fuente ? `Lead nuevo · ${c.fuente}` : 'Lead nuevo',
      nuevo: Boolean(c.leadSinVer),
      ...persona(c),
    });
  }
  for (const p of porLlamar) {
    if (p.clienteId && conCitaHoy.has(p.clienteId)) continue;
    const base = p.cliente ? persona(p.cliente) : {
      clienteId: null, cliente: null, nombre: p.nombre, telefono: p.telefono || null, etapa: null, ultimoContacto: null,
    };
    filas.push({
      key: `clinica:${p.id}`,
      tipo: 'CLINICA',
      grupo: 'SEMANA',
      fecha: p.creadoEn,
      motivo: 'Clínica de la semana',
      prospectoId: p.id,
      ...base,
    });
  }

  filas.sort((a, b) => RANGO[a.grupo] - RANGO[b.grupo] || new Date(a.fecha) - new Date(b.fecha));

  // Una fila por persona: la primera (más urgente) se queda.
  const porCliente = new Map();
  const resultado = [];
  for (const f of filas) {
    if (!f.clienteId) { resultado.push({ ...f, otrosMotivos: [] }); continue; }
    const ya = porCliente.get(f.clienteId);
    if (ya) { ya.otrosMotivos.push(f.motivo); continue; }
    const fila = { ...f, otrosMotivos: [] };
    porCliente.set(f.clienteId, fila);
    resultado.push(fila);
  }
  return resultado;
}
