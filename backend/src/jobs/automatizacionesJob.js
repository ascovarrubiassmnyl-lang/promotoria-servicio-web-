import { prisma } from '../prisma.js';
import { notificar } from '../utils/notificaciones.js';

// Automatizaciones "cableadas" del CRM: reglas fijas, no un motor configurable
// (un motor tipo n8n quedó como pendiente/experimento, no como requisito).
//
// Corren cada hora, no cada minuto: nada de lo que vigilan cambia por minuto y
// el idempotency check es una consulta por asesor.
const INTERVALO_MS = 60 * 60 * 1000;

// Un prospecto se considera estancado si lleva este tiempo sin ningún avance.
const DIAS_ESTANCADO = 15;

// Umbrales de avance de meta que disparan aviso, una sola vez por mes cada uno.
const HITOS_META = [50, 80, 100];

let corriendo = false;
let timer = null;

const diasAtras = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ¿Ya se notificó esto? La propia bandeja in-app es el registro de idempotencia
// (no hace falta una tabla extra): se busca una notificación del mismo tipo y
// misma clave dentro de la ventana indicada.
async function yaNotificado(destinatarioId, tipo, clave, desde) {
  const previa = await prisma.notificacion.findFirst({
    where: {
      destinatarioId,
      tipo,
      creadoEn: { gte: desde },
      datos: { path: ['clave'], equals: clave },
    },
    select: { id: true },
  });
  return Boolean(previa);
}

// Regla 1 — Prospecto sin avance en 15 días.
//
// "Sin avance" = el cliente no ha cambiado de etapa ni recibido actividad, no
// tiene citas vivas ni recordatorios abiertos, y no es todavía cliente (ninguna
// póliza viva). Se avisa una vez cada 15 días por prospecto, para no repetir
// el mismo aviso todos los días.
async function prospectosEstancados() {
  const corte = diasAtras(DIAS_ESTANCADO);
  const candidatos = await prisma.cliente.findMany({
    where: {
      archivadoEn: null,
      actualizadoEn: { lt: corte },
      // Ya cerrada la venta no es un prospecto que perseguir.
      ventas: { none: { estado: { in: ['PENDIENTE_PAGAR', 'FIRMADA', 'APROBADA', 'PAGADA'] } } },
      // Con una cita agendada o un recordatorio abierto, ya hay siguiente paso.
      citas: { none: { estado: { in: ['PROGRAMADA', 'CONFIRMADA'] } } },
      notasItems: { none: { tipo: { in: ['RECORDATORIO', 'RECORDATORIO_PAGO'] }, completada: false } },
    },
    select: { id: true, nombre: true, apellidoP: true, asesorId: true, estado: true, actualizadoEn: true },
    take: 200,
  });

  let avisados = 0;
  for (const c of candidatos) {
    const clave = `prospecto:${c.id}`;
    if (await yaNotificado(c.asesorId, 'PROSPECTO_ESTANCADO', clave, corte)) continue;
    const dias = Math.floor((Date.now() - new Date(c.actualizadoEn).getTime()) / (24 * 60 * 60 * 1000));
    const nombre = `${c.nombre} ${c.apellidoP}`.trim();
    try {
      await notificar(c.asesorId, 'PROSPECTO_ESTANCADO', {
        titulo: 'Prospecto sin avance · Origen Promotoría',
        cuerpo: `${nombre} lleva ${dias} días sin movimiento. ¿Le das seguimiento?`,
        datos: {
          clave,
          url: `${process.env.PUBLIC_URL || ''}/clientes/${c.id}`,
          clienteId: c.id,
          dias,
        },
      });
      avisados += 1;
    } catch (err) {
      console.warn(`[automatizaciones] no se pudo avisar del prospecto ${c.id}: ${err.message}`);
    }
  }
  return avisados;
}

// Regla 2 — Avance de la meta mensual de pólizas ("llevas 6 de 10").
//
// Reusa la MISMA definición de venta ganada que Pólizas y Metas
// (APROBADA/PAGADA creadas en el mes): no se inventa un conteo propio.
async function avanceDeMeta() {
  const ahora = new Date();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  const ini = new Date(anio, mes - 1, 1);
  const fin = new Date(anio, mes, 0, 23, 59, 59, 999);

  const targets = await prisma.target.findMany({
    where: { mes, anio, metaVentasNum: { not: null, gt: 0 } },
    select: { asesorId: true, metaVentasNum: true },
  });
  if (!targets.length) return 0;

  const ganadas = await prisma.venta.groupBy({
    by: ['asesorId'],
    where: { estado: { in: ['APROBADA', 'PAGADA'] }, creadoEn: { gte: ini, lte: fin } },
    _count: { _all: true },
  });
  const porAsesor = Object.fromEntries(ganadas.map((g) => [g.asesorId, g._count._all]));

  let avisados = 0;
  for (const t of targets) {
    const actual = porAsesor[t.asesorId] || 0;
    const pct = (actual / t.metaVentasNum) * 100;
    // Solo el hito más alto ya alcanzado: si pasa de 40% a 85% en un día, se
    // avisa 80 y no también 50.
    const hito = [...HITOS_META].reverse().find((h) => pct >= h);
    if (!hito) continue;
    const clave = `meta:${anio}-${mes}:${hito}`;
    if (await yaNotificado(t.asesorId, 'META_AVANCE', clave, ini)) continue;
    const cuerpo = hito >= 100
      ? `¡Meta cumplida! Llevas ${actual} de ${t.metaVentasNum} pólizas este mes.`
      : `Llevas ${actual} de ${t.metaVentasNum} pólizas este mes (${Math.round(pct)}%).`;
    try {
      await notificar(t.asesorId, 'META_AVANCE', {
        titulo: 'Avance de tu meta · Origen Promotoría',
        cuerpo,
        datos: { clave, url: `${process.env.PUBLIC_URL || ''}/targets`, actual, meta: t.metaVentasNum, hito },
      });
      avisados += 1;
    } catch (err) {
      console.warn(`[automatizaciones] no se pudo avisar la meta de ${t.asesorId}: ${err.message}`);
    }
  }
  return avisados;
}

async function correr() {
  if (corriendo) return;
  corriendo = true;
  try {
    const [estancados, metas] = await Promise.all([prospectosEstancados(), avanceDeMeta()]);
    if (estancados || metas) {
      console.log(`[automatizaciones] ${estancados} prospecto(s) estancados · ${metas} aviso(s) de meta`);
    }
  } catch (err) {
    console.error('[automatizaciones] error:', err.message);
  } finally {
    corriendo = false;
  }
}

export function startAutomatizacionesJob() {
  console.log(`[automatizaciones] arrancado (cada ${INTERVALO_MS / 60000} min)`);
  setTimeout(correr, 15000); // no bloquear el arranque del servidor
  if (timer) clearInterval(timer);
  timer = setInterval(correr, INTERVALO_MS);
  return timer;
}

export function stopAutomatizacionesJob() {
  if (timer) { clearInterval(timer); timer = null; }
}
