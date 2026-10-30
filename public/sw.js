// Service Worker for Cotrix GST & Compliance Application
const CACHE_NAME = 'cotrix-gst-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for push notifications or local alarm triggers
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULED_STORE_CLOSURE_ALARM') {
    const { title, body, icon } = event.data;
    if (self.registration && self.registration.showNotification) {
      self.registration.showNotification(title || 'Submit End-of-Day Store Report', {
        body: body || "Operational shutdown hour reached. Please enter today's unbilled sales, cash-in-hand drawer balance, and personal expenses.",
        icon: icon || '/favicon.ico',
        tag: 'store-closure-report',
        requireInteraction: true,
        data: { url: '/' }
      });
    }
  }
});
