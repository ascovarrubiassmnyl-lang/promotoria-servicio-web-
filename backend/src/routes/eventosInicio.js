import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate, tieneRolAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

// Medición de uso de Inicio (2026-11-20, auditoría de Inicio): un evento por
// clic en cada bloque/acción. La pregunta que responde, en 2 semanas: ¿qué se
// usa y qué no, antes de seguir recortando?
//
// - Self-service como /notificaciones: solo exige sesión, sin sección RBAC
//   (Inicio es de todos). El usuario y la hora los pone el SERVIDOR, nunca el
//   body.
// - Catálogo cerrado de bloques y formato estricto de acción: lo que no
//   cuadra es 400, así la tabla no se llena de basura.
// - `detalle` solo admite categorías cortas (tipo/grupo de fila, clave de
//   KPI…), nunca datos del cliente: valores string/number/bool de máximo 40
//   caracteres y a lo más 6 llaves.
const router = Router();
router.use(authenticate);

export const BLOQUES_INICIO = ['hoy', 'contactar', 'numeros'];
const ACCION = /^[a-z][a-z0-9_]{1,39}$/;
const LLAVE = /^[a-zA-Z][a-zA-Z0-9_]{0,29}$/;

function limpiarDetalle(detalle) {
  if (detalle === undefined || detalle === null) return { ok: true, valor: undefined };
  if (typeof detalle !== 'object' || Array.isArray(detalle)) return { ok: false };
  const pares = Object.entries(detalle);
  if (pares.length > 6) return { ok: false };
  for (const [k, v] of pares) {
    if (!LLAVE.test(k)) return { ok: false };
    const tipo = typeof v;
    if (!['string', 'number', 'boolean'].includes(tipo)) return { ok: false };
    if (tipo === 'string' && v.length > 40) return { ok: false };
  }
  return { ok: true, valor: detalle };
}

router.post('/', asyncHandler(async (req, res) => {
  const { bloque, accion, detalle } = req.body || {};
  if (!BLOQUES_INICIO.includes(bloque)) return res.status(400).json({ error: 'bloque inválido' });
  if (typeof accion !== 'string' || !ACCION.test(accion)) return res.status(400).json({ error: 'accion inválida' });
  const d = limpiarDetalle(detalle);
  if (!d.ok) return res.status(400).json({ error: 'detalle inválido' });

  await prisma.eventoInicio.create({
    data: { usuarioId: req.user.id, bloque, accion, ...(d.valor ? { detalle: d.valor } : {}) },
  });
  res.status(204).end();
}));

// Resumen para decidir qué recortar: conteo por bloque y acción en los
// últimos N días (14 por defecto, tope 90) y cuántas personas distintas lo
// usaron. Solo con alcance de administración: es uso del equipo.
router.get('/resumen', asyncHandler(async (req, res) => {
  if (!tieneRolAdmin(req.user)) return res.status(403).json({ error: 'Solo promotoría' });
  const dias = Math.min(Math.max(parseInt(req.query.dias) || 14, 1), 90);
  const desde = new Date(Date.now() - dias * 86400000);

  const [porAccion, personas] = await Promise.all([
    prisma.eventoInicio.groupBy({
      by: ['bloque', 'accion'],
      where: { creadoEn: { gte: desde } },
      _count: { _all: true },
    }),
    prisma.eventoInicio.groupBy({
      by: ['bloque', 'accion', 'usuarioId'],
      where: { creadoEn: { gte: desde } },
    }),
  ]);
  const usuarios = new Map();
  for (const p of personas) {
    const k = `${p.bloque}:${p.accion}`;
    usuarios.set(k, (usuarios.get(k) || 0) + 1);
  }
  res.json({
    dias,
    desde,
    acciones: porAccion
      .map((a) => ({ bloque: a.bloque, accion: a.accion, clics: a._count._all, personas: usuarios.get(`${a.bloque}:${a.accion}`) || 0 }))
      .sort((a, b) => b.clics - a.clics),
  });
}));

export default router;
