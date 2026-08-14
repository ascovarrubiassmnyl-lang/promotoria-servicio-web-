import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, esAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';

const router = Router();
router.use(authenticate);
// Permiso de sección enforced en servidor (RBAC + excepciones, fail closed).
router.use(permiteSeccion('clientes'));

// Una venta "convierte" a un prospecto en cliente cuando no está muerta.
// Definición ÚNICA del segmento: cancelada/rechazada no cuentan (mismo criterio
// que el resto del sistema, donde esos estados no suman a nada).
const VENTA_VIVA = ['PENDIENTE_PAGAR', 'FIRMADA', 'APROBADA', 'PAGADA'];

router.get('/', asyncHandler(async (req, res) => {
  const { estado, q, asesorId, archivados } = req.query;
  // Por defecto solo clientes activos; ?archivados=1 lista los archivados
  const where = { archivadoEn: archivados === '1' ? { not: null } : null };
  if (req.user.rol === 'ASESOR') where.asesorId = req.user.id;
  else if (asesorId) where.asesorId = asesorId;
  if (estado) where.estado = estado;
  if (q) where.OR = [
    { nombre: { contains: q, mode: 'insensitive' } },
    { apellidoP: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { telefono: { contains: q, mode: 'insensitive' } },
    { rfc: { contains: q, mode: 'insensitive' } },
    { curp: { contains: q, mode: 'insensitive' } },
  ];
  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      asesor: { select: { id: true, nombre: true, apellidoP: true } },
      _count: { select: { citas: true, ventas: true } },
      // Segmento prospecto/cliente: se DERIVA de las pólizas vivas, no se
      // guarda como campo manual (un enum capturado a mano se desincroniza en
      // cuanto alguien olvida cambiarlo al cerrar una venta).
      ventas: {
        where: { estado: { in: VENTA_VIVA } },
        select: { id: true },
        take: 1,
      },
      // Para "próxima acción" (derivada, no inventada): la cita pendiente más
      // antigua y el recordatorio sin completar más próximo.
      citas: {
        where: { estado: { in: ['PROGRAMADA', 'CONFIRMADA'] } },
        orderBy: { fechaHoraInicio: 'asc' },
        take: 1,
        select: { fechaHoraInicio: true, titulo: true },
      },
      notasItems: {
        where: { tipo: 'RECORDATORIO', completada: false, fechaAviso: { not: null } },
        orderBy: { fechaAviso: 'asc' },
        take: 1,
        select: { fechaAviso: true, texto: true },
      },
    },
    orderBy: { creadoEn: 'desc' },
  });
  // Próxima acción = lo más urgente entre cita pendiente y recordatorio abierto.
  res.json(clientes.map(({ citas, notasItems, ventas, ...c }) => {
    const candidatos = [
      citas[0] && { fecha: citas[0].fechaHoraInicio, tipo: 'CITA', titulo: citas[0].titulo },
      notasItems[0] && { fecha: notasItems[0].fechaAviso, tipo: 'RECORDATORIO', titulo: notasItems[0].texto },
    ].filter(Boolean).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    return { ...c, proximaAccion: candidatos[0] || null, esCliente: ventas.length > 0 };
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      asesor: { select: { id: true, nombre: true, apellidoP: true, email: true, telefono: true } },
      citas: { orderBy: { fechaHoraInicio: 'desc' }, take: 20, include: { asesor: { select: { id: true, nombre: true, apellidoP: true } }, promotor: { select: { id: true, nombre: true, apellidoP: true } } } },
      ventas: {
        orderBy: { creadoEn: 'desc' },
        include: {
          productoCatalogo: { select: { id: true, ramo: true, nombre: true } },
          pagos: { orderBy: { periodo: 'desc' } },
        },
      },
      notasItems: { orderBy: { creadoEn: 'desc' } },
      referidoPor: { select: { id: true, nombre: true, apellidoP: true } },
      referidos: { select: { id: true, nombre: true, apellidoP: true, estado: true } },
      documentos: { orderBy: { creadoEn: 'desc' }, include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } } },
    },
  });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && cliente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  res.json(cliente);
}));

// Legacy: NECESITA_SEGUIMIENTO ya no es etapa; si un cliente viejo lo manda
// como estado, se traduce a la bandera sin tocar la etapa.
const normalizarEtapa = (estado) => (estado === 'NECESITA_SEGUIMIENTO' ? null : estado);

router.post('/', asyncHandler(async (req, res) => {
  const { nombre, apellidoP, apellidoM, email, telefono, fechaNacimiento, rfc, curp, direccion, estado, notas, fuente, productoInteres, detalleInteres, referidoPorId, necesitaSeguimiento } = req.body || {};
  // Solo nombre y apellido son obligatorios: un "cliente frío" es un prospecto
  // del que todavía no se tienen datos de contacto (antes se inventaba un
  // correo falso tipo aaa@gmail.com para poder darlo de alta).
  if (!nombre || !apellidoP) return res.status(400).json({ error: 'nombre y apellidoP son requeridos' });
  const asesorId = (req.user.rol === 'ASESOR') ? req.user.id : (req.body.asesorId || req.user.id);
  if (req.user.rol !== 'ASESOR' && req.body.asesorId) {
    const existe = await prisma.usuario.findUnique({ where: { id: req.body.asesorId } });
    if (!existe) return res.status(400).json({ error: 'Asesor no válido' });
  }
  const cliente = await prisma.cliente.create({
    data: {
      asesorId, nombre, apellidoP, apellidoM: apellidoM || null, email: email || null,
      telefono: telefono || null,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
      rfc: rfc || null, curp: curp || null, direccion: direccion || null,
      estado: normalizarEtapa(estado) || 'PROSPECTO',
      necesitaSeguimiento: necesitaSeguimiento === true || estado === 'NECESITA_SEGUIMIENTO',
      notas: notas || null, fuente: fuente || null,
      productoInteres: productoInteres || null, detalleInteres: detalleInteres || null,
      referidoPorId: referidoPorId || null,
    },
    include: { asesor: { select: { id: true, nombre: true, apellidoP: true } } },
  });
  await registrarActividad(asesorId, 'CLIENTE_CREADO', {
    clienteId: cliente.id,
    cliente: `${nombre} ${apellidoP}`,
  });
  res.status(201).json(cliente);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cliente.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  const {
    nombre, apellidoP, apellidoM, email, telefono, fechaNacimiento, rfc, curp, direccion,
    estado, notas, fuente, asesorId,
    productoInteres, detalleInteres,
    productoComprado, productoNombre, formaPago, primaMonto, fechaInicioCobertura, fechaRenovacion,
    referidoPorId,
  } = req.body || {};
  const data = {};
  if (nombre) data.nombre = nombre;
  if (apellidoP) data.apellidoP = apellidoP;
  if (apellidoM !== undefined) data.apellidoM = apellidoM;
  if (email !== undefined) data.email = email || null;
  if (telefono !== undefined) data.telefono = telefono || null;
  if (fechaNacimiento !== undefined) data.fechaNacimiento = fechaNacimiento ? new Date(fechaNacimiento) : null;
  if (rfc !== undefined) data.rfc = rfc || null;
  if (curp !== undefined) data.curp = curp || null;
  if (direccion !== undefined) data.direccion = direccion || null;
  if (estado) {
    const etapa = normalizarEtapa(estado);
    if (etapa) data.estado = etapa;
    else data.necesitaSeguimiento = true; // legacy: la pseudo-etapa marca la bandera
  }
  if (typeof req.body.necesitaSeguimiento === 'boolean') data.necesitaSeguimiento = req.body.necesitaSeguimiento;
  if (notas !== undefined) data.notas = notas || null;
  if (fuente !== undefined) data.fuente = fuente || null;
  if (asesorId && req.user.rol !== 'ASESOR') data.asesorId = asesorId;
  // Producto de interés
  if (productoInteres !== undefined) data.productoInteres = productoInteres || null;
  if (detalleInteres !== undefined) data.detalleInteres = detalleInteres || null;
  // Si ya compró
  if (productoComprado !== undefined) data.productoComprado = productoComprado || null;
  if (productoNombre !== undefined) data.productoNombre = productoNombre || null;
  if (formaPago !== undefined) data.formaPago = formaPago || null;
  if (primaMonto !== undefined) data.primaMonto = primaMonto ?? null;
  if (fechaInicioCobertura !== undefined) data.fechaInicioCobertura = fechaInicioCobertura ? new Date(fechaInicioCobertura) : null;
  if (fechaRenovacion !== undefined) data.fechaRenovacion = fechaRenovacion ? new Date(fechaRenovacion) : null;
  // Referidos
  if (referidoPorId !== undefined) data.referidoPorId = referidoPorId || null;
  // Restaurar / archivar por borrado lógico
  if (req.body.archivado === false) data.archivadoEn = null;
  if (req.body.archivado === true) data.archivadoEn = new Date();
  const cliente = await prisma.cliente.update({ where: { id }, data });
  res.json(cliente);
}));

// Borrado lógico: archiva el cliente en vez de borrarlo. Sus pólizas, citas,
// notas y referidos se conservan; se restaura con PATCH { archivado: false }.
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existente = await prisma.cliente.findUnique({ where: { id } });
  if (!existente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (req.user.rol === 'ASESOR' && existente.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a este cliente' });
  await prisma.cliente.update({ where: { id }, data: { archivadoEn: new Date() } });
  res.json({ ok: true, archivado: true });
}));

export default router;
