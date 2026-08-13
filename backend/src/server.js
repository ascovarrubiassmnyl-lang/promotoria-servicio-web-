import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import invitacionRoutes from './routes/invitaciones.js';
import usuarioRoutes from './routes/usuarios.js';
import clienteRoutes from './routes/clientes.js';
import citaRoutes from './routes/citas.js';
import ventaRoutes from './routes/ventas.js';
import metricaRoutes from './routes/metricas.js';
import actividadRoutes from './routes/actividad.js';
import targetRoutes from './routes/targets.js';
import notaRoutes from './routes/notas.js';
import pushRoutes from './routes/push.js';
import notificacionRoutes from './routes/notificaciones.js';
import googleCalendarRoutes from './routes/googleCalendar.js';
import productosCatalogoRoutes from './routes/productosCatalogo.js';
import referidosRoutes from './routes/referidos.js';
import bonosRoutes from './routes/bonos.js';
import documentosRoutes from './routes/documentos.js';
import configuracionRoutes from './routes/configuracion.js';
import puntosRoutes from './routes/puntos.js';
import clinicaRoutes from './routes/clinica.js';
import candidatoRoutes from './routes/candidatos.js';
import { startReminderJob } from './jobs/reminderJob.js';
import { initMailer } from './services/mailer.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/invitaciones', invitacionRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/citas', citaRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/metricas', metricaRoutes);
app.use('/api/actividad', actividadRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/notas', notaRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/google-calendar', googleCalendarRoutes);
app.use('/api/productos-catalogo', productosCatalogoRoutes);
app.use('/api/referidos', referidosRoutes);
app.use('/api/bonos', bonosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/puntos', puntosRoutes);
app.use('/api/clinica', clinicaRoutes);
app.use('/api/candidatos', candidatoRoutes);

// Producción (Railway, un solo servicio): Express sirve el build de Vite.
// Estáticos + fallback SPA para las rutas de React Router; /api/* nunca cae
// aquí (se registró antes) y en desarrollo el frontend lo sirve Vite (5173).
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`CRM backend escuchando en http://localhost:${port}`);
  initMailer();
  startReminderJob();
});

export default app;
