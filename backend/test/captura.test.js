// Tests de integración de la captura de leads (POST /api/captura/:clave y
// /api/fuentes-captura). Corren contra la base de DESARROLLO del .env: crean
// sus propios usuarios de prueba (correo @captura-test.local) y los borran al
// final — el borrado en cascada se lleva sus fuentes, clientes y capturas.
//
//   cd backend && npm test
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import { _reiniciarRateLimit, LIMITE_POR_IP_MIN, LIMITE_POR_CLAVE_DIA } from '../src/routes/captura.js';
import { normalizarTelefono, partirNombre, neutralizarCsv, parsearCuerpo, mapearEtapa, origenPermitido } from '../src/utils/captura.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'captura-test.local';
let server; let base; let asesorA; let asesorB; let tokenA; let tokenB;

async function crearUsuario(nombre) {
  return prisma.usuario.create({
    data: {
      nombre, apellidoP: 'Prueba', email: `${nombre.toLowerCase()}-${Date.now()}@${DOMINIO}`,
      password: 'x', rol: 'ASESOR', activo: true,
    },
  });
}

const api = (path, { token, ...opts } = {}) => fetch(`${base}${path}`, {
  ...opts,
  headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});
const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const textoPlano = (body) => ({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });

async function crearFuente(token, nombre, extra = {}) {
  const r = await api('/api/fuentes-captura', { token, ...json({ nombre, ...extra }) });
  assert.equal(r.status, 201);
  return r.json();
}

// Teléfono único por test para no chocar con la deduplicación.
let seq = 0;
const telefonoUnico = () => `55${String(Date.now()).slice(-6)}${String(seq++).padStart(2, '0')}`;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  asesorA = await crearUsuario('LeadA');
  asesorB = await crearUsuario('LeadB');
  tokenA = signToken(asesorA);
  tokenB = signToken(asesorB);
});

after(async () => {
  await prisma.capturaLead.deleteMany({ where: { clienteId: null, fuente: { usuario: { email: { endsWith: `@${DOMINIO}` } } } } });
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

beforeEach(() => _reiniciarRateLimit());

// --- Helpers puros --------------------------------------------------------
test('helpers: teléfono, nombre, CSV, cuerpo, etapa, origen', () => {
  assert.equal(normalizarTelefono('81 1234-5678'), '+528112345678');
  assert.equal(normalizarTelefono('+52 1 81 1234 5678'), '+528112345678');
  assert.equal(normalizarTelefono(''), null);
  assert.deepEqual(partirNombre('Ana María López'), { nombre: 'Ana María', apellidoP: 'López' });
  assert.deepEqual(partirNombre('Ana'), { nombre: 'Ana', apellidoP: '' });
  assert.equal(neutralizarCsv('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(neutralizarCsv('Hola'), 'Hola');
  assert.deepEqual(parsearCuerpo('{"a":1}', 'text/plain'), { a: 1 });
  assert.deepEqual(parsearCuerpo('a=1&b=2', 'application/x-www-form-urlencoded'), { a: '1', b: '2' });
  assert.equal(parsearCuerpo('{roto', 'text/plain'), null);
  assert.equal(mapearEtapa('cita'), 'CITA');
  assert.equal(mapearEtapa('formulario_agenda'), null);
  assert.equal(origenPermitido('https://www.x.com', ['x.com']), true);
  assert.equal(origenPermitido('https://malo.com', ['x.com']), false);
  assert.equal(origenPermitido(undefined, []), true);
});

// --- Endpoint público -----------------------------------------------------
test('clave válida crea el lead en el asesor dueño, con actividad, notificación y marca Nuevo', async () => {
  const fuente = await crearFuente(tokenA, 'Landing tarjeta QR');
  assert.ok(fuente.clave.length >= 32);
  const tel = telefonoUnico();
  const r = await api(`/api/captura/${fuente.clave}`, json({
    nombre: 'Laura Gómez', telefono: tel, modalidad: 'Virtual', origen: 'tarjeta_qr',
    etapa: 'formulario_agenda', fecha: new Date().toISOString(), presupuesto: '1500', utm_source: 'qr',
  }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });

  const cliente = await prisma.cliente.findFirst({ where: { fuenteCapturaId: fuente.id }, include: { capturas: true } });
  assert.equal(cliente.asesorId, asesorA.id);
  assert.equal(cliente.nombre, 'Laura');
  assert.equal(cliente.apellidoP, 'Gómez');
  assert.equal(cliente.telefono, `+52${tel}`);
  assert.equal(cliente.estado, 'PROSPECTO'); // etapa desconocida → la de la fuente
  assert.equal(cliente.fuente, 'tarjeta_qr');
  assert.equal(cliente.leadSinVer, true);
  assert.equal(cliente.capturas[0].etapaOriginal, 'formulario_agenda');
  assert.equal(cliente.capturas[0].modalidad, 'Virtual');
  assert.deepEqual(cliente.capturas[0].datosExtra, { presupuesto: '1500', utm_source: 'qr' });
  assert.ok(cliente.capturas[0].ipHash && !cliente.capturas[0].ipHash.includes('127.0.0.1'));

  const act = await prisma.actividad.findFirst({ where: { asesorId: asesorA.id, tipo: 'LEAD_RECIBIDO' } });
  assert.equal(act.metadata.clienteId, cliente.id);
  const notif = await prisma.notificacion.findFirst({ where: { destinatarioId: asesorA.id, tipo: 'LEAD_RECIBIDO' } });
  assert.ok(notif);
  const f = await prisma.fuenteCaptura.findUnique({ where: { id: fuente.id } });
  assert.equal(f.totalRecibidos, 1);
  assert.ok(f.ultimoUsoEn);
});

test('la clave de otro asesor no mezcla datos (ni al crear ni al listar)', async () => {
  const fuenteB = await crearFuente(tokenB, 'Landing de B');
  const tel = telefonoUnico();
  await api(`/api/captura/${fuenteB.clave}`, json({ nombre: 'Pedro B', telefono: tel }));

  const cliente = await prisma.cliente.findFirst({ where: { fuenteCapturaId: fuenteB.id } });
  assert.equal(cliente.asesorId, asesorB.id);

  // A no ve la fuente de B ni sus leads, ni pidiéndolos por id.
  const fuentesA = await (await api('/api/fuentes-captura', { token: tokenA })).json();
  assert.ok(!fuentesA.some((f) => f.id === fuenteB.id));
  const leadsA = await (await api(`/api/fuentes-captura/leads?fuenteId=${fuenteB.id}`, { token: tokenA })).json();
  assert.equal(leadsA.total, 0);
  // Ni puede pausarla, regenerarla o borrarla.
  const r = await api(`/api/fuentes-captura/${fuenteB.id}`, { token: tokenA, method: 'DELETE' });
  assert.equal(r.status, 403);
  // Y el mismo teléfono enviado a una fuente de A crea un cliente NUEVO en A
  // (la deduplicación es por asesor).
  const fuenteA = await crearFuente(tokenA, 'Otra de A');
  await api(`/api/captura/${fuenteA.clave}`, json({ nombre: 'Pedro B', telefono: tel }));
  const enA = await prisma.cliente.findFirst({ where: { fuenteCapturaId: fuenteA.id } });
  assert.equal(enA.asesorId, asesorA.id);
});

test('clave inexistente o fuente pausada → 404', async () => {
  const r1 = await api('/api/captura/no-existe-esta-clave', json({ nombre: 'X', telefono: '5512345678' }));
  assert.equal(r1.status, 404);

  const fuente = await crearFuente(tokenA, 'Pausada');
  const p = await api(`/api/fuentes-captura/${fuente.id}`, {
    token: tokenA, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activa: false }),
  });
  assert.equal(p.status, 200);
  const r2 = await api(`/api/captura/${fuente.clave}`, json({ nombre: 'X', telefono: telefonoUnico() }));
  assert.equal(r2.status, 404);
});

test('regenerar la clave invalida la anterior', async () => {
  const fuente = await crearFuente(tokenA, 'Regenerable');
  const nueva = await (await api(`/api/fuentes-captura/${fuente.id}/regenerar`, { token: tokenA, method: 'POST' })).json();
  assert.notEqual(nueva.clave, fuente.clave);
  assert.equal((await api(`/api/captura/${fuente.clave}`, json({ nombre: 'X' }))).status, 404);
  assert.equal((await api(`/api/captura/${nueva.clave}`, json({ nombre: 'X' }))).status, 200);
});

test('text/plain con JSON (fetch no-cors) y form-urlencoded funcionan', async () => {
  const fuente = await crearFuente(tokenA, 'No-cors');
  const tel1 = telefonoUnico();
  const r1 = await api(`/api/captura/${fuente.clave}`, textoPlano({ nombre: 'Texto Plano', telefono: tel1 }));
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('access-control-allow-origin'), '*');

  const tel2 = telefonoUnico();
  const r2 = await api(`/api/captura/${fuente.clave}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ nombre: 'Form Url', telefono: tel2 }).toString(),
  });
  assert.equal(r2.status, 200);
  assert.equal(await prisma.cliente.count({ where: { fuenteCapturaId: fuente.id } }), 2);

  const pre = await api(`/api/captura/${fuente.clave}`, { method: 'OPTIONS', headers: { Origin: 'https://landing.com' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
});

test('sin nombre ni teléfono → 400; cuerpo > 10 KB → 413', async () => {
  const fuente = await crearFuente(tokenA, 'Validación');
  assert.equal((await api(`/api/captura/${fuente.clave}`, json({ email: 'a@b.com' }))).status, 400);
  assert.equal((await api(`/api/captura/${fuente.clave}`, textoPlano({ nombre: 'x'.repeat(11 * 1024) }))).status, 413);
});

test('honeypot con contenido se descarta en silencio (200, sin cliente)', async () => {
  const fuente = await crearFuente(tokenA, 'Honeypot');
  const r = await api(`/api/captura/${fuente.clave}`, json({ nombre: 'Bot', telefono: telefonoUnico(), website: 'http://spam.com' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(await prisma.cliente.count({ where: { fuenteCapturaId: fuente.id } }), 0);
  const cap = await prisma.capturaLead.findFirst({ where: { fuenteId: fuente.id } });
  assert.equal(cap.resultado, 'SPAM');
});

test('teléfono duplicado no crea cliente: agrega captura + actividad y responde 200', async () => {
  const fuente = await crearFuente(tokenA, 'Duplicados');
  const tel = telefonoUnico();
  // Cliente capturado a mano con otro formato del mismo número.
  const manual = await prisma.cliente.create({
    data: { asesorId: asesorA.id, nombre: 'Rosa', apellidoP: 'Manual', telefono: `${tel.slice(0, 2)} ${tel.slice(2, 6)} ${tel.slice(6)}` },
  });
  const r = await api(`/api/captura/${fuente.clave}`, json({ nombre: 'Rosa M', telefono: `+52${tel}`, modalidad: 'Presencial' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(await prisma.cliente.count({ where: { fuenteCapturaId: fuente.id } }), 0);
  const cap = await prisma.capturaLead.findFirst({ where: { fuenteId: fuente.id } });
  assert.equal(cap.resultado, 'DUPLICADO');
  assert.equal(cap.clienteId, manual.id);
  const act = await prisma.actividad.findFirst({ where: { asesorId: asesorA.id, tipo: 'LEAD_RECIBIDO', metadata: { path: ['clienteId'], equals: manual.id } } });
  assert.equal(act.metadata.duplicado, true);
  assert.equal((await prisma.cliente.findUnique({ where: { id: manual.id } })).leadSinVer, true);
});

test('dominios permitidos: origen ajeno → 403', async () => {
  const fuente = await crearFuente(tokenA, 'Con dominio', { dominiosPermitidos: 'https://milanding.com/ruta' });
  assert.deepEqual(fuente.dominiosPermitidos, ['milanding.com']);
  const ok = await api(`/api/captura/${fuente.clave}`, { ...json({ nombre: 'Ok', telefono: telefonoUnico() }), headers: { 'Content-Type': 'application/json', Origin: 'https://www.milanding.com' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://www.milanding.com');
  const malo = await api(`/api/captura/${fuente.clave}`, { ...json({ nombre: 'No', telefono: telefonoUnico() }), headers: { 'Content-Type': 'application/json', Origin: 'https://otro.com' } });
  assert.equal(malo.status, 403);
});

test('rate limit por IP → 429 al pasar de 10/min', async () => {
  const fuente = await crearFuente(tokenA, 'Rate IP');
  const estados = [];
  for (let i = 0; i < LIMITE_POR_IP_MIN + 1; i += 1) {
    estados.push((await api(`/api/captura/${fuente.clave}`, json({ nombre: `R${i}`, telefono: telefonoUnico() }))).status);
  }
  assert.equal(estados.filter((s) => s === 200).length, LIMITE_POR_IP_MIN);
  assert.equal(estados.at(-1), 429);
});

test('rate limit por clave → 429 al llegar a 200 en 24 h', async () => {
  const fuente = await crearFuente(tokenA, 'Rate clave');
  await prisma.capturaLead.createMany({
    data: Array.from({ length: LIMITE_POR_CLAVE_DIA }, () => ({ fuenteId: fuente.id, resultado: 'SPAM' })),
  });
  const r = await api(`/api/captura/${fuente.clave}`, json({ nombre: 'Uno más', telefono: telefonoUnico() }));
  assert.equal(r.status, 429);
});

test('abrir la ficha como dueño apaga la marca Nuevo', async () => {
  const fuente = await crearFuente(tokenA, 'Ficha');
  await api(`/api/captura/${fuente.clave}`, json({ nombre: 'Visto Pronto', telefono: telefonoUnico(), color: 'azul' }));
  const c = await prisma.cliente.findFirst({ where: { fuenteCapturaId: fuente.id } });
  const antes = await (await api('/api/fuentes-captura/sin-ver', { token: tokenA })).json();
  const ficha = await (await api(`/api/clientes/${c.id}`, { token: tokenA })).json();
  assert.equal(ficha.fuenteCaptura.nombre, 'Ficha');
  assert.deepEqual(ficha.capturas[0].datosExtra, { color: 'azul' });
  const despues = await (await api('/api/fuentes-captura/sin-ver', { token: tokenA })).json();
  assert.equal(despues.total, antes.total - 1);
});
