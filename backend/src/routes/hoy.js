import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { inicioSemana } from '../utils/clinica.js';
import { hoyMx, rangoHoyMx } from '../utils/seguimiento.js';
import { puntosDe, META_PUNTOS_DIARIA } from './puntos.js';

// "Hoy" (2026-10-13, auditoría de UI): la lista de trabajo del día en un solo
// lugar. Antes estaba repartida en cuatro módulos (calendario, recordatorios
// de cada ficha, leads y clínica) y el Dashboard abría con prima y pólizas.
//
// Es SIEMPRE el día de quien consulta (req.user.id), también para un promotor:
// es "mi día", no una vista de equipo. Por eso no lleva sección RBAC — mismo
// criterio que /notificaciones — y no acepta asesorId.
const router = Router();
router.use(authenticate);

const CITA_VIVA = ['PROGRAMADA', 'CONFIRMADA'];
const DIAS_LEAD_NUEVO = 7;
// Más atrás que esto ya no se pregunta: es historia, no pendiente.
const DIAS_CITA_POR_CERRAR = 30;
const clienteCorto = { select: { id: true, nombre: true, apellidoP: true, telefono: true, estado: true } };

router.get('/', asyncHandler(async (req, res) => {
  const yo = req.user.id;
  const ahora = new Date();
  const { inicio, fin } = rangoHoyMx(ahora);

  const [citas, porCerrar, recordatorios, leads, clinica, puntos] = await Promise.all([
    // Citas de hoy donde estoy: dueño, promotor que aceptó o invitado que aceptó.
    prisma.cita.findMany({
      where: {
        estado: { in: CITA_VIVA },
        fechaHoraInicio: { gte: inicio, lt: fin },
        OR: [
          { asesorId: yo },
          { promotorId: yo, invitacionEstado: 'ACEPTADA' },
          { invitados: { some: { usuarioId: yo, estado: 'ACEPTADA' } } },
        ],
      },
      include: { cliente: clienteCorto, candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } } },
      orderBy: { fechaHoraInicio: 'asc' },
    }),
    // Citas propias que ya pasaron y nadie cerró (siguen PROGRAMADA/CONFIRMADA).
    // Cerrarlas importa: "citas realizadas" de Metas cuenta solo COMPLETADA.
    prisma.cita.findMany({
      where: {
        asesorId: yo,
        estado: { in: CITA_VIVA },
        fechaHoraFin: { lt: ahora },
        fechaHoraInicio: { gte: new Date(ahora.getTime() - DIAS_CITA_POR_CERRAR * 86400000) },
        clasificacion: { not: 'PERSONAL' },
      },
      include: { cliente: clienteCorto, candidato: { select: { id: true, nombre: true, apellidoP: true, telefono: true } } },
      orderBy: { fechaHoraInicio: 'desc' },
      take: 30,
    }),
    // Recordatorios que ya tocan (de hoy o vencidos) y siguen abiertos.
    prisma.nota.findMany({
      where: {
        asesorId: yo,
        tipo: { in: ['RECORDATORIO', 'RECORDATORIO_PAGO'] },
        completada: false,
        fechaAviso: { lt: fin },
        OR: [{ clienteId: null }, { cliente: { archivadoEn: null } }],
      },
      include: { cliente: clienteCorto },
      orderBy: { fechaAviso: 'asc' },
      take: 50,
    }),
    // Leads nuevos a los que todavía no se les llama.
    prisma.cliente.findMany({
      where: {
        asesorId: yo,
        archivadoEn: null,
        fechaUltimaLlamada: null,
        estado: { in: ['PROSPECTO', 'RETARGETING'] },
        OR: [
          { leadSinVer: true },
          { creadoEn: { gte: new Date(ahora.getTime() - DIAS_LEAD_NUEVO * 86400000) } },
        ],
      },
      select: { id: true, nombre: true, apellidoP: true, telefono: true, estado: true, fuente: true, creadoEn: true, leadSinVer: true },
      orderBy: { creadoEn: 'desc' },
      take: 30,
    }),
    // A quién llamar: la clínica de la semana que sigue pendiente.
    prisma.prospectoClinica.findMany({
      where: { asesorId: yo, semanaInicio: inicioSemana(), resultado: 'PENDIENTE' },
      include: { cliente: clienteCorto },
      orderBy: { creadoEn: 'asc' },
      take: 60,
    }),
    prisma.registroPuntos.findUnique({ where: { asesorId_fecha: { asesorId: yo, fecha: hoyMx() } } }),
  ]);

  // Un contacto aparece una sola vez: si ya está en leads o tiene cita hoy, no
  // se repite en "a quién llamar".
  const yaListados = new Set([...leads.map((c) => c.id), ...citas.map((c) => c.clienteId).filter(Boolean)]);
  const porLlamar = clinica
    .filter((p) => !p.clienteId || !yaListados.has(p.clienteId))
    .map((p) => ({
      id: p.id,
      clienteId: p.clienteId,
      nombre: p.cliente ? `${p.cliente.nombre} ${p.cliente.apellidoP || ''}`.trim() : p.nombre,
      telefono: p.cliente?.telefono || p.contacto || null,
      estado: p.cliente?.estado || null,
      cliente: p.cliente,
    }));

  res.json({
    fecha: inicio,
    // Las de hoy que ya terminaron se cierran desde "Citas por cerrar", no se
    // repiten arriba.
    citas: citas.filter((c) => c.fechaHoraFin >= ahora || c.asesorId !== yo),
    porCerrar,
    recordatorios: recordatorios.map((n) => ({ ...n, vencido: n.fechaAviso < ahora })),
    leads,
    porLlamar,
    progreso: {
      puntos: puntos ? puntosDe(puntos) : 0,
      meta: META_PUNTOS_DIARIA,
      llamadas: puntos?.llamadasRealizadas || 0,
      citasObtenidas: puntos?.citasObtenidas || 0,
    },
  });
}));

export default router;
