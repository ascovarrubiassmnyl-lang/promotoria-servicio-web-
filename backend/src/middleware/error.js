export function notFound(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function errorHandler(err, _req, res, _next) {
  console.error('[ERROR]', err.message);
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor único' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  const status = err.status || 500;
  // Un 500 sin `status` explícito es un error inesperado (Prisma, librerías):
  // su mensaje puede traer nombres de tablas o rutas internas. En producción
  // se queda en el log y al usuario le llega un texto genérico.
  const interno = !err.status && process.env.NODE_ENV === 'production';
  res.status(status).json({ error: interno ? 'Error interno del servidor' : (err.message || 'Error interno del servidor') });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
