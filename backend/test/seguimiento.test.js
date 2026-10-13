// Tests de integración del "punto único de captura" (2026-10-13):
// POST /api/clientes/:id/llamada, alta de cita que mueve la etapa, bitácora de
// cambio de etapa y validación de teléfono/apellido. Corren contra la base de
// DESARROLLO del .env con usuarios propios (@seguimiento-test.local) que se
// borran al final (cascada).
//
//   cd backend && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import { inicioSemana } from '../src/utils/clinica.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'seguimiento-test.local';
let server; let base; let asesor; let otro; let token; let tokenOtro;

async function crearUsuario(nombre) {
  return prisma.usuario.create({
    data: {
      nombre, apellidoP: 'Prueba', email: `${nombre.toLowerCase()}-${Date.now()}@${DOMINIO}`,
      password: 'x', rol: 'ASESOR', activo: true,
    },
  });
}

const api = (path, { token: t, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

async function crearCliente(body = {}) {
  const r = await api('/api/clientes', { token, method: 'POST', body: { nombre: 'Ana', apellidoP: 'Test', telefono: '4441234567', ...body } });
  assert.equal(r.status, 201, await r.clone().text());
  return r.json();
}

const hoyMx = () => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())}T00:00:00.000Z`);
const puntosHoy = (asesorId) => prisma.registroPuntos.findUnique({ where: { asesorId_fecha: { asesorId, fecha: hoyMx() } } });

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  asesor = await crearUsuario('SegA');
  otro = await crearUsuario('SegB');
  token = signToken(asesor);
  tokenOtro = signToken(otro);
});

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

test('alta: solo el nombre es obligatorio y el teléfono se valida y normaliza', async () => {
  const sinApellido = await crearCliente({ nombre: 'Beni', apellidoP: '' });
  assert.equal(sinApellido.apellidoP, '');
  assert.equal(sinApellido.telefono, '+524441234567');

  const conEspacios = await crearCliente({ telefono: '444 288 3565' });
  assert.equal(conEspacios.telefono, '+524442883565');

  const malo = await api('/api/clientes', { token, method: 'POST', body: { nombre: 'X', telefono: 'abc123' } });
  assert.equal(malo.status, 400);
  const corto = await api('/api/clientes', { token, method: 'POST', body: { nombre: 'X', telefono: '12345' } });
  assert.equal(corto.status, 400);
  const sinNombre = await api('/api/clientes', { token, method: 'POST', body: { nombre: '  ' } });
  assert.equal(sinNombre.status, 400);

  const patchMalo = await api(`/api/clientes/${sinApellido.id}`, { token, method: 'PATCH', body: { telefono: 'hola' } });
  assert.equal(patchMalo.status, 400);
});

test('llamada CONTACTADO: actividad, etapa, clínica y 25 puntos', async () => {
  const c = await crearCliente();
  assert.equal(c.enClinica, true);
  const antes = (await puntosHoy(asesor.id))?.llamadasRealizadas || 0;

  const r = await api(`/api/clientes/${c.id}/llamada`, { token, method: 'POST', body: { resultado: 'CONTACTADO', nota: 'Le interesa GMM' } });
  assert.equal(r.status, 201);

  const cli = await prisma.cliente.findUnique({ where: { id: c.id } });
  assert.equal(cli.estado, 'CONTACTADO');
  assert.ok(cli.fechaUltimaLlamada);

  const fila = await prisma.prospectoClinica.findFirst({ where: { clienteId: c.id, semanaInicio: inicioSemana() } });
  assert.equal(fila.resultado, 'CONTACTADO');

  const act = await prisma.actividad.findFirst({ where: { asesorId: asesor.id, tipo: 'LLAMADA', metadata: { path: ['clienteId'], equals: c.id } } });
  assert.equal(act.metadata.resultado, 'CONTACTADO');
  assert.equal(act.metadata.nota, 'Le interesa GMM');

  assert.equal((await puntosHoy(asesor.id)).llamadasRealizadas, antes + 1);
});

test('llamada NO_CONTESTO: no cambia etapa ni clínica, pero deja recordatorio', async () => {
  const c = await crearCliente();
  const recordarEn = new Date(Date.now() + 86400000).toISOString();
  const r = await api(`/api/clientes/${c.id}/llamada`, { token, method: 'POST', body: { resultado: 'NO_CONTESTO', recordarEn } });
  assert.equal(r.status, 201);
  const { recordatorio } = await r.json();
  assert.equal(recordatorio.tipo, 'RECORDATORIO');
  assert.equal(new Date(recordatorio.fechaAviso).toISOString(), recordarEn);

  const cli = await prisma.cliente.findUnique({ where: { id: c.id } });
  assert.equal(cli.estado, 'PROSPECTO');
  const fila = await prisma.prospectoClinica.findFirst({ where: { clienteId: c.id } });
  assert.equal(fila.resultado, 'PENDIENTE');
});

test('llamada NO_INTERESADO: descarta en ficha y clínica', async () => {
  const c = await crearCliente();
  const r = await api(`/api/clientes/${c.id}/llamada`, { token, method: 'POST', body: { resultado: 'NO_INTERESADO' } });
  assert.equal(r.status, 201);
  assert.equal((await prisma.cliente.findUnique({ where: { id: c.id } })).estado, 'DESCARTADO');
  assert.equal((await prisma.prospectoClinica.findFirst({ where: { clienteId: c.id } })).resultado, 'DESCARTADO');
});

test('llamada: no retrocede a un cliente que ya va más adelante', async () => {
  const c = await crearCliente({ estado: 'PROPUESTA' });
  await api(`/api/clientes/${c.id}/llamada`, { token, method: 'POST', body: { resultado: 'CONTACTADO' } });
  assert.equal((await prisma.cliente.findUnique({ where: { id: c.id } })).estado, 'PROPUESTA');
});

test('llamada: resultado inválido → 400; cliente ajeno → 403', async () => {
  const c = await crearCliente();
  assert.equal((await api(`/api/clientes/${c.id}/llamada`, { token, method: 'POST', body: { resultado: 'X' } })).status, 400);
  assert.equal((await api(`/api/clientes/${c.id}/llamada`, { token: tokenOtro, method: 'POST', body: { resultado: 'CONTACTADO' } })).status, 403);
});

test('agendar cita desde la ficha: sube a CITA, cierra la clínica y suma cita obtenida', async () => {
  const c = await crearCliente();
  const antes = (await puntosHoy(asesor.id))?.citasObtenidas || 0;
  const inicio = new Date(Date.now() + 3 * 86400000);
  inicio.setUTCMinutes(0, 0, 0);
  const r = await api('/api/citas', {
    token, method: 'POST',
    body: {
      clienteId: c.id, titulo: 'Cita prueba', tipo: 'PRESENCIAL',
      fechaHoraInicio: inicio.toISOString(),
      fechaHoraFin: new Date(inicio.getTime() + 30 * 60000).toISOString(),
      ignorarEmpalme: true,
    },
  });
  assert.equal(r.status, 201, await r.clone().text());
  // La clínica se cierra en segundo plano (mejor esfuerzo): margen corto.
  await new Promise((res) => setTimeout(res, 200));

  const cli = await prisma.cliente.findUnique({ where: { id: c.id } });
  assert.equal(cli.estado, 'CITA');
  assert.equal(cli.fechaUltimaCita.toISOString(), inicio.toISOString());
  assert.equal((await prisma.prospectoClinica.findFirst({ where: { clienteId: c.id } })).resultado, 'CITA_OBTENIDA');
  assert.equal((await puntosHoy(asesor.id)).citasObtenidas, antes + 1);
});

test('cambiar etapa queda en la bitácora con de → a y motivo', async () => {
  const c = await crearCliente();
  const r = await api(`/api/clientes/${c.id}`, { token, method: 'PATCH', body: { estado: 'PROPUESTA', motivo: 'Ya vio la cotización' } });
  assert.equal(r.status, 200);
  const act = await prisma.actividad.findFirst({ where: { tipo: 'CLIENTE_ETAPA', metadata: { path: ['clienteId'], equals: c.id } } });
  assert.equal(act.metadata.de, 'PROSPECTO');
  assert.equal(act.metadata.a, 'PROPUESTA');
  assert.equal(act.metadata.nota, 'Ya vio la cotización');
});

test('prospectos sin avance: un solo aviso agrupado por asesor, sin repetir', async () => {
  const { prospectosEstancados } = await import('../src/jobs/automatizacionesJob.js');
  const a = await crearCliente({ nombre: 'Uno' });
  const b = await crearCliente({ nombre: 'Dos' });
  const c = await crearCliente({ nombre: 'Tres' });
  const ids = [a.id, b.id, c.id];
  // La clínica no cuenta como siguiente paso; los recordatorios sí: no hay.
  await prisma.$executeRaw`UPDATE "Cliente" SET "actualizadoEn" = now() - interval '20 days' WHERE id IN (${a.id}, ${b.id}, ${c.id})`;

  await prospectosEstancados();
  const avisos = await prisma.notificacion.findMany({ where: { destinatarioId: asesor.id, tipo: 'PROSPECTO_ESTANCADO' } });
  assert.equal(avisos.length, 1);
  assert.deepEqual([...avisos[0].datos.clienteIds].sort(), [...ids].sort());
  assert.match(avisos[0].titulo, /^3 prospectos sin avance/);

  await prospectosEstancados();
  assert.equal(await prisma.notificacion.count({ where: { destinatarioId: asesor.id, tipo: 'PROSPECTO_ESTANCADO' } }), 1);
});

test('GET /hoy: citas de hoy, recordatorios vencidos, leads y a quién llamar, solo míos', async () => {
  const lead = await crearCliente({ nombre: 'LeadHoy' });
  const conCita = await crearCliente({ nombre: 'CitaHoy' });
  // Cita dentro de hoy en México: dentro de 5 minutos (si es casi medianoche
  // podría caer mañana; se acota al final del día).
  const { rangoHoyMx } = await import('../src/utils/seguimiento.js');
  const { fin } = rangoHoyMx();
  const inicio = new Date(Math.min(Date.now() + 5 * 60000, fin.getTime() - 31 * 60000));
  const rc = await api('/api/citas', {
    token, method: 'POST',
    body: { clienteId: conCita.id, titulo: 'Cita de hoy', tipo: 'TELEFONICA', fechaHoraInicio: inicio.toISOString(), fechaHoraFin: new Date(inicio.getTime() + 30 * 60000).toISOString(), ignorarEmpalme: true },
  });
  assert.equal(rc.status, 201, await rc.clone().text());
  await prisma.nota.create({ data: { asesorId: asesor.id, clienteId: lead.id, tipo: 'RECORDATORIO', texto: 'Vencido', fechaAviso: new Date(Date.now() - 3600000) } });
  await prisma.nota.create({ data: { asesorId: asesor.id, clienteId: lead.id, tipo: 'RECORDATORIO', texto: 'Futuro', fechaAviso: new Date(Date.now() + 5 * 86400000) } });

  const r = await api('/api/hoy', { token });
  assert.equal(r.status, 200);
  const hoy = await r.json();
  assert.ok(hoy.citas.some((c) => c.titulo === 'Cita de hoy'));
  assert.ok(hoy.recordatorios.some((n) => n.texto === 'Vencido' && n.vencido));
  assert.ok(!hoy.recordatorios.some((n) => n.texto === 'Futuro'));
  assert.ok(hoy.leads.some((c) => c.id === lead.id));
  // Con cita hoy ya no aparece en "a quién llamar".
  assert.ok(!hoy.porLlamar.some((p) => p.clienteId === conCita.id));
  assert.equal(hoy.progreso.meta, 25);

  const ajeno = await (await api('/api/hoy', { token: tokenOtro })).json();
  assert.equal(ajeno.citas.length, 0);
  assert.ok(!ajeno.leads.some((c) => c.id === lead.id));
});
