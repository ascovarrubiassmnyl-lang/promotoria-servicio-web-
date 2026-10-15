// Esquema de comisiones de toda la vida de la póliza (2026-10-15): funciones
// puras + flujo por API (alta pagada → primer recibo con comisión, pagos
// históricos, resumen mensual). Base de DESARROLLO, usuarios propios
// @comisiones-test.local que se borran al final (cascada).
//
//   cd backend && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import {
  resolverEsquema, pctDelAnio, anioDePoliza, comisionDeRecibo, isrResicoMensual, proyeccionComision,
} from '../src/utils/comisiones.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'comisiones-test.local';
let server; let base; let asesor; let otro; let token; let tokenOtro; let cliente;

const api = (path, { token: t = token, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  body: body ? JSON.stringify(body) : undefined,
});

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const mk = (n) => prisma.usuario.create({ data: { nombre: n, apellidoP: 'Prueba', email: `${n.toLowerCase()}-${Date.now()}@${DOMINIO}`, password: 'x', rol: 'ASESOR', activo: true } });
  asesor = await mk('ComA');
  otro = await mk('ComB');
  token = signToken(asesor);
  tokenOtro = signToken(otro);
  cliente = await prisma.cliente.create({ data: { asesorId: asesor.id, nombre: 'Lucía', apellidoP: 'Prueba' } });
});

after(async () => {
  // Venta.asesorId no es cascada: primero las pólizas de prueba.
  await prisma.venta.deleteMany({ where: { asesor: { email: { endsWith: `@${DOMINIO}` } } } });
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

test('variante por moneda, suma asegurada y edad', () => {
  const o20 = (moneda, sa) => resolverEsquema({ producto: 'Orvi 20 pagos', moneda, sumaAsegurada: sa, sumaAseguradaMoneda: moneda });
  assert.equal(o20('UDI', 2000000).tramos[0].pct, 35);
  assert.equal(o20('UDI', 1000000).tramos[0].pct, 44);
  assert.equal(o20('USD', 50000).tramos[0].pct, 44);
  const sinSa = o20('UDI', null);
  assert.equal(sinSa.tramos[0].pct, 35);
  assert.equal(sinSa.supuestos.length, 1);

  const e60 = (edad) => resolverEsquema({ producto: 'Orvi Edad 60', moneda: 'USD', edad });
  assert.equal(e60(30).tramos[0].pct, 44);
  assert.equal(e60(45).tramos[0].pct, 35);
  assert.equal(e60(null).tramos[0].pct, 35);
  assert.equal(e60(null).supuestos.length, 1);

  assert.equal(resolverEsquema({ producto: 'Orvi 10 pagos', moneda: 'UDI' }).tramos[0].pct, 35);
  assert.equal(resolverEsquema({ producto: 'Orvi 10 pagos', moneda: 'USD' }).tramos[0].pct, 36);
  assert.equal(resolverEsquema({ producto: 'Alfa Medical', moneda: 'MXN' }), null);
});

test('% por año de póliza a lo largo de la vida (Vida Mujer, Orvi 6, prima única)', () => {
  const vm = resolverEsquema({ producto: 'Vida Mujer', moneda: 'MXN' }).tramos;
  assert.deepEqual([1, 2, 3, 4, 10, 11, 20, 21].map((a) => pctDelAnio(vm, a)), [40, 15, 10, 5, 5, 2, 2, 0]);
  const o6 = resolverEsquema({ producto: 'Orvi 6 pagos', moneda: 'USD' }).tramos;
  assert.deepEqual([4, 6, 7].map((a) => pctDelAnio(o6, a)), [4, 4, 0]);
  const pu = resolverEsquema({ producto: 'Imagina Ser PPR — Prima Única Plazo Largo', moneda: 'UDI' }).tramos;
  assert.deepEqual([1, 2].map((a) => pctDelAnio(pu, a)), [8.5, 0]);
});

test('año de póliza y comisión por recibo según forma de pago', () => {
  assert.equal(anioDePoliza('2025-03-15', '2026-03-14'), 1);
  assert.equal(anioDePoliza('2025-03-15', '2026-03-15'), 2);
  const esquema = resolverEsquema({ producto: 'Vida Mujer', moneda: 'MXN' });
  const venta = { fechaInicioVigencia: '2025-01-10', formaPago: 'MENSUAL', moneda: 'MXN', primaAnual: 12000, comisionPct: 40 };
  const r1 = comisionDeRecibo({ venta, esquema, fechaPeriodo: '2025-01-10', montoEsperado: 1000, montoPagado: 1000 });
  assert.equal(r1.comisionMonto, 400); // 1,000 × 40%
  const r13 = comisionDeRecibo({ venta, esquema, fechaPeriodo: '2026-01-10', montoEsperado: 1000, montoPagado: 1000 });
  assert.deepEqual([r13.anioPoliza, r13.comisionPct, r13.comisionMonto], [2, 15, 150]);
  const parcial = comisionDeRecibo({ venta, esquema, fechaPeriodo: '2025-02-10', montoEsperado: 1000, montoPagado: 500 });
  assert.equal(parcial.comisionMonto, 200);
  // En divisa: se convierte con el tipo de cambio; sin TC queda pendiente.
  const usd = { ...venta, moneda: 'USD', primaMoneda: 1200, formaPago: 'ANUAL' };
  assert.equal(comisionDeRecibo({ venta: usd, esquema, fechaPeriodo: '2025-01-10', tipoCambio: 18 }).comisionMonto, 8640);
  assert.equal(comisionDeRecibo({ venta: usd, esquema, fechaPeriodo: '2025-01-10' }).comisionMonto, null);
  // Proyección: anual vs. mensual da la misma comisión anual, en 1 o 12 recibos.
  const p = proyeccionComision({ esquema, primaOriginal: 12000, formaPago: 'MENSUAL', anios: 20 });
  assert.equal(p.length, 20);
  assert.deepEqual([p[0].comisionAnual, p[0].porRecibo, p[0].recibos], [4800, 400, 12]);
});

test('ISR RESICO mensual estimado', () => {
  assert.deepEqual(isrResicoMensual(20000), { tasa: 1, isr: 200, fueraDeTabla: false });
  assert.equal(isrResicoMensual(30000).isr, 330);
  assert.equal(isrResicoMensual(100000).tasa, 2);
  assert.equal(isrResicoMensual(0).isr, 0);
});

test('API: alta pagada calcula el esquema, registra el primer recibo y lleva el historial', async () => {
  const inicio = new Date(); inicio.setMonth(inicio.getMonth() - 14); inicio.setHours(12, 0, 0, 0);
  const r = await api('/api/ventas', {
    method: 'POST',
    body: {
      clienteId: cliente.id, ramo: 'VIDA', producto: 'Vida Mujer', primaAnual: 12000, comisionPct: 10,
      estado: 'PAGADA', formaPago: 'MENSUAL', fechaInicioVigencia: inicio.toISOString(),
    },
  });
  assert.equal(r.status, 201, await r.clone().text());
  const v = await r.json();
  assert.equal(v.comisionPct, 40); // la tabla manda sobre el 10% del formulario
  assert.equal(v.esquemaComision.producto, 'Vida Mujer');
  const sig = new Date(inicio); sig.setMonth(sig.getMonth() + 1);
  assert.equal(new Date(v.fechaProximoPago).toISOString(), sig.toISOString());

  const pagos = await prisma.pagoPoliza.findMany({ where: { ventaId: v.id } });
  assert.equal(pagos.length, 1);
  assert.deepEqual([pagos[0].anioPoliza, pagos[0].comisionPct, pagos[0].comisionMonto], [1, 40, 400]);

  // Pago histórico del recibo 13 (año 2 → 15%).
  const p13 = new Date(inicio); p13.setMonth(p13.getMonth() + 12);
  const h = await api(`/api/ventas/${v.id}/pagos`, { method: 'POST', body: { periodo: p13.toISOString(), montoPagado: 1000 } });
  assert.equal(h.status, 201, await h.clone().text());
  const ph = await h.json();
  assert.deepEqual([ph.anioPoliza, ph.comisionPct, ph.comisionMonto], [2, 15, 150]);
  assert.equal((await api(`/api/ventas/${v.id}/pagos`, { method: 'POST', body: { periodo: p13.toISOString() } })).status, 409);

  // Cobro del recibo en curso (fechaProximoPago = recibo 2, año 1).
  const c = await api(`/api/ventas/${v.id}/cobroconfirmado`, { method: 'POST', body: {} });
  assert.equal(c.status, 200);

  const cm = await (await api(`/api/ventas/${v.id}/comisiones`)).json();
  assert.equal(cm.anios[0].pct, 40);
  assert.equal(cm.anios[0].comisionAnualMXN, 4800);
  assert.equal(cm.anios.length, 20);
  assert.equal(cm.cobradoMXN, 950); // 400 + 150 + 400
  assert.equal(cm.pagos.length, 3);

  // Ajeno: 403 en todo.
  assert.equal((await api(`/api/ventas/${v.id}/comisiones`, { token: tokenOtro })).status, 403);
  assert.equal((await api(`/api/ventas/${v.id}/pagos`, { token: tokenOtro, method: 'POST', body: { periodo: inicio.toISOString() } })).status, 403);

  // Resumen anual del asesor: lo cobrado este año coincide con los pagos de este año.
  const anio = new Date().getFullYear();
  const res = await (await api(`/api/ventas/comisiones/resumen?anio=${anio}`)).json();
  const esperadoCobrado = (await prisma.pagoPoliza.findMany({ where: { ventaId: v.id } }))
    .filter((p) => new Date(p.fechaPago).getFullYear() === anio)
    .reduce((s, p) => s + p.comisionMonto, 0);
  assert.equal(res.totales.cobrada, +esperadoCobrado.toFixed(2));
  assert.ok(res.totales.esperada > 0);
  assert.equal(res.meses.length, 12);
  const ajeno = await (await api(`/api/ventas/comisiones/resumen?anio=${anio}`, { token: tokenOtro })).json();
  assert.equal(ajeno.totales.cobrada, 0);

  // Borrar un recibo capturado por error.
  assert.equal((await api(`/api/ventas/${v.id}/pagos/${ph.id}`, { method: 'DELETE' })).status, 200);
  assert.equal(await prisma.pagoPoliza.count({ where: { ventaId: v.id } }), 2);
});

test('API: producto sin tabla (GMM) usa el % capturado solo en el año 1', async () => {
  const r = await api('/api/ventas', {
    method: 'POST',
    body: { clienteId: cliente.id, ramo: 'GMM', producto: 'Alfa Medical', primaAnual: 24000, comisionPct: 20, estado: 'PAGADA', formaPago: 'ANUAL', fechaInicioVigencia: new Date().toISOString() },
  });
  const v = await r.json();
  assert.equal(v.comisionPct, 20);
  assert.equal(v.esquemaComision, null);
  const pago = await prisma.pagoPoliza.findFirst({ where: { ventaId: v.id } });
  assert.equal(pago.comisionMonto, 4800);
  const cm = await (await api(`/api/ventas/${v.id}/comisiones`)).json();
  assert.equal(cm.sinTabla, true);
});
