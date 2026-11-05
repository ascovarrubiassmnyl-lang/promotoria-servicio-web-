// Repara las pólizas que dañó el bug del job de recordatorios de pago
// (corregido el 2026-11-05 en `jobs/reminderJob.js`).
//
// Qué pasaba: al vencer un RECORDATORIO_PAGO el job movía ESA MISMA nota al
// periodo siguiente, la dejaba marcada `notificacionEnviada: true` (ya nunca
// volvía a sonar) y adelantaba `Venta.fechaProximoPago` un periodo aunque
// nadie hubiera cobrado. Cada adelanto dejó una actividad `PAGO_RECORDADO`.
//
// Huella que busca (y solo eso):
//   - nota RECORDATORIO_PAGO abierta, `notificacionEnviada: true` y
//     `fechaAviso` en el futuro (una nota sana enviada siempre está en el pasado);
//   - su póliza con `fechaProximoPago` el mismo día que la nota (el job movía
//     ambas juntas).
// Reparación: regresa `fechaProximoPago` y la nota tantos periodos como
// `PAGO_RECORDADO` haya desde el último `PAGO_CONFIRMADO` (normalmente 1), y
// limpia las banderas de aviso. Si la fecha corregida ya pasó, el job avisa en
// el siguiente minuto: es justo lo que debió pasar (recibo vencido sin cobro
// confirmado). Si el cliente sí pagó, el asesor oprime "Confirmar cobro" y el
// recibo queda en el periodo correcto.
//
// Notas con la huella pero sin `PAGO_RECORDADO` que la explique, o cuya póliza
// no coincide en fecha, NO se tocan: se listan para revisar a mano.
//
//   DATABASE_URL=<url> node backend/scripts/reparar-ciclo-cobro.mjs            (simula)
//   DATABASE_URL=<url> node backend/scripts/reparar-ciclo-cobro.mjs --aplicar
//
// En Railway: railway run --service <servicio-app> node backend/scripts/reparar-ciclo-cobro.mjs
import { prisma } from '../src/prisma.js';
import { sumarMeses } from '../src/utils/comisionesPoliza.js';
import { MESES_POR_PAGO } from '../src/utils/comisiones.js';

const aplicar = process.argv.includes('--aplicar');
const DIA_MS = 86400000;
const mismoDia = (a, b) => a && b && Math.abs(new Date(a) - new Date(b)) < DIA_MS;
const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

// Retrocede `n` recibos sobre la serie anclada al inicio de vigencia (misma
// aritmética que siguientePeriodo, para no reintroducir el corrimiento del 31).
function retroceder(fecha, formaPago, ancla, n) {
  const meses = MESES_POR_PAGO[formaPago] || 12;
  if (!ancla) return sumarMeses(fecha, -n * meses);
  const k = Math.round((new Date(fecha) - new Date(ancla)) / (meses * 30.4375 * DIA_MS));
  return sumarMeses(ancla, Math.max(k - n, 0) * meses);
}

async function main() {
  const ahora = new Date();
  const notas = await prisma.nota.findMany({
    where: { tipo: 'RECORDATORIO_PAGO', completada: false, notificacionEnviada: true, fechaAviso: { gt: ahora }, ventaId: { not: null } },
    include: { venta: { include: { cliente: { select: { nombre: true, apellidoP: true } } } } },
  });

  const reparar = [];
  const revisar = [];
  for (const nota of notas) {
    const v = nota.venta;
    if (!v) continue;
    const ultimoConfirmado = await prisma.actividad.findFirst({
      where: { tipo: 'PAGO_CONFIRMADO', metadata: { path: ['ventaId'], equals: v.id } },
      orderBy: { creadoEn: 'desc' },
    });
    const adelantos = await prisma.actividad.count({
      where: {
        tipo: 'PAGO_RECORDADO',
        metadata: { path: ['ventaId'], equals: v.id },
        ...(ultimoConfirmado ? { creadoEn: { gt: ultimoConfirmado.creadoEn } } : {}),
      },
    });
    const fila = {
      nota, venta: v, adelantos,
      cliente: `${v.cliente?.nombre ?? ''} ${v.cliente?.apellidoP ?? ''}`.trim(),
    };
    if (adelantos > 0 && v.fechaProximoPago && mismoDia(v.fechaProximoPago, nota.fechaAviso) && v.formaPago !== 'UNICO') {
      fila.correcto = retroceder(v.fechaProximoPago, v.formaPago, v.fechaInicioVigencia || v.fechaEmision, adelantos);
      reparar.push(fila);
    } else {
      revisar.push(fila);
    }
  }

  console.log(`${aplicar ? 'APLICANDO' : 'SIMULACIÓN'} · ${notas.length} nota(s) de cobro atoradas\n`);
  for (const f of reparar) {
    console.log(`  reparar  ${f.cliente} · ${f.venta.producto} (${f.venta.formaPago.toLowerCase()}) · próximo pago ${fmt(f.venta.fechaProximoPago)} → ${fmt(f.correcto)} (${f.adelantos} adelanto(s) sin cobro)`);
  }
  for (const f of revisar) {
    console.log(`  revisar  ${f.cliente} · ${f.venta.producto} · nota ${fmt(f.nota.fechaAviso)} · próximo pago ${fmt(f.venta.fechaProximoPago)} · adelantos ${f.adelantos} — se reactiva el aviso, la fecha no se toca`);
  }

  if (!aplicar) {
    console.log('\nNada escrito. Revisa la lista y corre con --aplicar.');
    return;
  }
  for (const f of reparar) {
    await prisma.$transaction([
      prisma.venta.update({ where: { id: f.venta.id }, data: { fechaProximoPago: f.correcto } }),
      prisma.nota.update({ where: { id: f.nota.id }, data: { fechaAviso: f.correcto, notificacionEnviada: false, avisoPrevioEnviado: false } }),
    ]);
  }
  // A las de "revisar" solo se les quita la marca de enviada: así al menos
  // vuelven a avisar en su fecha (hoy no avisarían nunca).
  for (const f of revisar) {
    await prisma.nota.update({ where: { id: f.nota.id }, data: { notificacionEnviada: false, avisoPrevioEnviado: false } });
  }
  console.log(`\n${reparar.length} póliza(s) reparadas · ${revisar.length} aviso(s) reactivados sin mover fechas.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
