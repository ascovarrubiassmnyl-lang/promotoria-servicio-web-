// Service worker de Origen Promotoría — solo escucha push + notificaciones.
// No hace caché de nada (app con Vite dev + axios). Produción build está en backend /static.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: 'Origen Promotoría', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Origen Promotoría';
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'origen-default',
    data: payload.data || {},
    // Íconos cuadrados del manifest: el logo rectangular se recortaba mal en
    // la bandeja del teléfono.
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    requireInteraction: !!payload.requerirInteraccion,
    // Patrón más largo/notorio: el corto se sentía como un tap y pasaba
    // desapercibido con el teléfono en el bolsillo.
    vibrate: payload.vibrate || [200, 100, 200],
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en notificación → abre/enfoca la app y navega a la URL indicada
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of allClients) {
        if ('focus' in c) {
          c.focus();
          if ('navigate' in c) c.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
