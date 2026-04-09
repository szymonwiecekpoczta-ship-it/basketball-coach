// Service Worker — działa w tle, nawet gdy apka jest zamknięta
// To jest "duch" aplikacji, który żyje na telefonie

const CACHE_NAME = 'bcoach-v1';

// Lista plików do zapisania offline
const CACHE_FILES = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/src/app.js'
];

// Gdy Service Worker się instaluje — zapisuje pliki lokalnie
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_FILES))
  );
});

// Obsługa powiadomień push
// Gdy Firebase wysyła powiadomienie, ta funkcja je wyświetla
self.addEventListener('push', event => {
  // Pobierz treść powiadomienia
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'Basketball Coach';
  const options = {
    body: data.body || 'Nowa wiadomość od trenera',
    icon: '/icons/basketball-192.png',
    badge: '/icons/badge-72.png',
    // vibrate: [200, 100, 200] — wibracja w telefonie
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };
  
  // Wyświetl powiadomienie
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Kliknięcie w powiadomienie — otwiera odpowiednią stronę w apce
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
