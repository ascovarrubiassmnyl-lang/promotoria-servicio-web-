// Ciclo de cobro (2026-11-05): el job de recordatorios solo AVISA (no
// reprograma ni adelanta el próximo pago), "Confirmar cobro" registra el
// recibo en su periodo correcto y avanza el ciclo, los pagos simultáneos no
// se duplican y las fechas de recibo no se recorren a fin de mes.
// Base de DESARROLLO, usuarios propios @cobros-test.local que se borran al final.
//
//   cd backend && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import { procesarNotaVencida } from '../src/jobs/reminderJob.js';
import { sumarMeses, siguientePeriodo } from '../src/utils/comisionesPoliza.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'cobros-test.local';
const DIA = 86400000;
let server; let base; let asesor; let token; let cliente;

const api = (path, { method = 'GET', body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: body ? JSON.stringify(body) : undefined,
});

const nuevaPoliza = (data = {}) => prisma.venta.create({
  data: {
    asesorId: asesor.id,
    clienteId: cliente.id,
    ramo: 'VIDA',
    producto: 'Póliza de prueba',
    primaAnual: 12000,
    formaPago: 'MENSUAL',
    estado: 'PENDIENTE_PAGAR',
    ...data,
  },
});

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  asesor = await prisma.usuario.create({ data: { nombre: 'Cobro', apellidoP: 'Prueba', email: `cobro-${Date.now()}@${DOMINIO}`, password: 'x', rol: 'ASESOR', activo: true } });
  token = signToken(asesor);
  cliente = await prisma.cliente.create({ data: { asesorId: asesor.id, nombre: 'Marta', apellidoP: 'Prueba' } });
});

after(async () => {
  await prisma.venta.deleteMany({ where: { asesor: { email: { endsWith: `@${DOMINIO}` } } } });
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

test('fechas de recibo: topan a fin de mes y no se recorren', () => {
  const ene31 = new Date(2026, 0, 31, 12);
  assert.equal(sumarMeses(ene31, 1).getDate(), 28);
  assert.equal(sumarMeses(ene31, 2).getDate(), 31);
  // Encadenado desde un recibo ya topado, el ancla devuelve el 31.
  const mar = siguientePeriodo(new Date(2026, 1, 28, 12), 'MENSUAL', ene31);
  assert.equal(mar.getMonth(), 2); assert.equal(mar.getDate(), 31);
  // Un recibo corrido por el cálculo viejo (3 mar) regresa a la serie.
  const corr = siguientePeriodo(new Date(2026, 2, 3, 12), 'MENSUAL', ene31);
  assert.equal(corr.getMonth(), 2); assert.equal(corr.getDate(), 31);
  assert.equal(siguientePeriodo(ene31, 'UNICO', ene31), null);
});

test('el job avisa el cobro vencido sin moverlo; Confirmar cobro lo registra en su periodo', async () => {
  const vence = new Date(Date.now() - 2 * DIA);
  const venta = await nuevaPoliza({ fechaProximoPago: vence, fechaInicioVigencia: sumarMeses(vence, -1) });
  const nota = await prisma.nota.create({
    data: { clienteId: cliente.id, asesorId: asesor.id, ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', destinatario: 'CLIENTE', texto: 'Pago de prueba', fechaAviso: vence },
  });

  assert.equal(await procesarNotaVencida(nota), true);
  const notaDespues = await prisma.nota.findUnique({ where: { id: nota.id } });
  const ventaDespues = await prisma.venta.findUnique({ where: { id: venta.id } });
  assert.equal(notaDespues.notificacionEnviada, true);
  assert.equal(notaDespues.completada, false, 'sigue abierta hasta que se cobre');
  assert.equal(notaDespues.fechaAviso.getTime(), vence.getTime(), 'la nota no se reprograma');
  assert.equal(ventaDespues.fechaProximoPago.getTime(), vence.getTime(), 'el próximo pago no avanza sin cobro');
  assert.equal(await prisma.notificacion.count({ where: { destinatarioId: asesor.id, tipo: 'RECORDATORIO_PAGO' } }), 1);

  const r = await api(`/api/ventas/${venta.id}/cobroconfirmado`, { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  const pagos = await prisma.pagoPoliza.findMany({ where: { ventaId: venta.id } });
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].periodo.getTime(), vence.getTime(), 'el recibo queda en el periodo que vencía');
  const tras = await prisma.venta.findUnique({ where: { id: venta.id } });
  assert.ok(tras.fechaProximoPago > vence);
  const abiertas = await prisma.nota.findMany({ where: { ventaId: venta.id, tipo: 'RECORDATORIO_PAGO', completada: false } });
  assert.equal(abiertas.length, 1, 'queda un solo recordatorio, el del siguiente recibo');
  assert.equal(abiertas[0].notificacionEnviada, false);
  assert.equal(abiertas[0].fechaAviso.getTime(), tras.fechaProximoPago.getTime());
});

test('pagos simultáneos del mismo recibo: solo uno se registra', async () => {
  const venta = await nuevaPoliza({ fechaInicioVigencia: new Date(2025, 0, 15, 12) });
  const periodo = new Date(2025, 1, 15, 12).toISOString();
  const respuestas = await Promise.all(Array.from({ length: 5 }, () => api(`/api/ventas/${venta.id}/pagos`, {
    method: 'POST', body: { periodo },
  })));
  const estados = respuestas.map((x) => x.status).sort();
  assert.deepEqual(estados, [201, 409, 409, 409, 409]);
  assert.equal(await prisma.pagoPoliza.count({ where: { ventaId: venta.id } }), 1);
});

test('corregir un pago no puede encimarlo sobre otro recibo pagado', async () => {
  const venta = await nuevaPoliza({ fechaInicioVigencia: new Date(2025, 0, 15, 12) });
  const feb = new Date(2025, 1, 15, 12).toISOString();
  const mar = new Date(2025, 2, 15, 12).toISOString();
  assert.equal((await api(`/api/ventas/${venta.id}/pagos`, { method: 'POST', body: { periodo: feb } })).status, 201);
  const r2 = await api(`/api/ventas/${venta.id}/pagos`, { method: 'POST', body: { periodo: mar } });
  const pagoMar = await r2.json();
  const choque = await api(`/api/ventas/${venta.id}/pagos/${pagoMar.id}`, { method: 'PATCH', body: { periodo: feb } });
  assert.equal(choque.status, 409);
  const ok = await api(`/api/ventas/${venta.id}/pagos/${pagoMar.id}`, { method: 'PATCH', body: { periodo: new Date(2025, 3, 15, 12).toISOString() } });
  assert.equal(ok.status, 200);
});
