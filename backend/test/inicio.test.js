// Tests de las correcciones de datos de Inicio (auditoría del 20-nov-2026):
//  1. La invitación muestra la misma hora en todos lados: mover una cita
//     reabre las invitaciones y cambia el aviso; responder cierra el aviso.
//  2. El proceso de ventas cuenta las llamadas de la clínica y no calcula una
//     conversión sobre "0 llamadas" cuando hay citas.
//  3. El comparativo "vs. mes anterior" usa los mismos días del mes anterior.
//  4. Los meses se cortan en hora de México, no del servidor.
// Corren contra la base de DESARROLLO del .env con usuarios propios
// (@inicio-test.local) que se borran al final (cascada).
//
//   cd backend && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { signToken } from '../src/utils/tokens.js';
import { fechaHoraAviso, rangoMesMx, claveMesMx, partesMx, inicioDiaMx } from '../src/utils/fechas.js';
import { inicioSemana } from '../src/utils/clinica.js';

if (process.env.NODE_ENV === 'production') throw new Error('No correr estos tests contra producción');

const DOMINIO = 'inicio-test.local';
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

const avisosInvitacion = (usuarioId, citaId) => prisma.notificacion.findMany({
  where: { destinatarioId: usuarioId, tipo: 'CITA_INVITACION', datos: { path: ['citaId'], equals: citaId } },
  orderBy: { creadoEn: 'asc' },
});

const proceso = async (token) => (await api('/api/metricas/proceso-ventas', { token })).json();
const nivel = (p, clave) => p.niveles.find((n) => n.clave === clave);

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  u.promotora = await crearUsuario('Promo', 'ADMIN');
  u.ase1 = await crearUsuario('AseUno', 'ASESOR');
  u.ase2 = await crearUsuario('AseDos', 'ASESOR');
  u.ase3 = await crearUsuario('AseTres', 'ASESOR');
  for (const k of Object.keys(u)) u[k].token = signToken(u[k]);
});

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  await prisma.$disconnect();
  server.close();
});

test('meses en hora de México: noviembre empieza a las 06:00 UTC y una noche del 31 cuenta en octubre', () => {
  const { ini, fin } = rangoMesMx(11, 2026);
  assert.equal(ini.toISOString(), '2026-11-01T06:00:00.000Z');
  assert.equal(fin.toISOString(), '2026-12-01T05:59:59.999Z');
  assert.equal(claveMesMx(new Date('2026-11-01T03:00:00Z')), '2026-10');
  assert.equal(rangoMesMx(1, 2027).ini.toISOString(), '2027-01-01T06:00:00.000Z');
});

test('invitación: mover la cita reabre la invitación y el único aviso pendiente trae la hora nueva', async () => {
  const ini = new Date(); ini.setUTCDate(ini.getUTCDate() + 2); ini.setUTCHours(22, 0, 0, 0); // 4:00 p.m. México
  const r = await api('/api/citas', {
    token: u.promotora.token,
    method: 'POST',
    body: {
      titulo: 'Taller', modalidad: 'REUNION_EQUIPO', tipo: 'PRESENCIAL',
      fechaHoraInicio: ini.toISOString(), fechaHoraFin: new Date(ini.getTime() + 3600e3).toISOString(),
      invitadosIds: [u.ase1.id],
    },
  });
  assert.equal(r.status, 201, await r.clone().text());
  const { cita } = await r.json();
  const invitadoId = cita.invitados[0].id;

  // Acepta: su aviso deja de estar pendiente.
  const ok = await api(`/api/citas/${cita.id}/invitados/${invitadoId}`, { token: u.ase1.token, method: 'PATCH', body: { respuesta: 'ACEPTADA', ignorarEmpalme: true } });
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.ok((await avisosInvitacion(u.ase1.id, cita.id)).every((n) => n.leida), 'responder cierra el aviso');

  // La promotora la mueve a las 4:30 p.m.
  const nuevoIni = new Date(ini.getTime() + 30 * 60e3);
  const mov = await api(`/api/citas/${cita.id}`, {
    token: u.promotora.token,
    method: 'PATCH',
    body: { fechaHoraInicio: nuevoIni.toISOString(), fechaHoraFin: new Date(nuevoIni.getTime() + 3600e3).toISOString(), ignorarEmpalme: true },
  });
  assert.equal(mov.status, 200, await mov.clone().text());
  const movida = await mov.json();
  assert.equal(movida.invitados[0].estado, 'PENDIENTE', 'aceptó otro horario: se le vuelve a preguntar');

  const pendientes = (await avisosInvitacion(u.ase1.id, cita.id)).filter((n) => !n.leida);
  assert.equal(pendientes.length, 1, 'un solo aviso pendiente');
  assert.ok(pendientes[0].cuerpo.includes(fechaHoraAviso(nuevoIni)), pendientes[0].cuerpo);
  assert.ok(!pendientes[0].cuerpo.includes(fechaHoraAviso(ini)));

  // Inicio la muestra con la misma hora.
  const hoy = await (await api('/api/hoy', { token: u.ase1.token })).json();
  const inv = hoy.invitaciones.find((c) => c.id === cita.id);
  assert.equal(new Date(inv.fechaHoraInicio).toISOString(), nuevoIni.toISOString());

  // Cambiar algo que no es el horario no vuelve a avisar.
  await api(`/api/citas/${cita.id}`, { token: u.promotora.token, method: 'PATCH', body: { ubicacion: 'Sala 2' } });
  assert.equal((await avisosInvitacion(u.ase1.id, cita.id)).filter((n) => !n.leida).length, 1);
});

test('proceso de ventas: las llamadas de la clínica cuentan una sola vez por prospecto', async () => {
  const antes = nivel(await proceso(u.ase2.token), 'LLAMADAS').count;

  // Prospecto de clínica sin ficha en el CRM.
  const suelto = await prisma.prospectoClinica.create({ data: { asesorId: u.ase2.id, semanaInicio: inicioSemana(), nombre: 'Suelto Prueba' } });
  let r = await api(`/api/clinica/prospectos/${suelto.id}`, { token: u.ase2.token, method: 'PATCH', body: { resultado: 'CONTACTADO' } });
  assert.equal(r.status, 200, await r.clone().text());
  // CONTACTADO → CITA_OBTENIDA es la misma llamada: no suma otra.
  await api(`/api/clinica/prospectos/${suelto.id}`, { token: u.ase2.token, method: 'PATCH', body: { resultado: 'CITA_OBTENIDA' } });

  // Prospecto enlazado a un cliente que consigue cita directo desde PENDIENTE.
  const cliente = await prisma.cliente.create({ data: { asesorId: u.ase2.id, nombre: 'Cliente', apellidoP: 'Clinica', estado: 'PROSPECTO' } });
  const ligado = await prisma.prospectoClinica.create({ data: { asesorId: u.ase2.id, semanaInicio: inicioSemana(), nombre: 'Cliente Clinica', clienteId: cliente.id } });
  r = await api(`/api/clinica/prospectos/${ligado.id}`, { token: u.ase2.token, method: 'PATCH', body: { resultado: 'CITA_OBTENIDA' } });
  assert.equal(r.status, 200);

  assert.equal(nivel(await proceso(u.ase2.token), 'LLAMADAS').count, antes + 2);
  const ficha = await prisma.cliente.findUnique({ where: { id: cliente.id } });
  assert.ok(ficha.fechaUltimaLlamada, 'la ficha registra la llamada');
  const fila = await prisma.prospectoClinica.findUnique({ where: { id: ligado.id } });
  assert.equal(fila.resultado, 'CITA_OBTENIDA', 'registrar la llamada no regresa la fila a CONTACTADO');
});

test('proceso de ventas: con citas y 0 llamadas no calcula conversión ni caída sobre ese 0', async () => {
  const cliente = await prisma.cliente.create({ data: { asesorId: u.ase3.id, nombre: 'Sin', apellidoP: 'Llamada' } });
  const ini = new Date(Date.now() + 86400e3);
  await prisma.cita.create({
    data: { asesorId: u.ase3.id, clienteId: cliente.id, titulo: 'Cita', tipo: 'PRESENCIAL', fechaHoraInicio: ini, fechaHoraFin: new Date(ini.getTime() + 3600e3) },
  });
  const p = await proceso(u.ase3.token);
  assert.equal(p.llamadasSinRegistro, true);
  assert.equal(nivel(p, 'LLAMADAS').count, 0);
  assert.equal(nivel(p, 'LLAMADAS').conversionPct, null);
  assert.equal(nivel(p, 'CITAS').conversionPct, null);
});

test('comparativo: el mes en curso se compara contra los mismos días del mes anterior', async () => {
  const hoy = partesMx();
  const previo = new Date(Date.UTC(hoy.anio, hoy.mes - 2, 1));
  const mesP = previo.getUTCMonth() + 1; const anioP = previo.getUTCFullYear();
  const diasP = new Date(Date.UTC(anioP, mesP, 0)).getUTCDate();
  const mediodia = (dia) => new Date(inicioDiaMx(anioP, mesP, dia).getTime() + 12 * 3600e3);

  await prisma.cliente.create({ data: { asesorId: u.ase3.id, nombre: 'Previo', apellidoP: 'Dentro', creadoEn: mediodia(1) } });
  const hayDiasFuera = hoy.dia < diasP;
  if (hayDiasFuera) {
    await prisma.cliente.create({ data: { asesorId: u.ase3.id, nombre: 'Previo', apellidoP: 'Fuera', creadoEn: mediodia(hoy.dia + 1) } });
  }

  const enCurso = await (await api('/api/metricas/dashboard', { token: u.ase3.token })).json();
  assert.equal(enCurso.comparativo.mes, mesP);
  assert.equal(enCurso.comparativo.hastaDia, Math.min(hoy.dia, diasP));
  assert.equal(enCurso.comparativo.clientes, 1, 'solo cuenta las altas de los mismos días');

  // Un mes ya cerrado se compara completo.
  const cerrado = await (await api(`/api/metricas/dashboard?mes=${hoy.mes}&anio=${hoy.anio - 1}`, { token: u.ase3.token })).json();
  assert.equal(cerrado.comparativo.hastaDia, null);
});

test('medición de Inicio: guarda el clic con el usuario del token y rechaza lo que no es categoría', async () => {
  const ok = await api('/api/eventos-inicio', {
    token: u.ase1.token, method: 'POST',
    body: { bloque: 'contactar', accion: 'llamada', detalle: { tipo: 'LEAD', grupo: 'VENCIDO', posicion: 1 }, usuarioId: u.promotora.id },
  });
  assert.equal(ok.status, 204);
  const guardado = await prisma.eventoInicio.findFirst({ where: { usuarioId: u.ase1.id, accion: 'llamada' } });
  assert.ok(guardado, 'el usuario sale del token, no del body');
  assert.equal(await prisma.eventoInicio.count({ where: { usuarioId: u.promotora.id } }), 0);

  const malos = [
    { bloque: 'otro', accion: 'x1' },
    { bloque: 'hoy', accion: 'Con Espacios' },
    { bloque: 'hoy', accion: 'abrir', detalle: { nombre: 'Un texto larguísimo con datos de alguien que no cabe aquí' } },
    { bloque: 'hoy', accion: 'abrir', detalle: { anidado: { a: 1 } } },
  ];
  for (const body of malos) {
    const r = await api('/api/eventos-inicio', { token: u.ase1.token, method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal((await api('/api/eventos-inicio', { method: 'POST', body: { bloque: 'hoy', accion: 'abrir' } })).status, 401);
});

test('medición de Inicio: el resumen es solo para promotoría y cuenta clics y personas', async () => {
  await api('/api/eventos-inicio', { token: u.ase2.token, method: 'POST', body: { bloque: 'contactar', accion: 'llamada' } });
  assert.equal((await api('/api/eventos-inicio/resumen', { token: u.ase1.token })).status, 403);
  const r = await api('/api/eventos-inicio/resumen?dias=1', { token: u.promotora.token });
  assert.equal(r.status, 200);
  const { acciones } = await r.json();
  const llamada = acciones.find((a) => a.bloque === 'contactar' && a.accion === 'llamada');
  assert.ok(llamada.clics >= 2 && llamada.personas >= 2);
});
