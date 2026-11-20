// Bandeja "Contactar ahora" de Inicio (utils/contactar.js, 2026-11-20):
// función pura, sin base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarBandejaContactar } from '../src/utils/contactar.js';

const ahora = new Date('2026-11-20T18:00:00Z'); // 12:00 México
const inicioHoy = new Date('2026-11-20T06:00:00Z');
const cli = (id, extra = {}) => ({ id, nombre: id, apellidoP: 'X', telefono: '5512345678', estado: 'PROSPECTO', fechaUltimaLlamada: null, ...extra });

test('orden: vencido > hoy > esta semana y, dentro de cada grupo, el más antiguo primero', () => {
  const filas = armarBandejaContactar({
    ahora, inicioHoy,
    recordatorios: [
      { id: 'r-hoy', tipo: 'RECORDATORIO', texto: 'Llamar tarde', fechaAviso: new Date('2026-11-20T23:00:00Z'), cliente: cli('a') },
      { id: 'r-viejo', tipo: 'RECORDATORIO_PAGO', texto: 'Cobro', fechaAviso: new Date('2026-11-10T16:00:00Z'), cliente: cli('b') },
    ],
    leads: [
      { ...cli('lead-hoy'), creadoEn: new Date('2026-11-20T15:00:00Z') },
      { ...cli('lead-ayer'), creadoEn: new Date('2026-11-19T15:00:00Z') },
    ],
    porLlamar: [{ id: 'p1', clienteId: null, nombre: 'Sin ficha', telefono: null, cliente: null, creadoEn: new Date('2026-11-16T15:00:00Z') }],
    seguimientos: [{ ...cli('seg'), actualizadoEn: new Date('2026-11-01T15:00:00Z') }],
  });
  assert.deepEqual(filas.map((f) => f.key), [
    'nota:r-viejo', 'lead:lead-ayer', // vencidos, el más antiguo primero
    'seguimiento:seg', 'lead:lead-hoy', 'nota:r-hoy', // hoy
    'clinica:p1', // esta semana
  ]);
  assert.equal(filas[0].motivo, 'Pago de póliza');
  assert.equal(filas.at(-1).tipo, 'CLINICA');
});

test('una persona aparece una sola vez: se queda el motivo más urgente y los demás se cuentan', () => {
  const c = cli('dup');
  const filas = armarBandejaContactar({
    ahora, inicioHoy,
    recordatorios: [{ id: 'r1', tipo: 'RECORDATORIO', texto: 'buscar en un mes', fechaAviso: new Date('2026-11-18T16:00:00Z'), cliente: c }],
    seguimientos: [{ ...c, actualizadoEn: new Date('2026-11-01T00:00:00Z') }],
    porLlamar: [{ id: 'p', clienteId: 'dup', cliente: c, nombre: 'dup X', creadoEn: new Date('2026-11-16T00:00:00Z') }],
  });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].motivo, 'Recordatorio: buscar en un mes');
  assert.deepEqual(filas[0].otrosMotivos, ['Necesita seguimiento', 'Clínica de la semana']);
});

test('quien tiene cita hoy no se lista como lead, seguimiento ni clínica; sus recordatorios sí', () => {
  const c = cli('cita');
  const filas = armarBandejaContactar({
    ahora, inicioHoy, conCitaHoy: new Set(['cita']),
    leads: [{ ...c, creadoEn: ahora }],
    seguimientos: [{ ...c, actualizadoEn: ahora }],
    porLlamar: [{ id: 'p', clienteId: 'cita', cliente: c, creadoEn: ahora }],
    recordatorios: [{ id: 'r', tipo: 'RECORDATORIO', texto: 'Llevar póliza', fechaAviso: ahora, cliente: c }],
  });
  assert.deepEqual(filas.map((f) => f.key), ['nota:r']);
});
