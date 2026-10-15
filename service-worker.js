// Service Worker: speichert die App-Dateien zwischen, damit die App auch ohne Netz startet.
// Strategie "erst Netz, dann Zwischenspeicher": Mit Netz kommt immer die neueste Version,
// ohne Netz die zuletzt gespeicherte. So muss bei Änderungen nichts von Hand erneuert werden.

const CACHE_NAME = 'app-shell-v15';

// Eigener Zwischenspeicher für Rezeptbilder (gleicher Name wie in offline.js,
// das ihn beim Abmelden löscht). Wird bei neuen App-Versionen nicht geleert.
const IMAGE_CACHE = 'recipe-images';

const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './views.js',
  './recipe-form.js',
  './filter.js',
  './offline.js',
  './backup.js',
  './week.js',
  './planner.js',
  './rules-form.js',
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
      Promise.all(
        names.filter((name) => name !== CACHE_NAME && name !== IMAGE_CACHE).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Die Supabase-Bibliothek kommt von diesem Server und wird ebenfalls zwischengespeichert
const LIBRARY_ORIGIN = 'https://cdn.jsdelivr.net';

// Rezeptbilder: Links sehen so aus …/storage/v1/object/sign/recipe-images/<datei>?token=…
const IMAGE_PATH = '/storage/v1/object/sign/recipe-images/';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.pathname.includes(IMAGE_PATH)) {
    event.respondWith(imageFromNetworkOrCache(request, url));
    return;
  }

  // Nur eigene Dateien und die Bibliothek behandeln,
  // alles andere (z. B. Anfragen an die Supabase-Datenbank) normal durchlassen
  if (url.origin !== self.location.origin && url.origin !== LIBRARY_ORIGIN) return;

  // cache: 'no-cache' = immer beim Server nachfragen, ob es eine neuere Version gibt.
  // Sonst nimmt der Browser bis zu 10 Minuten alte Dateien (GitHub Pages erlaubt das),
  // und es kann eine Mischung aus alten und neuen Dateien entstehen.
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});

// Bild aus dem Netz holen und merken; ohne Netz das gemerkte Bild nehmen.
// Gemerkt wird ohne den Teil nach "?" (der Zugangsschlüssel ändert sich, das Bild nicht).
async function imageFromNetworkOrCache(request, url) {
  const key = url.origin + url.pathname;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      await cache.put(key, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(key);
    if (cached) return cached;
    throw error;
  }
}
