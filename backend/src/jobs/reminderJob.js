import { prisma } from '../prisma.js';
import { initWebPush, notificarRecordatorio } from '../services/push.js';

const INTERVALO_MS = 60 * 1000;
let corriendo = false;
let timer = null;

// Suma un periodo (mes, trimestre, semestre, año) a un Date según FormaPago
function sumarPeriodo(base, formaPago) {
  const d = new Date(base);
  if (formaPago === 'MENSUAL') d.setMonth(d.getMonth() + 1);
  else if (formaPago === 'TRIMESTRAL') d.setMonth(d.getMonth() + 3);
  else if (formaPago === 'SEMESTRAL') d.setMonth(d.getMonth() + 6);
  else if (formaPago === 'ANUAL') d.setFullYear(d.getFullYear() + 1);
  else return null; // UNICO o desconocido
  return d;
}

// Genera (si no existe otra pendiente) el SIguiente recordatorio de pago
// asociado a una venta dada, sumando un periodo a partir de `base`.
async function generarSiguienteRecordatorioPago(venta, base) {
  if (!venta) return;
  if (venta.formaPago === 'UNICO') return;

  const proxima = sumarPeriodo(base, venta.formaPago);
  if (!proxima) return;
  // Si la fecha fin de vigencia ya está definida y la próxima supera el fin, stop
  if (venta.fechaFinVigencia && proxima > new Date(venta.fechaFinVigencia)) {
    await prisma.venta.update({ where: { id: venta.id }, data: { fechaProximoPago: null } }).catch(() => {});
    return;
  }

  const texto = `Pago de póliza: ${venta.producto} (${venta.formaPago.toLowerCase()}) · ${venta.cliente?.nombre ?? ''} ${venta.cliente?.apellidoP ?? ''}`.trim();
  // Evitar duplicados: si ya existe una nota pendiente para misma venta, simplemente la reusamos
  const pendiente = await prisma.nota.findFirst({
    where: { ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', completada: false },
  });
  if (pendiente) {
    await prisma.nota.update({
      where: { id: pendiente.id },
      data: { fechaAviso: proxima, texto, notificacionEnviada: false },
    });
  } else {
    await prisma.nota.create({
      data: {
        clienteId: venta.clienteId,
        asesorId: venta.asesorId,
        ventaId: venta.id,
        tipo: 'RECORDATORIO_PAGO',
        texto,
        fechaAviso: proxima,
      },
    });
  }
  await prisma.venta.update({ where: { id: venta.id }, data: { fechaProximoPago: proxima } }).catch(() => {});
}

// Busca recordatorios vencidos (cualquier tipo) y dispara notificaciones push.
// Para RECORDATORIO_PAGO además genera automáticamente la siguiente nota.
async function procesarRecordatoriosVencidos() {
  if (corriendo) return;
  corriendo = true;
  try {
    const ahora = new Date();
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
      try {
        await notificarRecordatorio(nota);
        enviados += 1;
        // Si es de pago, genera el siguiente recordatorio automáticamente
        if (nota.tipo === 'RECORDATORIO_PAGO' && nota.ventaId) {
          const venta = await prisma.venta.findUnique({
            where: { id: nota.ventaId },
            include: { cliente: { select: { nombre: true, apellidoP: true } } },
          });
          if (venta) {
            await generarSiguienteRecordatorioPago(venta, nota.fechaAviso || ahora);
            await prisma.actividad.create({
              data: {
                asesorId: venta.asesorId,
                tipo: 'PAGO_RECORDADO',
                descripcion: `Recordatorio de pago enviado para póliza ${venta.producto}.`,
              },
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`[reminder-job] error al notificar nota ${nota.id}: ${err.message}`);
      }
      // marcar enviado sin importar si la push llegó o no, para no spammear
      await prisma.nota.update({ where: { id: nota.id }, data: { notificacionEnviada: true } });
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
