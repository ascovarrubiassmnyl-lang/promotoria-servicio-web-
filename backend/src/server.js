import app from './app.js';
import { startReminderJob } from './jobs/reminderJob.js';
import { startAutomatizacionesJob } from './jobs/automatizacionesJob.js';
import { initMailer } from './services/mailer.js';

// La app (rutas y middleware) vive en app.js para que los tests la levanten
// sin arrancar los jobs ni el mailer.
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`CRM backend escuchando en http://localhost:${port}`);
  initMailer();
  startReminderJob();
  startAutomatizacionesJob();
});

export default app;
