// AM Clínica — Service Worker for Push Notifications

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ── Handle incoming push ───────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  let payload = { title: 'AM Clínica', body: 'Nueva notificación', url: '/todos' };
  try { payload = { ...payload, ...event.data.json() }; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'am-clinica',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: payload.url },
    })
  );
});

// ── Handle notification click ─────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/todos';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if already open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(targetUrl);
    })
  );
});
