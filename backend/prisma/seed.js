import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { productosCatalogoSeed } from './productosCatalogoData.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed: políticas de acceso por rol (RBAC)...');
  // Acceso base por rol; SUPERADMIN no lleva fila (acceso total hardcodeado).
  const politicasSeed = {
    ASESOR: { dashboard: true, clientes: true, citas: true, ventas: true, actividad: true, metas: true, puntos: true, clinica: true, candidatos: false, asesores: false, configuracion: false },
    ADMIN: { dashboard: true, clientes: true, citas: true, ventas: true, actividad: true, metas: true, puntos: true, clinica: true, candidatos: true, asesores: true, configuracion: true },
  };
  for (const [rol, accesos] of Object.entries(politicasSeed)) {
    await prisma.politicaRol.upsert({ where: { rol }, update: {}, create: { rol, accesos } });
  }

  // Las cuentas y datos demo (contraseñas conocidas) son solo para desarrollo:
  // en producción el seed solo crea políticas RBAC y el super admin real,
  // tomado de variables de entorno (nunca hardcodeado). Es create-only: en
  // redeploys no toca la cuenta existente (no resetea contraseña ni rol).
  if (process.env.NODE_ENV === 'production') {
    const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.SUPERADMIN_PASSWORD || '';
    if (!email || password.length < 8) {
      console.log('Seed: producción — define SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD (mínimo 8 caracteres) para crear el super admin.');
      return;
    }
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      console.log(`Seed: producción — el super admin ${email} ya existe, sin cambios.`);
      return;
    }
    await prisma.usuario.create({
      data: { nombre: 'Super', apellidoP: 'Admin', email, password: await bcrypt.hash(password, 10), rol: 'SUPERADMIN' },
    });
    console.log(`Seed: producción — super admin creado (${email}). No se crean datos demo.`);
    return;
  }

  console.log('Seed: creando usuarios...');
  const superadmin = await prisma.usuario.upsert({
    where: { email: 'superadmin@demo.com' },
    update: {},
    create: { nombre: 'Super', apellidoP: 'Admin', email: 'superadmin@demo.com', password: await bcrypt.hash('super123', 10), rol: 'SUPERADMIN', telefono: '5550000000' },
  });
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { nombre: 'Promotora', apellidoP: 'Admin', email: 'admin@demo.com', password: await bcrypt.hash('admin123', 10), rol: 'ADMIN', telefono: '5550000001' },
  });
  const asesor1 = await prisma.usuario.upsert({
    where: { email: 'asesor1@demo.com' },
    update: {},
    create: { nombre: 'Juan', apellidoP: 'Pérez', email: 'asesor1@demo.com', password: await bcrypt.hash('asesor123', 10), rol: 'ASESOR', telefono: '5550000002' },
  });
  const asesor2 = await prisma.usuario.upsert({
    where: { email: 'asesor2@demo.com' },
    update: {},
    create: { nombre: 'María', apellidoP: 'López', email: 'asesor2@demo.com', password: await bcrypt.hash('asesor123', 10), rol: 'ASESOR', telefono: '5550000003' },
  });

  console.log('Seed: catálogo de productos SMNYL (desde Brain 2)...');
  const productoCatalogo = {};
  for (const p of productosCatalogoSeed) {
    const existente = await prisma.productoCatalogo.findUnique({ where: { ramo_nombre: { ramo: p.ramo, nombre: p.nombre } } });
    if (existente) productoCatalogo[`${p.ramo}_${p.nombre}`] = existente;
    else productoCatalogo[`${p.ramo}_${p.nombre}`] = await prisma.productoCatalogo.create({ data: p });
  }

  console.log('Seed: candidatos a asesor (reclutamiento)...');
  // Demo del módulo de candidatos: etapas distintas y un semáforo de cada
  // color. El semáforo NO se inventa: refleja la regla de utils/semaforoCandidato.js
  // aplicada a las evaluaciones de abajo. Solo se siembran una vez.
  if ((await prisma.candidato.count()) === 0) {
    const evalVerde = { caracterIntegridad: 5, agilidadMental: 4, empuje: 5, nivelEnergia: 4, motivacionDinero: 4, posibilidadPermanencia: 4, imagenProfesional: 4, enfoqueSocial: 5, autoGestionable: 4, orientadoProcesos: 4, claridadMetas: 4, enfoqueActividad: 4 };
    const evalAmarillo = { caracterIntegridad: 4, agilidadMental: 3, empuje: 3, nivelEnergia: 3, motivacionDinero: 4, posibilidadPermanencia: 3, imagenProfesional: 3, enfoqueSocial: 3, autoGestionable: 3, orientadoProcesos: 3, claridadMetas: 4, enfoqueActividad: 3 };
    const evalRojo = { caracterIntegridad: 3, agilidadMental: 2, empuje: 1, nivelEnergia: 2, motivacionDinero: 3, posibilidadPermanencia: 2, imagenProfesional: 3, enfoqueSocial: 2, autoGestionable: 2, orientadoProcesos: 2, claridadMetas: 2, enfoqueActividad: 2 };
    const candidatosData = [
      { nombre: 'Fernanda', apellidoP: 'Salas', telefono: '5552220001', sexo: 'F', ciudad: 'Monterrey', fuente: 'Referido personal', profesion: 'Lic. en Administración', etapa: 'CARRERA', semaforo: 'VERDE', evaluacion: evalVerde },
      { nombre: 'Ricardo', apellidoP: 'Nava', telefono: '5552220002', sexo: 'M', ciudad: 'Guadalupe', fuente: 'Bolsa de trabajo', profesion: 'Ventas', etapa: 'SELECCION', semaforo: 'AMARILLO', evaluacion: evalAmarillo },
      { nombre: 'Sofía', apellidoP: 'Ibarra', telefono: '5552220003', sexo: 'F', ciudad: 'San Pedro', fuente: 'Redes sociales', etapa: 'ENTREVISTA_INICIAL', semaforo: 'ROJO', evaluacion: evalRojo },
      { nombre: 'Andrés', apellidoP: 'Camarillo', telefono: '5552220004', sexo: 'M', ciudad: 'Monterrey', fuente: 'Referido de asesor', referidoPor: 'Juan Pérez', etapa: 'ENTREVISTA_INICIAL', semaforo: 'SIN_EVALUAR' },
      { nombre: 'Valeria', apellidoP: 'Ortiz', telefono: '5552220005', sexo: 'F', ciudad: 'Apodaca', fuente: 'Feria de empleo', etapa: 'PRECONTRATO_MC', semaforo: 'VERDE', evaluacion: { ...evalVerde, claridadMetas: 5 } },
    ];
    for (const { evaluacion, ...c } of candidatosData) {
      await prisma.candidato.create({
        data: {
          ...c,
          creadoPorId: admin.id,
          reclutadorId: admin.id,
          oficina: 'Promotoría Origen',
          ...(evaluacion ? { evaluacion: { create: { ...evaluacion, evaluadorId: admin.id, vitalesCompletadosEn: new Date(), valoresCompletadosEn: new Date() } } } : {}),
        },
      });
    }
  }

  console.log('Seed: creando clientes (pipeline)...');
  const clientesData = [
    // asesor1: todos los estados del pipeline
    { asesorId: asesor1.id, nombre: 'Carlos',    apellidoP: 'Ramírez', telefono: '5551111111', email: 'carlos@example.com',    estado: 'PROSPECTO', fuente: 'Referido', productoInteres: 'VIDA', detalleInteres: 'Busca protección para su familia, prima mensual estimada $1,500' },
    { asesorId: asesor1.id, nombre: 'Ana',       apellidoP: 'Torres',  telefono: '5551111112', email: 'ana@example.com',        estado: 'PROPUESTA', fuente: 'Facebook', productoInteres: 'SALUD', detalleInteres: 'GMM individual, 35 años, sin antecedentes' },
    { asesorId: asesor1.id, nombre: 'Roberto',   apellidoP: 'Cruz',    telefono: '5551111121', email: 'roberto@example.com',   estado: 'CITA',      fuente: 'LinkedIn' },
  { asesorId: asesor2.id, nombre: 'Luis',      apellidoP: 'Martínez', telefono: '5551111113', email: 'luis@example.com',      estado: 'ENTREGA_POLIZA', fuente: 'Walk-in', productoComprado: 'ACUMULACION', productoNombre: 'NY Life Accumulator Plus', formaPago: 'ANUAL', primaMonto: 50000, fechaRenovacion: new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()) },
    { asesorId: asesor2.id, nombre: 'Patricia', apellidoP: 'Vega',    telefono: '5551111114', email: 'patricia@example.com',  estado: 'POST_VENTA_SEGUIMIENTO', fuente: 'LinkedIn', productoComprado: 'RETIRO', productoNombre: 'NY Life Retirement Builder', formaPago: 'MENSUAL', primaMonto: 18000 },
    // "Necesita seguimiento" es bandera, no etapa: etapa real + flag aparte
    { asesorId: asesor2.id, nombre: 'Gabriela', apellidoP: 'Ruiz',    telefono: '5551111115', email: 'gabriela@example.com',  estado: 'PROSPECTO', necesitaSeguimiento: true, fuente: 'Instagram', productoInteres: 'PROTECCION', detalleInteres: 'Le cotizaron protection familiar pero no respondió' },
  ];
  const clientes = [];
  for (const c of clientesData) {
    const existente = await prisma.cliente.findFirst({ where: { email: c.email } });
    if (existente) { clientes.push(existente); }
    else { clientes.push(await prisma.cliente.create({ data: c })); }
  }
  const [c1, c2, c3, c4, c5, c6] = clientes;

  // Primer referido: c1 refirió a c2 (ya convertido) y a c3 (pendiente)
  await prisma.cliente.update({ where: { id: c2.id }, data: { referidoPorId: c1.id } });
  await prisma.cliente.update({ where: { id: c3.id }, data: { referidoPorId: c1.id } });

  console.log('Seed: ventas con pipeline financiero...');
  const ventasExistentes = await prisma.venta.count();
  if (ventasExistentes === 0) {
    const now = new Date();
    const pctV = 25, acumPct = 20, protPct = 35, salPct = 15, retPct = 12;
    await prisma.venta.createMany({ data: [
      {
        asesorId: asesor2.id, clienteId: c4.id, ramo: 'ACUMULACION', producto: 'Star Dotal 20 años',
        primaAnual: 50000, comisionPct: acumPct, comisionMonto: +(50000 * acumPct / 100).toFixed(2),
        estado: 'PAGADA', productoCatalogoId: productoCatalogo['ACUMULACION_Star Dotal 20 años'].id,
        fechaFirma: new Date(now.getFullYear(), now.getMonth() - 3, 15),
        fechaPago: new Date(now.getFullYear(), now.getMonth() - 2, 5),
        fechaEntregaPoliza: new Date(now.getFullYear(), now.getMonth() - 2, 20),
        formaPago: 'ANUAL',
        fechaInicioVigencia: new Date(now.getFullYear(), now.getMonth() - 3, 15),
        fechaFinVigencia: new Date(now.getFullYear() + 20, now.getMonth() - 3, 15),
        fechaProximoPago: new Date(now.getFullYear() + 1, now.getMonth() - 2, 5),
        diaPago: 5, montoPago: 50000,
      },
      {
        asesorId: asesor2.id, clienteId: c5.id, ramo: 'RETIRO', producto: 'Imagina Ser PPR — Prima Nivelada Plazo Largo',
        primaAnual: 18000, comisionPct: retPct, comisionMonto: +(18000 * retPct / 100).toFixed(2),
        estado: 'FIRMADA', productoCatalogoId: productoCatalogo['RETIRO_Imagina Ser PPR — Prima Nivelada Plazo Largo'].id,
        fechaFirma: new Date(now.getFullYear(), now.getMonth() - 1, 10),
        formaPago: 'MENSUAL',
        fechaInicioVigencia: new Date(now.getFullYear(), now.getMonth() - 1, 10),
        fechaFinVigencia: new Date(now.getFullYear() + 30, now.getMonth() - 1, 10),
        fechaProximoPago: new Date(now.getFullYear(), now.getMonth(), 10),
        diaPago: 10, montoPago: 1500,
      },
      {
        asesorId: asesor1.id, clienteId: c2.id, ramo: 'GMM', producto: 'Alfa Medical',
        primaAnual: 28000, comisionPct: salPct, comisionMonto: +(28000 * salPct / 100).toFixed(2),
        estado: 'PENDIENTE_PAGAR', productoCatalogoId: productoCatalogo['GMM_Alfa Medical'].id,
        fechaFirma: new Date(now.getFullYear(), now.getMonth(), 2),
        formaPago: 'SEMESTRAL',
        fechaInicioVigencia: new Date(now.getFullYear(), now.getMonth(), 2),
        fechaFinVigencia: new Date(now.getFullYear() + 1, now.getMonth(), 2),
        fechaProximoPago: new Date(now.getFullYear(), now.getMonth() + 6, 2),
        diaPago: 2, montoPago: 14000,
      },
      {
        asesorId: asesor1.id, clienteId: c3.id, ramo: 'VIDA', producto: 'Orvi 10 pagos',
        primaAnual: 12000, comisionPct: pctV, comisionMonto: +(12000 * pctV / 100).toFixed(2),
        estado: 'APROBADA', productoCatalogoId: productoCatalogo['VIDA_Orvi 10 pagos'].id,
        fechaFirma: new Date(now.getFullYear(), now.getMonth() - 1, 28),
        fechaPago: new Date(now.getFullYear(), now.getMonth(), 5),
        formaPago: 'ANUAL',
        fechaInicioVigencia: new Date(now.getFullYear(), now.getMonth() - 1, 28),
        fechaFinVigencia: new Date(now.getFullYear() + 10, now.getMonth() - 1, 28),
        fechaProximoPago: new Date(now.getFullYear() + 1, now.getMonth() - 1, 28),
        diaPago: 28, montoPago: 12000,
      },
    ] });
    // Generar recordatorio de pago automático para las ventas que tienen fechaProximoPago
    const ventasRecienCreadas = await prisma.venta.findMany({ where: { fechaProximoPago: { not: null } }, include: { cliente: { select: { nombre: true, apellidoP: true } } } });
    for (const v of ventasRecienCreadas) {
      if (v.formaPago === 'UNICO') continue;
      const existente = await prisma.nota.findFirst({ where: { ventaId: v.id, tipo: 'RECORDATORIO_PAGO' } });
      if (!existente) {
        await prisma.nota.create({
          data: {
            clienteId: v.clienteId, asesorId: v.asesorId, ventaId: v.id,
            tipo: 'RECORDATORIO_PAGO', texto: `Pago de póliza: ${v.producto} (${v.formaPago.toLowerCase()}) · ${v.cliente.nombre} ${v.cliente.apellidoP}`,
            fechaAviso: v.fechaProximoPago,
          },
        });
      }
    }
  }

  console.log('Seed: citas...');
  const citasExistentes = await prisma.cita.count();
  if (citasExistentes === 0) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
    const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2); dayAfter.setHours(12, 0, 0, 0);
    const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7); nextWeek.setHours(15, 0, 0, 0);
    const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7); lastWeek.setHours(11, 0, 0, 0);
    await prisma.cita.createMany({ data: [
      { asesorId: asesor1.id, clienteId: c1.id, titulo: 'Primera llamada',  tipo: 'TELEFONICA', fechaHoraInicio: tomorrow, fechaHoraFin: new Date(tomorrow.getTime() + 30 * 60 * 1000) },
      { asesorId: asesor1.id, clienteId: c2.id, titulo: 'Cotización GMM',    tipo: 'VIDEO',      fechaHoraInicio: dayAfter,  fechaHoraFin: new Date(dayAfter.getTime() + 60 * 60 * 1000) },
      { asesorId: asesor2.id, clienteId: c3.id, titulo: 'Renovación auto',    tipo: 'PRESENCIAL', fechaHoraInicio: nextWeek,  fechaHoraFin: new Date(nextWeek.getTime() + 90 * 60 * 1000), ubicacion: 'Oficina Centro' },
      { asesorId: asesor1.id, clienteId: c1.id, titulo: 'Llamada de seguimiento', tipo: 'TELEFONICA', fechaHoraInicio: lastWeek, fechaHoraFin: new Date(lastWeek.getTime() + 20 * 60 * 1000), estado: 'COMPLETADA' },
    ] });
  }

  console.log('Seed: notas...');
  const notasExistentes = await prisma.nota.count();
  if (notasExistentes === 0) {
    await prisma.nota.createMany({ data: [
      { clienteId: c1.id, asesorId: asesor1.id, tipo: 'NOTA',       texto: 'Le interesa protección de vida. esposa y 2 hijos. Ingreso aprox 35k/mes' },
      { clienteId: c1.id, asesorId: asesor1.id, tipo: 'RECORDATORIO', texto: 'Llamar para recordar la cita de cotización', fechaAviso: new Date(new Date().getTime() + 24 * 60 * 60 * 1000) },
      { clienteId: c3.id, asesorId: asesor2.id, tipo: 'RECORDATORIO', texto: 'Renovación de póliza acumulación — confirmar prima', fechaAviso: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000) },
    ] });
  }

  console.log('Seed: bonos demo...');
  const bonosExistentes = await prisma.bono.count();
  if (bonosExistentes === 0) {
    const now = new Date();
    await prisma.bono.createMany({ data: [
      { asesorId: asesor1.id, mes: now.getMonth() + 1, anio: now.getFullYear(), concepto: 'Bono de producción',     monto: 8000,  estado: 'PENDIENTE' },
      { asesorId: asesor1.id, mes: now.getMonth() + 1, anio: now.getFullYear(), concepto: 'Bono de persistencia',   monto: 3500,  estado: 'PENDIENTE' },
      { asesorId: asesor2.id, mes: now.getMonth() + 1, anio: now.getFullYear(), concepto: 'Bono de producción',     monto: 12000, estado: 'COBRADO', fechaCobro: new Date(now.getFullYear(), now.getMonth(), 5) },
      { asesorId: asesor1.id, mes: now.getMonth(),     anio: now.getFullYear(), concepto: 'Bono de nuevo asesor',   monto: 5000,  estado: 'COBRADO', fechaCobro: new Date(now.getFullYear(), now.getMonth() - 1, 20) },
    ] });
  }

  console.log('Seed: referidos...');
  const referidosExistentes = await prisma.referido.count();
  if (referidosExistentes === 0) {
    await prisma.referido.create({ data: { asesorId: asesor1.id, clienteOrigenId: c1.id, clienteReferidoId: c2.id, estado: 'CONVERTIDO' } });
    await prisma.referido.create({ data: { asesorId: asesor1.id, clienteOrigenId: c1.id, clienteReferidoId: c3.id, estado: 'CONTACTADO' } });
    await prisma.referido.create({ data: { asesorId: asesor2.id, clienteOrigenId: c4.id, nombreReferido: 'Sofía Méndez', telefonoReferido: '5551111122', estado: 'PENDIENTE' } });
    await prisma.referido.create({ data: { asesorId: asesor1.id, clienteOrigenId: c2.id, nombreReferido: 'Fernando Reyes', telefonoReferido: '5551111123', estado: 'PENDIENTE' } });
  }

  console.log('Seed: llamadas registradas...');
  const llamadasExistentes = await prisma.actividad.count({ where: { tipo: 'LLAMADA' } });
  if (llamadasExistentes === 0) {
    const now = new Date();
    for (let i = 1; i <= 8; i++) {
      await prisma.actividad.create({ data: {
        asesorId: asesor1.id, tipo: 'LLAMADA',
        descripcion: `Llamada a prospecto ${i}`,
        creadoEn: new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 10 + (i % 6), 30),
        metadata: { clienteId: c1.id },
      } });
    }
  }

  console.log('Seed: actividad (otros)...');
  // Solo tipos canónicos (ver src/utils/actividad.js). Estos eventos simulan
  // históricos pre-normalización: guardan descripcion como fallback.
  const tipos = ['CLIENTE_CREADO', 'CITA_CREADA', 'POLIZA_CREADA', 'NOTA_CREADA', 'RECORDATORIO_CREADO'];
  const descripciones = {
    CLIENTE_CREADO: ['Creó el cliente Carlos Ramírez', 'Creó el cliente Ana Torres', 'Cliente agregado vía referido'],
    CITA_CREADA: ['Agendó primera llamada con Carlos', 'Cotización GMM programada', 'Cita de seguimiento con Patricia'],
    POLIZA_CREADA: ['Venta registrada: retiro (NY Life Retirement Builder)', 'Nueva solicitud GMM Familiar'],
    NOTA_CREADA: ['Agregó nota en ficha de Carlos', 'Nota de seguimiento en cliente Luis'],
    RECORDATORIO_CREADO: ['Recordatorio: llamar mañana a Carlos', 'Recordatorio: revisar renovación de Patricia'],
  };
  const now = new Date();
  for (let diasAtras = 0; diasAtras < 14; diasAtras++) {
    const eventosHoy = (diasAtras % 3 === 0 ? 3 : (diasAtras % 2 === 0 ? 2 : 1));
    for (let i = 0; i < eventosHoy; i++) {
      const tipo = tipos[Math.floor(Math.random() * tipos.length)];
      const ds = descripciones[tipo];
      const asesor = Math.random() > 0.5 ? asesor1 : asesor2;
      await savedActividad(prisma, {
        asesorId: asesor.id,
        tipo,
        descripcion: ds[Math.floor(Math.random() * ds.length)],
        creadoEn: new Date(now.getFullYear(), now.getMonth(), now.getDate() - diasAtras, 9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60)),
      });
    }
  }

  console.log('Seed OK');
  console.log('Usuarios creados:');
  console.log(' SUPERADMIN: superadmin@demo.com / super123');
  console.log('     ADMIN: admin@demo.com / admin123');
  console.log('    ASESOR: asesor1@demo.com / asesor123');
  console.log('    ASESOR: asesor2@demo.com / asesor123');
}

async function savedActividad(prisma, data) {
  const existente = await prisma.actividad.findFirst({ where: { asesorId: data.asesorId, descripcion: data.descripcion, creadoEn: data.creadoEn } });
  if (existente) return existente;
  return prisma.actividad.create({ data });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
