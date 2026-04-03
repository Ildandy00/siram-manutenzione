// Siram Manutenzione — Service Worker

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
});

// Gestione notifiche push in background
self.addEventListener('push', e => {
  let data = { title: 'Siram Manutenzione', body: '' };
  try { data = JSON.parse(e.data.text()); } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon.svg',
      badge:   '/icon.svg',
      vibrate: [200, 100, 200],
      tag:     'siram-notifica',
    })
  );
});

// Click sulla notifica — apre l'app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
