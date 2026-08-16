import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { calificar } from '../utils/pop.js';
import { notificar } from '../utils/notificaciones.js';

// Router PÚBLICO (sin `authenticate`), mismo patrón que routes/invitaciones.js:
// el candidato no tiene cuenta en el CRM y contesta desde su celular. La única
// puerta de entrada es el token de un solo uso que generó la promotora.
//
// Deliberadamente devuelve lo mínimo: el nombre de pila de la persona (para
// que confirme que el link es suyo) y las preguntas. NUNCA los puntos de cada
// opción — si viajaran al navegador, el candidato podría ver en el HTML qué
// respuesta vale más. El puntaje se calcula siempre en el servidor.
const router = Router();

async function envioVigente(token) {
  const envio = await prisma.popEnvio.findUnique({
    where: { token },
    include: {
      candidato: { select: { id: true, nombre: true, apellidoP: true } },
      plantilla: { select: { id: true, nombre: true, descripcion: true, umbralVerde: true, umbralAmarillo: true } },
    },
  });
  if (!envio) return { error: 'Este cuestionario no existe.' };
  if (envio.estado === 'RESPONDIDO') return { error: 'Este cuestionario ya fue contestado. Gracias.' };
  if (envio.estado === 'CANCELADO') return { error: 'Este cuestionario ya no está disponible.' };
  if (envio.expiraEn < new Date()) return { error: 'Este cuestionario venció. Pide uno nuevo a tu reclutador.' };
  return { envio };
}

// Preguntas sin los puntos de cada opción (ver nota de arriba).
const sinPuntos = (preguntas) => (preguntas || []).map((p) => ({
  id: p.id,
  texto: p.texto,
  ayuda: p.ayuda,
  bloque: p.bloque,
  tipo: p.tipo,
  opciones: (p.opciones || []).map((o) => ({ id: o.id, texto: o.texto })),
}));

// GET /pop-publico/:token — carga el cuestionario para contestarlo.
router.get('/:token', asyncHandler(async (req, res) => {
  const { envio, error } = await envioVigente(req.params.token);
  if (error) return res.status(410).json({ error });

  // Marca la primera apertura (diagnóstico para la promotora: "lo abrió pero
  // no lo terminó"). Mejor esfuerzo: nunca debe impedir contestar.
  if (!envio.abiertoEn) {
    await prisma.popEnvio.update({ where: { id: envio.id }, data: { abiertoEn: new Date() } }).catch(() => {});
  }

  res.json({
    nombre: envio.candidato.nombre,
    cuestionario: { nombre: envio.plantilla.nombre, descripcion: envio.plantilla.descripcion },
    preguntas: sinPuntos(envio.preguntas),
  });
}));

// POST /pop-publico/:token — el candidato entrega sus respuestas.
router.post('/:token', asyncHandler(async (req, res) => {
  const { envio, error } = await envioVigente(req.params.token);
  if (error) return res.status(410).json({ error });

  const resultado = calificar(envio.preguntas, req.body?.respuestas, {
    umbralVerde: envio.plantilla.umbralVerde,
    umbralAmarillo: envio.plantilla.umbralAmarillo,
  });
  if (resultado.error) return res.status(400).json({ error: resultado.error });

  await prisma.popEnvio.update({
    where: { id: envio.id },
    data: {
      estado: 'RESPONDIDO',
      respondidoEn: new Date(),
      respuestas: resultado.respuestas,
      puntaje: resultado.puntaje,
      puntosObtenidos: resultado.puntosObtenidos,
      puntosPosibles: resultado.puntosPosibles,
      recomendacion: resultado.recomendacion,
      bloques: resultado.bloques,
    },
  });

  // Avisar a quien lo mandó: el POP se contesta horas o días después, nadie
  // está mirando la pantalla. Mejor esfuerzo — que falle el aviso no puede
  // tirar la respuesta ya guardada del candidato.
  const nombre = `${envio.candidato.nombre} ${envio.candidato.apellidoP}`;
  try {
    await notificar(envio.enviadoPorId, 'POP_RESPONDIDO', {
      titulo: 'POP contestado · Origen Promotoría',
      cuerpo: `${nombre} contestó "${envio.plantilla.nombre}": ${resultado.puntaje}/100`,
      datos: {
        url: `${process.env.PUBLIC_URL || ''}/candidatos/${envio.candidatoId}`,
        candidatoId: envio.candidatoId,
        popEnvioId: envio.id,
      },
    });
  } catch (err) {
    console.error(`[pop] no se pudo notificar la respuesta de ${envio.id}: ${err.message}`);
  }

  // El candidato no ve su puntaje ni la recomendación: es información de
  // selección para la promotora, no un resultado que se le entrega.
  res.json({ ok: true });
}));

export default router;
