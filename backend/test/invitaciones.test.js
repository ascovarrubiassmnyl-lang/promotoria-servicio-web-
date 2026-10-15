// Tests de integración de invitaciones a citas (2026-10-15): la promotora o
// la secretaria convocan una "Reunión de equipo" (junta de arranque,
// capacitación), cada invitado recibe la notificación con enlace directo, la
// ve en Hoy y responde. Corren contra la base de DESARROLLO del .env con
// usuarios propios (@invitaciones-test.local) que se borran al final (cascada).
//
//   cd backend && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import { fechaHoraAviso } from '../src/utils/fechas.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'invitaciones-test.local';
let server; let base;
const u = {};

const crearUsuario = (nombre, rol) => prisma.usuario.create({
  data: { nombre, apellidoP: 'Prueba', email: `${nombre.toLowerCase()}-${Date.now()}@${DOMINIO}`, password: 'x', rol, activo: true },
});

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// Mañana a las 10:00 hora de México (16:00 UTC), una hora.
const manana = () => {
  const ini = new Date(); ini.setUTCDate(ini.getUTCDate() + 1); ini.setUTCHours(16, 0, 0, 0);
  return { fechaHoraInicio: ini.toISOString(), fechaHoraFin: new Date(ini.getTime() + 3600e3).toISOString() };
};

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  u.promotora = await crearUsuario('Promo', 'ADMIN');
  u.secretaria = await crearUsuario('Secre', 'ASISTENTE');
  u.ase1 = await crearUsuario('AseUno', 'ASESOR');
  u.ase2 = await crearUsuario('AseDos', 'ASESOR');
  for (const k of Object.keys(u)) u[k].token = signToken(u[k]);
});

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

test('invitables: cualquier rol ve a todo el equipo (incluida la secretaria), nunca al SUPERADMIN', async () => {
  const r = await api('/api/usuarios/invitables', { token: u.ase1.token });
  assert.equal(r.status, 200);
  const lista = await r.json();
  const ids = new Set(lista.map((p) => p.id));
  for (const k of ['promotora', 'secretaria', 'ase2']) assert.ok(ids.has(u[k].id), `falta ${k}`);
  assert.ok(lista.every((p) => p.rol !== 'SUPERADMIN'));
  // El estado del aviso al celular solo lo ve quien administra.
  assert.ok(lista.every((p) => !('pushActivo' in p)));
  const admin = await (await api('/api/usuarios/invitables', { token: u.promotora.token })).json();
  assert.equal(admin.find((p) => p.id === u.ase1.id).pushActivo, false);
});

test('reunión de equipo: solo la promotoría la crea y exige invitados', async () => {
  const base_ = { titulo: 'Junta', modalidad: 'REUNION_EQUIPO', ...manana() };
  const asesor = await api('/api/citas', { token: u.ase1.token, method: 'POST', body: { ...base_, invitadosIds: [u.ase2.id] } });
  assert.equal(asesor.status, 403);
  const sinInvitados = await api('/api/citas', { token: u.promotora.token, method: 'POST', body: base_ });
  assert.equal(sinInvitados.status, 400);
});

test('la secretaria convoca a nombre de la promotora: cada invitado recibe aviso, lo ve en Hoy y responde', async () => {
  const horario = manana();
  const r = await api('/api/citas', {
    token: u.secretaria.token,
    method: 'POST',
    body: {
      titulo: 'Junta de arranque', modalidad: 'REUNION_EQUIPO', tipo: 'PRESENCIAL', ...horario,
      asesorId: u.promotora.id, invitadosIds: [u.ase1.id, u.ase2.id, u.secretaria.id],
    },
  });
  assert.equal(r.status, 201, await r.clone().text());
  const { cita } = await r.json();
  assert.equal(cita.asesorId, u.promotora.id);
  assert.equal(cita.clasificacion, 'GESTION');
  assert.equal(cita.invitados.length, 3);

  // Notificación en la bandeja de cada invitado, con enlace directo y la hora de México.
  for (const k of ['ase1', 'ase2', 'secretaria']) {
    const bandeja = await (await api('/api/notificaciones', { token: u[k].token })).json();
    const n = bandeja.notificaciones.find((x) => x.tipo === 'CITA_INVITACION' && x.datos?.citaId === cita.id);
    assert.ok(n, `${k} no recibió la invitación`);
    assert.equal(n.datos.url, `/citas?cita=${cita.id}`);
    assert.equal(n.titulo, 'Nueva reunión de equipo');
    assert.match(n.cuerpo, /Promo Prueba te invitó/);
    assert.match(n.cuerpo, /lo agendó Secre Prueba/);
    assert.ok(n.cuerpo.includes(fechaHoraAviso(horario.fechaHoraInicio)));
  }

  // El asesor invitado la ve en su calendario y en Hoy, y puede abrirla por enlace.
  const citas = await (await api(`/api/citas?desde=${horario.fechaHoraInicio}`, { token: u.ase1.token })).json();
  assert.ok(citas.some((c) => c.id === cita.id));
  assert.equal((await api(`/api/citas/${cita.id}`, { token: u.ase1.token })).status, 200);
  const hoy = await (await api('/api/hoy', { token: u.ase1.token })).json();
  const pendiente = hoy.invitaciones.find((i) => i.id === cita.id);
  assert.ok(pendiente?.invitadoId, 'no aparece en Hoy');

  // Responde desde Hoy: deja de estar pendiente y le avisa a la promotora.
  const resp = await api(`/api/citas/${cita.id}/invitados/${pendiente.invitadoId}`, { token: u.ase1.token, method: 'PATCH', body: { respuesta: 'ACEPTADA' } });
  assert.equal(resp.status, 200);
  const hoyDespues = await (await api('/api/hoy', { token: u.ase1.token })).json();
  assert.ok(!hoyDespues.invitaciones.some((i) => i.id === cita.id));
  const bandejaPromo = await (await api('/api/notificaciones', { token: u.promotora.token })).json();
  assert.ok(bandejaPromo.notificaciones.some((x) => x.tipo === 'CITA_INVITACION_RESPUESTA' && x.datos?.citaId === cita.id));

  // Un invitado no puede editar la reunión.
  assert.equal((await api(`/api/citas/${cita.id}`, { token: u.ase2.token, method: 'PATCH', body: { titulo: 'X' } })).status, 403);
});

test('la reunión de equipo no cuenta como cita en el proceso de ventas', async () => {
  const proceso = await (await api(`/api/metricas/proceso-ventas?asesorId=${u.promotora.id}`, { token: u.promotora.token })).json();
  assert.equal(proceso.niveles.find((n) => n.clave === 'CITAS').count, 0);
});
