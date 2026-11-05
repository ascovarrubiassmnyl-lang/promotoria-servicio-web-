import { prisma } from '../prisma.js';
import { initWebPush } from '../services/push.js';
import { notificarRecordatorioNota } from '../utils/notificaciones.js';
import { registrarActividad } from '../utils/actividad.js';

const INTERVALO_MS = 60 * 1000;
let corriendo = false;
let timer = null;

// Aviso anticipado: recordatorios cuyo `fechaAviso` cae dentro de las próximas
// 24h y que aún no han recibido su aviso previo. Es una ventana aparte de la
// del día (por eso son dos banderas y no un contador): un recordatorio creado
// con menos de 24h de anticipación solo dispara el aviso del día.
async function procesarAvisosPrevios(ahora) {
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const proximos = await prisma.nota.findMany({
    where: {
      completada: false,
      notificacionEnviada: false,
      avisoPrevioEnviado: false,
      fechaAviso: { gt: ahora, lte: en24h },
    },
    take: 50,
  });

  let enviados = 0;
  for (const nota of proximos) {
    try {
      await notificarRecordatorioNota(nota, { previo: true });
      await prisma.nota.update({ where: { id: nota.id }, data: { avisoPrevioEnviado: true } });
      enviados += 1;
    } catch (err) {
      // Igual que el aviso del día: si no se persistió, la bandera no se marca
      // y se reintenta en la siguiente corrida.
      console.warn(`[reminder-job] error en aviso previo de nota ${nota.id}: ${err.message}`);
    }
  }
  return enviados;
}

// Avisa UNA nota vencida. Devuelve true si el aviso quedó persistido.
//
// Un RECORDATORIO_PAGO solo se AVISA: no se reprograma ni mueve
// `Venta.fechaProximoPago` (bug corregido 2026-11-05). Antes el job buscaba
// "la nota de pago pendiente" para crear la del siguiente periodo, encontraba
// esta misma, la movía al mes siguiente y luego la marcaba enviada: el
// recordatorio no volvía a sonar nunca, la póliza parecía al corriente sin
// que nadie hubiera cobrado y "Confirmar cobro" registraba el recibo en el
// periodo equivocado. El ciclo de cobro avanza SOLO al registrar un pago
// (cobroconfirmado / completar), que cierran esta nota y crean la siguiente
// con sincronizarRecordatorioPago(). Mientras tanto la nota queda vencida a
// la vista (Hoy, ficha) y el semáforo de pagos en ámbar.
export async function procesarNotaVencida(nota) {
  // "Notificado" = la notificación in-app quedó persistida (eso es lo que el
  // asesor verá en su campana), NO que la push haya llegado: el push es mejor
  // esfuerzo y antes un fallo suyo marcaba la nota como enviada, perdiendo el
  // recordatorio para siempre.
  try {
    await notificarRecordatorioNota(nota);
  } catch (err) {
    // Si no se pudo persistir (BD caída, etc.) la nota sigue pendiente y se
    // reintenta en la próxima corrida.
    console.warn(`[reminder-job] error al notificar nota ${nota.id}: ${err.message}`);
    return false;
  }
  await prisma.nota.update({ where: { id: nota.id }, data: { notificacionEnviada: true } });
  if (nota.tipo === 'RECORDATORIO_PAGO' && nota.ventaId) {
    const venta = await prisma.venta.findUnique({
      where: { id: nota.ventaId },
      include: { cliente: { select: { nombre: true, apellidoP: true } } },
    });
    if (venta) {
      await registrarActividad(venta.asesorId, 'PAGO_RECORDADO', {
        ventaId: venta.id,
        clienteId: venta.clienteId,
        cliente: venta.cliente ? `${venta.cliente.nombre} ${venta.cliente.apellidoP}` : null,
        producto: venta.producto,
      }).catch(() => {});
    }
  }
  return true;
}

// Busca recordatorios vencidos (cualquier tipo) y dispara notificaciones.
async function procesarRecordatoriosVencidos() {
  if (corriendo) return;
  corriendo = true;
  try {
    const ahora = new Date();
    const previos = await procesarAvisosPrevios(ahora);
    if (previos > 0) console.log(`[reminder-job] ${previos} aviso(s) anticipados (1 día antes)`);

    const vencidos = await prisma.nota.findMany({
      where: {
        completada: false,
        notificacionEnviada: false,
        fechaAviso: { lte: ahora },
      },
      take: 50,
    });
    if (vencidos.length === 0) return;

    let enviados = 0;
    for (const nota of vencidos) {
      if (await procesarNotaVencida(nota)) enviados += 1;
    }
    if (enviados > 0) console.log(`[reminder-job] ${enviados} recordatorio(s) notificados`);
  } catch (err) {
    console.error('[reminder-job] error:', err.message);
  } finally {
    corriendo = false;
  }
}

export function startReminderJob() {
  initWebPush();
  console.log(`[reminder-job] arrancado (cada ${INTERVALO_MS / 1000}s)`);
  // ejecutar después de arrancar para no bloquear server.listen
  setTimeout(procesarRecordatoriosVencidos, 5000);
  if (timer) clearInterval(timer);
  timer = setInterval(procesarRecordatoriosVencidos, INTERVALO_MS);
  return timer;
}

export function stopReminderJob() {
  if (timer) { clearInterval(timer); timer = null; }
}
