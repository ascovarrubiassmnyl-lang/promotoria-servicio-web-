// Exportar e importar la cartera en Excel (2026-11-19):
// GET /api/clientes/exportar, /plantilla-importacion y POST /importar.
// Corre contra la base de DESARROLLO con usuarios propios
// (@importacion-test.local) que se borran al final (cascada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'importacion-test.local';
let server; let base; let asesor; let otro; let admin; let token; let tokenOtro; let tokenAdmin;

const crearUsuario = (nombre, rol = 'ASESOR') => prisma.usuario.create({
  data: { nombre, apellidoP: 'Prueba', email: `${nombre.toLowerCase()}-${Date.now()}@${DOMINIO}`, password: 'x', rol, activo: true },
});

async function hoja(filas) {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet('Clientes');
  filas.forEach((f) => h.addRow(f));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function importar(buffer, t, campos = {}) {
  const fd = new FormData();
  fd.append('archivo', new Blob([buffer]), 'clientes.xlsx');
  Object.entries(campos).forEach(([k, v]) => fd.append(k, v));
  return fetch(`${base}/api/clientes/importar`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd });
}

async function leerExportado(t, query = '') {
  const r = await fetch(`${base}/api/clientes/exportar${query}`, { headers: { Authorization: `Bearer ${t}` } });
  assert.equal(r.status, 200);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await r.arrayBuffer()));
  const h = libro.getWorksheet('Clientes');
  const enc = h.getRow(1).values.slice(1);
  const filas = [];
  h.eachRow((row, n) => { if (n > 1) filas.push(Object.fromEntries(enc.map((e, i) => [e, row.getCell(i + 1).value]))); });
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), filas };
}

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  asesor = await crearUsuario('ImpA');
  otro = await crearUsuario('ImpB');
  admin = await crearUsuario('ImpAdmin', 'ADMIN');
  token = signToken(asesor); tokenOtro = signToken(otro); tokenAdmin = signToken(admin);
});

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

const ARCHIVO = () => hoja([
  ['Nombre', 'Apellido paterno', 'Teléfono', 'Correo', 'Etapa', 'Fecha de nacimiento', 'Producto de interés', 'Notas'],
  ['Ana', 'López', '444 123 4567', 'ANA@correo.com', 'Propuesta', '15/03/1988', 'Retiro', '=HYPERLINK("x")'],
  ['Beto', '', 4447654321, '', '', '', '', ''],
  ['Ana repetida', 'López', '+52 4441234567', '', '', '', '', ''], // mismo teléfono dentro del archivo
  ['Carla', 'Ruiz', '12345', '', '', '', '', ''],                  // teléfono inválido
  ['', 'Sin nombre', '4440000000', '', '', '', '', ''],            // falta el nombre
  ['Solo nombre', '', '', '', 'Etapa inventada', '31/02/1990', '', ''],
]);

test('simular no escribe nada y reporta nuevos, duplicados y errores', async () => {
  const r = await importar(await ARCHIVO(), token);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.simulacion, true);
  assert.deepEqual([j.total, j.nuevos, j.duplicados, j.totalErrores], [6, 3, 1, 2]);
  assert.equal(await prisma.cliente.count({ where: { asesorId: asesor.id } }), 0);
});

test('confirmar crea los contactos normalizados en la cartera de quien importa', async () => {
  const r = await importar(await ARCHIVO(), token, { confirmar: '1', asesorId: otro.id }); // asesorId ajeno se ignora
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal((await r.json()).creados, 3);
  assert.equal(await prisma.cliente.count({ where: { asesorId: otro.id } }), 0);
  const ana = await prisma.cliente.findFirst({ where: { asesorId: asesor.id, nombre: 'Ana' } });
  assert.equal(ana.telefono, '+524441234567');
  assert.equal(ana.email, 'ana@correo.com');
  assert.equal(ana.estado, 'PROPUESTA');
  assert.equal(ana.productoInteres, 'RETIRO');
  assert.equal(ana.fechaNacimiento.toISOString().slice(0, 10), '1988-03-15');
  assert.equal(ana.fuente, 'Importado de Excel');
  const solo = await prisma.cliente.findFirst({ where: { asesorId: asesor.id, nombre: 'Solo nombre' } });
  assert.equal(solo.estado, 'PROSPECTO');
  assert.equal(solo.fechaNacimiento, null);
});

test('volver a importar el mismo archivo no duplica', async () => {
  const j = await (await importar(await ARCHIVO(), token, { confirmar: '1' })).json();
  assert.deepEqual([j.creados, j.duplicados], [0, 4]);
  assert.equal(await prisma.cliente.count({ where: { asesorId: asesor.id } }), 3);
});

test('exportar: el asesor solo recibe su cartera y el archivo se puede reimportar', async () => {
  const { filas, buffer } = await leerExportado(token, `?asesorId=${otro.id}`);
  assert.equal(filas.length, 3);
  assert.ok(filas.every((f) => f.Asesor === 'ImpA Prueba'));
  const ana = filas.find((f) => f.Nombre === 'Ana');
  assert.equal(ana.Etapa, 'Propuesta');
  assert.equal(ana.Tipo, 'Prospecto');
  assert.equal(typeof ana.Notas, 'string'); // texto, nunca fórmula
  assert.equal((await leerExportado(tokenOtro)).filas.length, 0);
  // El export de A, importado por B, entra completo y conserva la etapa.
  const j = await (await importar(buffer, tokenOtro, { confirmar: '1' })).json();
  assert.equal(j.creados, 3);
  const copia = await prisma.cliente.findFirst({ where: { asesorId: otro.id, nombre: 'Ana' } });
  assert.equal(copia.estado, 'PROPUESTA');
});

test('admin: exporta por asesor y debe decir a quién importa', async () => {
  assert.equal((await leerExportado(tokenAdmin, `?asesorId=${asesor.id}`)).filas.length, 3);
  const archivo = await hoja([['Nombre completo', 'Celular'], ['Diana Pérez Soto', '4449998877']]);
  assert.equal((await importar(archivo, tokenAdmin, { confirmar: '1' })).status, 400);
  assert.equal((await importar(archivo, tokenAdmin, { confirmar: '1', asesorId: 'no-existe' })).status, 400);
  const r = await importar(archivo, tokenAdmin, { confirmar: '1', asesorId: asesor.id });
  assert.equal(r.status, 201);
  const d = await prisma.cliente.findFirst({ where: { asesorId: asesor.id, apellidoP: 'Soto' } });
  assert.equal(d.nombre, 'Diana Pérez');
});

test('archivos que no sirven responden 400 con motivo', async () => {
  assert.equal((await importar(Buffer.from('no soy un excel'), token)).status, 400);
  assert.equal((await importar(await hoja([['Teléfono'], ['4441112233']]), token)).status, 400);
  assert.equal((await importar(await hoja([['Nombre']]), token)).status, 400);
  const r = await fetch(`${base}/api/clientes/plantilla-importacion`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200);
  assert.equal((await fetch(`${base}/api/clientes/exportar`)).status, 401);
});
