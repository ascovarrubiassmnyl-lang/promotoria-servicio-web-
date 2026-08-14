import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { permiteSeccion } from '../middleware/permisos.js';
import { registrarActividad } from '../utils/actividad.js';

// Clínica telefónica: digitaliza el "Evaluador de Prospectos" semanal de la
// promotoría (formato diseñado para conseguir 10 citas a la semana) y el
// registro de sesiones de clínica (meta operativa: 2 por semana).
const router = Router();
router.use(authenticate);
router.use(permiteSeccion('clinica'));

export const META_CITAS_SEMANA = 10;
export const META_SESIONES_SEMANA = 2;

export const RESULTADOS_PROSPECTO = ['PENDIENTE', 'CONTACTADO', 'CITA_OBTENIDA', 'CONVERTIDO', 'DESCARTADO'];

const fechaDia = (str) => {
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const asesorScope = (req, explicito) =>
  req.user.rol === 'ASESOR' ? req.user.id : (explicito || req.user.id);

// Campos editables de un prospecto (texto libre, como el formato físico).
function datosProspecto(body) {
  const data = {};
  const texto = (v, max = 300) => (v === undefined ? undefined : (v === null || v === '' ? null : String(v).slice(0, max)));
  for (const [campo, max] of [
    ['nombre', 200], ['contacto', 200], ['parentesco', 100], ['estadoCivil', 150],
    ['ocupacion', 200], ['dependientes', 300], ['planSeguimiento', 500],
  ]) {
    const v = texto(body[campo], max);
    if (v !== undefined) data[campo] = v;
  }
  if (body.edad !== undefined) {
    const n = body.edad === null || body.edad === '' ? null : Number(body.edad);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 120)) return { error: 'edad inválida' };
    data.edad = n;
  }
  if (body.tieneSeguro !== undefined) data.tieneSeguro = body.tieneSeguro === null ? null : Boolean(body.tieneSeguro);
  if (body.fechaEntrevista !== undefined) {
    data.fechaEntrevista = body.fechaEntrevista ? new Date(body.fechaEntrevista) : null;
    if (data.fechaEntrevista && Number.isNaN(data.fechaEntrevista.getTime())) return { error: 'fechaEntrevista inválida' };
  }
  if (body.resultado !== undefined) {
    if (!RESULTADOS_PROSPECTO.includes(body.resultado)) return { error: 'resultado inválido' };
    data.resultado = body.resultado;
  }
  return { data };
}

// Semana completa: prospectos del evaluador + sesiones de clínica realizadas.
router.get('/semana', asyncHandler(async (req, res) => {
  const inicio = fechaDia(req.query.inicio);
  if (!inicio) return res.status(400).json({ error: 'inicio (YYYY-MM-DD) es requerido' });
  const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
  const asesorId = asesorScope(req, req.query.asesorId);

  const [prospectos, sesiones] = await Promise.all([
    prisma.prospectoClinica.findMany({
      where: { asesorId, semanaInicio: inicio },
      include: { cliente: { select: { id: true, nombre: true, apellidoP: true } } },
      orderBy: { creadoEn: 'asc' },
    }),
    prisma.sesionClinica.findMany({
      where: { asesorId, fecha: { gte: inicio, lt: fin } },
      orderBy: { fecha: 'asc' },
    }),
  ]);

  res.json({
    asesorId,
    prospectos,
    sesiones,
    metas: { citasSemana: META_CITAS_SEMANA, sesionesSemana: META_SESIONES_SEMANA },
  });
}));

router.post('/prospectos', asyncHandler(async (req, res) => {
  const inicio = fechaDia(req.body?.semanaInicio);
  if (!inicio) return res.status(400).json({ error: 'semanaInicio (YYYY-MM-DD) es requerida' });
  const { data, error } = datosProspecto(req.body || {});
  if (error) return res.status(400).json({ error });
  if (!data.nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const asesorId = asesorScope(req, req.body.asesorId);

  const prospecto = await prisma.prospectoClinica.create({
    data: { asesorId, semanaInicio: inicio, ...data },
  });
  res.status(201).json(prospecto);
}));

// Dueño o promotor: mismas reglas de propiedad que el resto del sistema.
async function prospectoConAcceso(req, res) {
  const prospecto = await prisma.prospectoClinica.findUnique({ where: { id: req.params.id } });
  if (!prospecto) { res.status(404).json({ error: 'Prospecto no encontrado' }); return null; }
  if (req.user.rol === 'ASESOR' && prospecto.asesorId !== req.user.id) {
    res.status(403).json({ error: 'Sin acceso a este prospecto' });
    return null;
  }
  return prospecto;
}

router.patch('/prospectos/:id', asyncHandler(async (req, res) => {
  const existente = await prospectoConAcceso(req, res);
  if (!existente) return;
  const { data, error } = datosProspecto(req.body || {});
  if (error) return res.status(400).json({ error });
  if (data.nombre === null) return res.status(400).json({ error: 'nombre es requerido' });
  // Mover la fila a otra semana (arrastre de prospectos no contactados).
  if (req.body?.semanaInicio !== undefined) {
    const inicio = fechaDia(req.body.semanaInicio);
    if (!inicio) return res.status(400).json({ error: 'semanaInicio inválida' });
    data.semanaInicio = inicio;
  }
  const prospecto = await prisma.prospectoClinica.update({ where: { id: existente.id }, data });

  // El avance en la clínica se refleja en la ficha del cliente: si no, el
  // asesor tendría que actualizar la etapa dos veces (aquí y en el CRM) y el
  // embudo quedaría desfasado. Solo aplica a filas enlazadas a un Cliente.
  if (prospecto.clienteId && data.resultado && data.resultado !== existente.resultado) {
    const cambios = {};
    if (data.resultado === 'CONTACTADO') {
      cambios.fechaUltimaLlamada = new Date();
    } else if (data.resultado === 'CITA_OBTENIDA') {
      cambios.fechaUltimaCita = new Date();
      cambios.estado = 'CITA';
      // Ya tiene cita: deja de ser un pendiente de contacto.
      cambios.necesitaSeguimiento = false;
    } else if (data.resultado === 'DESCARTADO') {
      // No se archiva ni se cambia de etapa: descartar en la clínica solo
      // significa "no sigo llamándole esta semana". Archivar es decisión
      // aparte, desde la ficha.
      cambios.necesitaSeguimiento = false;
    }
    if (Object.keys(cambios).length) {
      await prisma.cliente.update({ where: { id: prospecto.clienteId }, data: cambios }).catch(() => {});
    }
  }

  res.json(prospecto);
}));

router.delete('/prospectos/:id', asyncHandler(async (req, res) => {
  const existente = await prospectoConAcceso(req, res);
  if (!existente) return;
  await prisma.prospectoClinica.delete({ where: { id: existente.id } });
  res.json({ ok: true });
}));

// Convertir el prospecto en cliente del CRM: crea el Cliente (fuente
// "Clínica telefónica"), lo enlaza y marca la fila como CONVERTIDO.
router.post('/prospectos/:id/convertir', asyncHandler(async (req, res) => {
  const existente = await prospectoConAcceso(req, res);
  if (!existente) return;
  if (existente.clienteId) return res.status(409).json({ error: 'El prospecto ya está vinculado a un cliente' });

  const partes = existente.nombre.trim().split(/\s+/);
  const nombre = partes[0];
  const apellidoP = partes.slice(1).join(' ') || '—';

  const cliente = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.cliente.create({
      data: {
        asesorId: existente.asesorId,
        nombre,
        apellidoP,
        telefono: existente.contacto,
        estado: 'PROSPECTO',
        fuente: 'Clínica telefónica',
        notas: existente.planSeguimiento,
      },
    });
    await tx.prospectoClinica.update({
      where: { id: existente.id },
      data: { clienteId: nuevo.id, resultado: 'CONVERTIDO' },
    });
    return nuevo;
  });

  await registrarActividad(existente.asesorId, 'CLIENTE_CREADO', {
    clienteId: cliente.id,
    cliente: `${cliente.nombre} ${cliente.apellidoP}`,
    nota: 'Convertido desde la clínica telefónica',
  });
  res.status(201).json(cliente);
}));

// Sesión de clínica realizada (con cuántas llamadas y citas se obtuvo).
router.post('/sesiones', asyncHandler(async (req, res) => {
  const { fecha, llamadas, citasObtenidas, notas } = req.body || {};
  const cuando = fecha ? new Date(fecha) : null;
  if (!cuando || Number.isNaN(cuando.getTime())) return res.status(400).json({ error: 'fecha es requerida' });
  const nums = { llamadas: Number(llamadas ?? 0), citasObtenidas: Number(citasObtenidas ?? 0) };
  for (const [campo, n] of Object.entries(nums)) {
    if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: `${campo} debe ser un entero >= 0` });
  }
  const asesorId = asesorScope(req, req.body.asesorId);

  const sesion = await prisma.sesionClinica.create({
    data: { asesorId, fecha: cuando, ...nums, notas: notas ? String(notas).slice(0, 500) : null },
  });
  res.status(201).json(sesion);
}));

router.delete('/sesiones/:id', asyncHandler(async (req, res) => {
  const sesion = await prisma.sesionClinica.findUnique({ where: { id: req.params.id } });
  if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
  if (req.user.rol === 'ASESOR' && sesion.asesorId !== req.user.id) return res.status(403).json({ error: 'Sin acceso a esta sesión' });
  await prisma.sesionClinica.delete({ where: { id: sesion.id } });
  res.json({ ok: true });
}));

// Resumen semanal por asesor (solo promotores): avance hacia las 10 citas y
// las 2 sesiones de la semana.
router.get('/resumen', asyncHandler(async (req, res) => {
  if (req.user.rol === 'ASESOR') return res.status(403).json({ error: 'Solo promotores' });
  const inicio = fechaDia(req.query.inicio);
  if (!inicio) return res.status(400).json({ error: 'inicio (YYYY-MM-DD) es requerido' });
  const fin = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [asesores, prospectos, sesiones] = await Promise.all([
    prisma.usuario.findMany({
      where: { activo: true, rol: 'ASESOR' },
      select: { id: true, nombre: true, apellidoP: true },
      orderBy: [{ nombre: 'asc' }],
    }),
    prisma.prospectoClinica.findMany({ where: { semanaInicio: inicio } }),
    prisma.sesionClinica.findMany({ where: { fecha: { gte: inicio, lt: fin } } }),
  ]);

  const filas = asesores.map((a) => {
    const suyos = prospectos.filter((p) => p.asesorId === a.id);
    const sesionesSuyas = sesiones.filter((s) => s.asesorId === a.id);
    return {
      asesor: a,
      prospectos: suyos.length,
      contactados: suyos.filter((p) => p.resultado !== 'PENDIENTE').length,
      citasObtenidas: sesionesSuyas.reduce((acc, s) => acc + s.citasObtenidas, 0)
        + suyos.filter((p) => p.resultado === 'CITA_OBTENIDA').length,
      sesiones: sesionesSuyas.length,
    };
  });
  res.json({ metas: { citasSemana: META_CITAS_SEMANA, sesionesSemana: META_SESIONES_SEMANA }, filas });
}));

export default router;
