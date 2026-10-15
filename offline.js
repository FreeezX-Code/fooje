// Zwischenspeicher für die Rezepte auf dem Handy, damit die App auch ohne
// Verbindung lesbar bleibt. Gespeichert wird im Browser (localStorage).

const CACHE_KEY = 'recipe-cache';

// Gleicher Name wie im Service Worker, der dort die Bilder ablegt
const IMAGE_CACHE = 'recipe-images';

// data = { userId, email, recipes, imageUrls }
export function saveRecipeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch (error) {
    // z. B. Speicher voll – die App funktioniert trotzdem, nur eben nicht offline
    console.warn('Rezepte konnten nicht zwischengespeichert werden:', error);
  }
}

// Gibt die gespeicherten Daten zurück oder null
export function readRecipeCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

// Beim Abmelden: alles Gemerkte vom Handy löschen
export function clearRecipeCache() {
  localStorage.removeItem(CACHE_KEY);
  if ('caches' in window) caches.delete(IMAGE_CACHE);
}
