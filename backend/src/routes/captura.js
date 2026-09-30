import express, { Router } from 'express';
import { prisma } from '../prisma.js';
import { registrarActividad } from '../utils/actividad.js';
import { notificar } from '../utils/notificaciones.js';
import { agregarClienteAClinica, marcarCitaObtenidaEnClinica, ETAPAS_CLINICA } from '../utils/clinica.js';
import {
  LIMITES, recortar, neutralizarCsv, normalizarTelefono, claveTelefono, partirNombre,
  emailValido, mapearEtapa, parsearCuerpo, honeypotLleno, extraerExtra, parsearFecha,
  hashIp, origenPermitido, parsearCita, tipoCitaDesdeModalidad, fechaCitaLegible,
} from '../utils/captura.js';

// Captura PÚBLICA de leads desde landing pages: POST /api/captura/:clave.
//
// Sin sesión. La clave identifica la FuenteCaptura y, con ella, al asesor
// dueño. La clave no es secreta (vive en el HTML de la landing), por eso solo
// sirve para CREAR: este router no tiene ningún GET y nunca devuelve datos.
//
// Se monta en app.js ANTES del CORS y del express.json globales:
//  - CORS propio: cualquier origen, o solo los dominios de la fuente.
//  - Parser propio de 10 KB que acepta text/plain con JSON adentro (lo que
//    manda un fetch mode:"no-cors", que no puede usar application/json),
//    application/json y x-www-form-urlencoded.
//
// Respuestas: 200 {ok:true} también para spam y duplicados (no se revela la
// lógica interna), 404 clave inexistente o fuente pausada, 400 sin nombre ni
// teléfono, 403 origen no permitido, 413 cuerpo > 10 KB, 429 rate limit.
//
// Nunca se loggea el cuerpo: trae datos personales.
const router = Router();

export const LIMITE_POR_IP_MIN = 10;
export const LIMITE_POR_CLAVE_DIA = 200;
const MAX_CUERPO = '10kb';

// --- Rate limit por IP, en memoria ------------------------------------------
// Un solo servicio en Railway, así que un Map basta. Ventana deslizante de 60 s.
const hitsPorIp = new Map();
function excedeLimiteIp(ip, ahora = Date.now()) {
  const desde = ahora - 60_000;
  const hits = (hitsPorIp.get(ip) || []).filter((t) => t > desde);
  hits.push(ahora);
  hitsPorIp.set(ip, hits);
  return hits.length > LIMITE_POR_IP_MIN;
}
// Limpieza periódica para que el Map no crezca sin tope.
setInterval(() => {
  const desde = Date.now() - 60_000;
  for (const [ip, hits] of hitsPorIp) {
    if (!hits.some((t) => t > desde)) hitsPorIp.delete(ip);
  }
}, 5 * 60_000).unref();
export const _reiniciarRateLimit = () => hitsPorIp.clear(); // solo tests

// --- CORS --------------------------------------------------------------------
function ponerCors(req, res, fuente) {
  const origin = req.get('origin');
  const dominios = fuente?.dominiosPermitidos || [];
  if (!dominios.length) res.set('Access-Control-Allow-Origin', '*');
  else if (origin && origenPermitido(origin, dominios)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
}

const buscarFuente = (clave) => (
  clave && clave.length <= 100
    ? prisma.fuenteCaptura.findUnique({ where: { clave } })
    : null
);

router.options('/:clave', async (req, res) => {
  const fuente = await buscarFuente(req.params.clave).catch(() => null);
  ponerCors(req, res, fuente);
  res.sendStatus(204);
});

// Lee el cuerpo como texto sin importar el Content-Type; se interpreta después.
const leerCuerpo = express.text({ type: () => true, limit: MAX_CUERPO });

router.post('/:clave', (req, res, next) => {
  ponerCors(req, res, null); // provisional: el error de parseo también debe llevar CORS
  leerCuerpo(req, res, (err) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Cuerpo demasiado grande' });
    if (err) return res.status(400).json({ error: 'Cuerpo inválido' });
    next();
  });
}, async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    if (excedeLimiteIp(ip)) return res.status(429).json({ error: 'Demasiadas solicitudes' });

    const fuente = await buscarFuente(req.params.clave);
    ponerCors(req, res, fuente);
    if (!fuente || !fuente.activa) return res.status(404).json({ error: 'Fuente no encontrada' });

    if (!origenPermitido(req.get('origin'), fuente.dominiosPermitidos)) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }

    const recibidasHoy = await prisma.capturaLead.count({
      where: { fuenteId: fuente.id, recibidoEn: { gte: new Date(Date.now() - 24 * 3600_000) } },
    });
    if (recibidasHoy >= LIMITE_POR_CLAVE_DIA) return res.status(429).json({ error: 'Límite diario alcanzado' });

    const body = parsearCuerpo(req.body, req.get('content-type') || '');
    if (!body) return res.status(400).json({ error: 'Cuerpo inválido' });

    const meta = {
      fuenteId: fuente.id,
      ipHash: hashIp(ip),
      userAgent: recortar(req.get('user-agent'), LIMITES.userAgent),
    };

    // Honeypot: se registra como SPAM (para diagnóstico de la fuente) y se
    // responde 200 como si nada.
    if (honeypotLleno(body)) {
      await prisma.capturaLead.create({ data: { ...meta, resultado: 'SPAM' } });
      await prisma.fuenteCaptura.update({ where: { id: fuente.id }, data: { ultimoUsoEn: new Date() } });
      return res.json({ ok: true });
    }

    const nombreCompleto = recortar(body.nombre, LIMITES.nombre);
    const telefonoCrudo = recortar(body.telefono, LIMITES.telefono);
    const telefono = normalizarTelefono(telefonoCrudo);
    if (!nombreCompleto && !telefono) {
      return res.status(400).json({ error: 'Se requiere nombre o teléfono' });
    }
    const emailCrudo = recortar(body.email, LIMITES.email);
    const email = emailValido(emailCrudo) ? emailCrudo.toLowerCase() : null;
    const modalidad = recortar(body.modalidad, LIMITES.modalidad);
    const origen = recortar(body.origen, LIMITES.origen);
    const etapaOriginal = recortar(body.etapa, LIMITES.etapa);
    const extra = extraerExtra(body) || {};
    // Un correo mal escrito no se tira: queda visible en los datos extra.
    if (emailCrudo && !email) extra.email_recibido = neutralizarCsv(emailCrudo);

    const datosCaptura = {
      ...meta,
      nombre: nombreCompleto ? neutralizarCsv(nombreCompleto) : null,
      telefono,
      email,
      modalidad: modalidad ? neutralizarCsv(modalidad) : null,
      origen: origen ? neutralizarCsv(origen) : null,
      etapaOriginal,
      fechaEnvio: parsearFecha(body.fecha),
      datosExtra: Object.keys(extra).length ? extra : undefined,
    };

    // --- Deduplicación por teléfono dentro de la cartera del dueño ---------
    // Se compara por los últimos 10 dígitos para empatar con teléfonos que el
    // asesor capturó a mano con espacios o sin +52. Solo clientes activos.
    const llave = claveTelefono(telefono);
    let existente = null;
    if (llave) {
      const candidatos = await prisma.cliente.findMany({
        where: { asesorId: fuente.usuarioId, archivadoEn: null, telefono: { not: null } },
        select: { id: true, telefono: true, nombre: true, apellidoP: true },
      });
      existente = candidatos.find((c) => claveTelefono(c.telefono) === llave) || null;
    }

    const ahora = new Date();
    // Segundo envío de la landing: la persona ya reservó en el calendario
    // (Cal.com). Trae fecha y hora → se crea la Cita en el CRM.
    const reserva = parsearCita(body, ahora);
    if (reserva && existente) {
      // El embed puede avisar dos veces de la misma reserva: no se duplica.
      const yaExiste = await prisma.cita.findFirst({
        where: { clienteId: existente.id, fechaHoraInicio: reserva.inicio, estado: { not: 'CANCELADA' } },
        select: { id: true },
      });
      if (yaExiste) return res.json({ ok: true });
    }

    const resultado = reserva ? 'CITA_AGENDADA' : existente ? 'DUPLICADO' : 'CREADO';
    const { cliente, cita } = await prisma.$transaction(async (tx) => {
      let c = existente;
      if (!c) {
        const { nombre, apellidoP } = partirNombre(nombreCompleto);
        c = await tx.cliente.create({
          data: {
            asesorId: fuente.usuarioId,
            nombre: neutralizarCsv(nombre || 'Sin nombre'),
            apellidoP: neutralizarCsv(apellidoP),
            telefono,
            email,
            estado: mapearEtapa(etapaOriginal) || fuente.etapaInicial,
            fuente: neutralizarCsv(origen || fuente.nombre),
            fuenteCapturaId: fuente.id,
            leadSinVer: true,
          },
        });
      }
      let nuevaCita = null;
      if (reserva) {
        nuevaCita = await tx.cita.create({
          data: {
            asesorId: fuente.usuarioId,
            clienteId: c.id,
            titulo: neutralizarCsv(reserva.titulo || `Cita agendada desde ${fuente.nombre}`),
            descripcion: [
              `La agendó el prospecto desde ${fuente.nombre}.`,
              datosCaptura.modalidad && `Modalidad elegida: ${datosCaptura.modalidad}.`,
            ].filter(Boolean).join(' '),
            tipo: tipoCitaDesdeModalidad(datosCaptura.modalidad),
            modalidad: 'CITA_UNICA',
            clasificacion: 'PRODUCTIVA',
            fechaHoraInicio: reserva.inicio,
            fechaHoraFin: reserva.fin,
            ubicacion: reserva.link,
          },
        });
        // Consiguió cita: sube a CITA si todavía estaba antes de ese paso (o
        // fuera del embudo). Nunca retrocede a quien ya iba más adelante.
        await tx.cliente.updateMany({
          where: { id: c.id, estado: { in: ['PROSPECTO', 'CONTACTADO', 'STANDBY', 'RETARGETING', 'DESCARTADO'] } },
          data: { estado: 'CITA' },
        });
        c = await tx.cliente.update({
          where: { id: c.id },
          data: { fechaUltimaCita: reserva.inicio, leadSinVer: true },
        });
      } else if (existente) {
        await tx.cliente.update({ where: { id: c.id }, data: { leadSinVer: true } });
      }
      await tx.capturaLead.create({
        data: { ...datosCaptura, clienteId: c.id, citaId: nuevaCita?.id, resultado },
      });
      await tx.fuenteCaptura.update({
        where: { id: fuente.id },
        data: { ultimoUsoEn: ahora, ...(resultado === 'CITA_AGENDADA' ? {} : { totalRecibidos: { increment: 1 } }) },
      });
      return { cliente: c, cita: nuevaCita };
    });

    // --- Efectos secundarios: mejor esfuerzo, el lead ya quedó guardado ----
    const nombreVisible = `${cliente.nombre} ${cliente.apellidoP || ''}`.trim();
    if (!cita || !existente) {
      await registrarActividad(fuente.usuarioId, 'LEAD_RECIBIDO', {
        clienteId: cliente.id,
        cliente: nombreVisible,
        fuente: fuente.nombre,
        fuenteId: fuente.id,
        duplicado: Boolean(existente),
        modalidad: datosCaptura.modalidad || undefined,
      }).catch((e) => console.error(`[captura] actividad falló: ${e.message}`));
    }
    if (cita) {
      await registrarActividad(fuente.usuarioId, 'CITA_CREADA', {
        citaId: cita.id,
        clienteId: cliente.id,
        cliente: nombreVisible,
        titulo: cita.titulo,
        modalidad: 'CITA_UNICA',
      }).catch((e) => console.error(`[captura] actividad de cita falló: ${e.message}`));
      marcarCitaObtenidaEnClinica(cliente.id)
        .catch((e) => console.error(`[captura] clínica falló: ${e.message}`));
    }

    // Aviso al celular y a la campana. Con reserva: el que pidió el usuario,
    // con día y hora. Sin reserva: dejó sus datos pero aún no elige horario.
    const partes = [nombreVisible, cliente.telefono, datosCaptura.modalidad];
    await notificar(fuente.usuarioId, 'LEAD_RECIBIDO', cita
      ? {
          titulo: 'Un prospecto agendó una cita y dejó sus datos',
          cuerpo: [...partes, fechaCitaLegible(cita.fechaHoraInicio)].filter(Boolean).join(' · '),
          datos: { url: `/clientes/${cliente.id}`, clienteId: cliente.id, citaId: cita.id },
        }
      : {
          titulo: existente ? `${nombreVisible} volvió a llenar el formulario` : 'Un prospecto dejó sus datos',
          cuerpo: [...partes, 'aún no elige horario'].filter(Boolean).join(' · '),
          datos: { url: `/clientes/${cliente.id}`, clienteId: cliente.id },
        },
    ).catch((e) => console.error(`[captura] notificación falló: ${e.message}`));

    if (!existente && !cita && ETAPAS_CLINICA.includes(cliente.estado)) {
      await agregarClienteAClinica(cliente, { asesorId: fuente.usuarioId })
        .catch((e) => console.error(`[captura] clínica falló: ${e.message}`));
    }

    return res.json({ ok: true });
  } catch (err) {
    // Sin el cuerpo en el log: solo el mensaje.
    console.error(`[captura] error: ${err.message}`);
    return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
