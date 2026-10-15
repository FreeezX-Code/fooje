// Service Worker: speichert die App-Dateien zwischen, damit die App auch ohne Netz startet.
// Strategie "erst Netz, dann Zwischenspeicher": Mit Netz kommt immer die neueste Version,
// ohne Netz die zuletzt gespeicherte. So muss bei Änderungen nichts von Hand erneuert werden.

const CACHE_NAME = 'app-shell-v4';

const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './views.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// Beim Installieren: alle App-Dateien einmal in den Zwischenspeicher laden
self.addEventListener('install', (event) => {
  const requests = APP_FILES.map((file) => new Request(file, { cache: 'no-cache' }));
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
  self.skipWaiting();
});

// Beim Aktivieren: alte Zwischenspeicher (frühere Versionen) aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Die Supabase-Bibliothek kommt von diesem Server und wird ebenfalls zwischengespeichert
const LIBRARY_ORIGIN = 'https://cdn.jsdelivr.net';

// Bei jeder Anfrage: nur eigene Dateien und die Bibliothek behandeln,
// alles andere (z. B. Anfragen an die Supabase-Datenbank) normal durchlassen
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const origin = new URL(request.url).origin;
  if (request.method !== 'GET' || (origin !== self.location.origin && origin !== LIBRARY_ORIGIN)) {
    return;
  }

  // cache: 'no-cache' = immer beim Server nachfragen, ob es eine neuere Version gibt.
  // Sonst nimmt der Browser bis zu 10 Minuten alte Dateien (GitHub Pages erlaubt das),
  // und es kann eine Mischung aus alten und neuen Dateien entstehen.
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
