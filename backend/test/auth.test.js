// Tests de integración del inicio de sesión y de la gestión de cuentas
// (2026-10-21): mensajes del login, freno de fuerza bruta y que nadie pueda
// ponerle contraseña a otra cuenta (el hueco por el que un admin podía
// quedarse con la del Súper Admin). Corren contra la base de DESARROLLO del
// .env con usuarios propios (@auth-test.local) que se borran al final.
//
//   cd backend && npm test
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import { _reiniciarLimiteLogin, MAX_FALLOS_CUENTA } from '../src/utils/limiteLogin.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'auth-test.local';
const PASSWORD = 'correcta-123';
let server; let base;
const u = {};

const crearUsuario = async (nombre, rol, { activo = true } = {}) => prisma.usuario.create({
  data: {
    nombre, apellidoP: 'Prueba', rol, activo,
    email: `${nombre.toLowerCase()}-${Date.now()}@${DOMINIO}`,
    password: await bcrypt.hash(PASSWORD, 10),
  },
});

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const login = (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } });

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  u.superadmin = await crearUsuario('Super', 'SUPERADMIN');
  u.promotora = await crearUsuario('Promo', 'ADMIN');
  u.secretaria = await crearUsuario('Secre', 'ASISTENTE');
  u.asesor = await crearUsuario('Ase', 'ASESOR');
  u.inactivo = await crearUsuario('Inactivo', 'ASESOR', { activo: false });
  u.cambia = await crearUsuario('Cambia', 'ASESOR');
  u.perdido = await crearUsuario('Perdido', 'ASESOR');
  for (const k of Object.keys(u)) u[k].token = signToken(u[k]);
});

beforeEach(() => _reiniciarLimiteLogin());

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

test('login correcto: devuelve token, acepta mayúsculas y espacios en el correo', async () => {
  const r = await login(`  ${u.asesor.email.toUpperCase()} `, PASSWORD);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(data.token);
  assert.equal(data.usuario.password, undefined);
});

test('contraseña equivocada y correo inexistente responden lo mismo (no delata cuentas)', async () => {
  const a = await login(u.asesor.email, 'otra-cosa');
  const b = await login(`nadie-${Date.now()}@${DOMINIO}`, 'otra-cosa');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
});

test('cuenta desactivada: con la contraseña correcta se explica, con la equivocada no', async () => {
  const ok = await login(u.inactivo.email, PASSWORD);
  assert.equal(ok.status, 403);
  assert.match((await ok.json()).error, /desactivada/);
  const mal = await login(u.inactivo.email, 'otra-cosa');
  assert.equal(mal.status, 401);
});

test('freno de fuerza bruta: tras 5 fallos se bloquea aunque luego acierte, y avisa cuánto esperar', async () => {
  for (let i = 0; i < MAX_FALLOS_CUENTA; i++) {
    assert.equal((await login(u.asesor.email, `mal-${i}`)).status, 401);
  }
  const r = await login(u.asesor.email, PASSWORD);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.match((await r.json()).error, /Espera \d+ minuto/);
});

test('un login correcto limpia los fallos previos de esa cuenta', async () => {
  for (let i = 0; i < MAX_FALLOS_CUENTA - 1; i++) await login(u.asesor.email, `mal-${i}`);
  assert.equal((await login(u.asesor.email, PASSWORD)).status, 200);
  for (let i = 0; i < MAX_FALLOS_CUENTA - 1; i++) await login(u.asesor.email, `mal-${i}`);
  assert.equal((await login(u.asesor.email, PASSWORD)).status, 200);
});

test('cuerpo malformado (password no-string) es 400, no 500', async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: { email: u.asesor.email, password: { $ne: '' } } });
  assert.equal(r.status, 400);
});

test('nadie puede ponerle contraseña a otra cuenta por PATCH /usuarios (ni a la del Súper Admin)', async () => {
  for (const actor of ['promotora', 'secretaria']) {
    for (const objetivo of ['superadmin', 'asesor']) {
      const r = await api(`/api/usuarios/${u[objetivo].id}`, { token: u[actor].token, method: 'PATCH', body: { password: 'hackeada-123' } });
      assert.equal(r.status, 400, `${actor} → ${objetivo}`);
    }
  }
  // La contraseña original sigue funcionando.
  assert.equal((await login(u.superadmin.email, PASSWORD)).status, 200);
  assert.equal((await login(u.superadmin.email, 'hackeada-123')).status, 401);
});

test('la cuenta de Súper Admin no se desactiva ni se edita desde la app', async () => {
  const r = await api(`/api/usuarios/${u.superadmin.id}`, { token: u.promotora.token, method: 'PATCH', body: { activo: false } });
  assert.equal(r.status, 403);
  const sigue = await prisma.usuario.findUnique({ where: { id: u.superadmin.id }, select: { activo: true } });
  assert.equal(sigue.activo, true);
});

test('nadie se desactiva a sí mismo; editar a otro asesor sigue funcionando', async () => {
  const yo = await api(`/api/usuarios/${u.promotora.id}`, { token: u.promotora.token, method: 'PATCH', body: { activo: false } });
  assert.equal(yo.status, 400);
  const otro = await api(`/api/usuarios/${u.asesor.id}`, { token: u.promotora.token, method: 'PATCH', body: { telefono: '5512345678' } });
  assert.equal(otro.status, 200);
});

test('un token de propósito específico (state de Google Calendar) no sirve como sesión', async () => {
  const state = jwt.sign({ sub: u.asesor.id, uso: 'google-calendar' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' });
  assert.equal((await api('/api/auth/me', { token: state })).status, 401);
  assert.equal((await api('/api/auth/me', { token: u.asesor.token })).status, 200);
});

test('un token firmado con otro algoritmo se rechaza', async () => {
  const falso = jwt.sign({ sub: u.superadmin.id }, process.env.JWT_SECRET, { algorithm: 'HS512' });
  assert.equal((await api('/api/auth/me', { token: falso })).status, 401);
});

test('cambiar contraseña exige mínimo 8 caracteres', async () => {
  const r = await api('/api/auth/cambiar-password', { token: u.asesor.token, method: 'POST', body: { actual: PASSWORD, nueva: 'corta' } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /8 caracteres/);
});

// Token emitido "hace un rato" (iat en el pasado): la marca de cierre se
// redondea al segundo, así que un token firmado en el mismo segundo que la
// marca seguiría valiendo y el test no probaría nada.
const tokenViejo = (usuario) => jwt.sign(
  { sub: usuario.id, rol: usuario.rol, email: usuario.email, iat: Math.floor(Date.now() / 1000) - 60 },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' },
);

test('cambiar la contraseña cierra las demás sesiones y deja dentro a este dispositivo', async () => {
  const otroDispositivo = tokenViejo(u.cambia);
  const este = tokenViejo(u.cambia);
  assert.equal((await api('/api/auth/me', { token: otroDispositivo })).status, 200);

  const r = await api('/api/auth/cambiar-password', { token: este, method: 'POST', body: { actual: PASSWORD, nueva: 'nueva-segura-456' } });
  assert.equal(r.status, 200);
  const { token: nuevo } = await r.json();

  assert.equal((await api('/api/auth/me', { token: otroDispositivo })).status, 401);
  assert.equal((await api('/api/auth/me', { token: nuevo })).status, 200);
  assert.equal((await login(u.cambia.email, 'nueva-segura-456')).status, 200);
  assert.equal((await login(u.cambia.email, PASSWORD)).status, 401);
});

test('contraseña actual equivocada: 400 (no 401, no saca a nadie) y no cambia nada', async () => {
  const token = tokenViejo(u.perdido);
  const r = await api('/api/auth/cambiar-password', { token, method: 'POST', body: { actual: 'no-es', nueva: 'otra-segura-789' } });
  assert.equal(r.status, 400);
  assert.equal((await api('/api/auth/me', { token })).status, 200);
});

test('"cerrar sesión en los demás dispositivos": el celular perdido queda fuera', async () => {
  const celularPerdido = tokenViejo(u.perdido);
  const este = tokenViejo(u.perdido);
  const r = await api('/api/auth/cerrar-otras-sesiones', { token: este, method: 'POST' });
  assert.equal(r.status, 200);
  const { token: nuevo } = await r.json();
  assert.equal((await api('/api/clientes', { token: celularPerdido })).status, 401);
  assert.equal((await api('/api/auth/me', { token: nuevo })).status, 200);
  // Y se puede volver a entrar normal con correo y contraseña.
  assert.equal((await login(u.perdido.email, PASSWORD)).status, 200);
});

test('/auth/me no expone la marca interna de sesiones', async () => {
  const r = await api('/api/auth/me', { token: u.asesor.token });
  const { usuario } = await r.json();
  assert.equal('sesionesDesde' in usuario, false);
});
