// Einstiegspunkt der App: entscheidet, welche Ansicht gezeigt wird.
import {
  onAuthChange, signIn, signOut, hasStoredSession, getCurrentSession,
  fetchRecipes, createRecipe, updateRecipe, deleteRecipe, insertRecipes,
  subscribeToRecipeChanges, unsubscribeFromRecipeChanges,
  uploadImage, deleteImage, getImageUrls,
} from './db.js';
import { saveRecipeCache, readRecipeCache, clearRecipeCache } from './offline.js';
import { createBackupFile, shareOrDownload, parseBackup } from './backup.js';
import { renderRecipeList, renderSkeletonList, renderRecipeDetail, renderChips, MAIN_COMPONENT_LABELS } from './views.js';
import { fillRecipeForm, readRecipeForm, readImageChoice } from './recipe-form.js';
import { collectTags, filterRecipes, isFilterActive } from './filter.js';

const loadingView = document.getElementById('loading-view');
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const loginError = document.getElementById('login-error');
const userEmail = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

const offlineBanner = document.getElementById('offline-banner');
const offlineDate = document.getElementById('offline-date');
const retryButton = document.getElementById('retry-button');

const listView = document.getElementById('list-view');
const listMessage = document.getElementById('list-message');
const recipeList = document.getElementById('recipe-list');
const detailView = document.getElementById('detail-view');

const filterBar = document.getElementById('filter-bar');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const mainComponentChips = document.getElementById('main-component-chips');
const tagChips = document.getElementById('tag-chips');
const filterReset = document.getElementById('filter-reset');

const exportButton = document.getElementById('export-button');
const importInput = document.getElementById('import-input');
const backupMessage = document.getElementById('backup-message');

const formView = document.getElementById('form-view');
const recipeForm = document.getElementById('recipe-form');
const formError = document.getElementById('form-error');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

let recipes = [];
let imageUrls = {}; // { Bildpfad: Link zum Anzeigen }
let imageUrlsLoadedAt = 0; // Zeitpunkt, ab dem die Links gelten (sie laufen nach 7 Tagen ab)
let currentUserId = null;
let editingId = null; // id des Rezepts im Formular, null = neues Rezept
let isOffline = false; // true = keine Verbindung, es wird der gespeicherte Stand gezeigt
let animateList = false; // true = Karten beim nächsten Anzeigen einschweben lassen
let currentView = null; // gerade sichtbare Ansicht (für die Einblend-Animation)

// Aktuelle Suche/Filter der Liste (bleiben erhalten, wenn man in ein Rezept und zurück geht)
const filter = { query: '', mainComponent: null, tags: new Set() };

const MAIN_COMPONENT_OPTIONS = Object.entries(MAIN_COMPONENT_LABELS).map(([value, label]) => ({ value, label }));

function showMain(email) {
  loadingView.hidden = true;
  loginView.hidden = true;
  mainView.hidden = false;
  userEmail.textContent = email;
}

// Wird beim Start und bei jeder Änderung der Anmeldung aufgerufen
function showView(session) {
  // 1. Angemeldet: Rezepte laden, wenn sich jemand (anderes) angemeldet hat
  //    oder wir gerade offline waren und die Anmeldung jetzt wieder klappt.
  //    setTimeout: Supabase empfiehlt, im Anmelde-Ereignis nicht direkt weitere Anfragen zu starten.
  if (session) {
    showMain(session.user.email);
    if (session.user.id !== currentUserId || isOffline) {
      currentUserId = session.user.id;
      setTimeout(loadRecipes, 0);
    }
    return;
  }

  // 2. Anmeldung noch gespeichert, konnte aber nicht erneuert werden (keine Verbindung):
  //    nicht abmelden, sondern den zuletzt geladenen Stand zeigen.
  const cache = readRecipeCache();
  if (hasStoredSession() && cache) {
    showMain(cache.email);
    currentUserId = cache.userId;
    useCache(cache);
    return;
  }

  // 3. Abgemeldet: Anmeldebildschirm, alles Gemerkte vom Handy löschen
  unsubscribeFromRecipeChanges();
  currentUserId = null;
  recipes = [];
  imageUrls = {};
  imageUrlsLoadedAt = 0;
  clearRecipeCache();
  setOffline(false);
  loadingView.hidden = true;
  loginView.hidden = false;
  mainView.hidden = true;
}

// Offline-Hinweis ein-/ausblenden. Offline sind Neu, Bearbeiten und Löschen ausgeblendet (siehe style.css).
function setOffline(offline, savedAt = null) {
  isOffline = offline;
  document.body.classList.toggle('offline', offline);
  offlineBanner.hidden = !offline;
  offlineDate.textContent = savedAt
    ? new Date(savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : '';
}

// Zeigt den auf dem Handy gespeicherten Stand an
function useCache(cache) {
  if (recipes.length === 0) animateList = true;
  recipes = cache.recipes;
  imageUrls = cache.imageUrls ?? {};
  sortRecipes();
  setOffline(true, cache.savedAt);
  showList();
  refreshView();
}

// Aktuellen Stand auf dem Handy merken (nach Laden, Speichern, Löschen)
function rememberRecipes() {
  saveRecipeCache({ userId: currentUserId, email: userEmail.textContent, recipes, imageUrls });
}

function sortRecipes() {
  recipes.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// Zeigt die Liste – gefiltert nach Suche, Hauptkomponente und Tags
function showList() {
  const tagOptions = collectTags(recipes);

  // Gewählte Tags, die es nicht mehr gibt (z. B. Rezept gelöscht), aus dem Filter nehmen
  for (const tag of filter.tags) {
    if (!tagOptions.some((option) => option.value === tag)) filter.tags.delete(tag);
  }

  const selectedMain = new Set(filter.mainComponent ? [filter.mainComponent] : []);
  renderChips(mainComponentChips, MAIN_COMPONENT_OPTIONS, selectedMain, toggleMainComponent);
  renderChips(tagChips, tagOptions, filter.tags, toggleTag);
  tagChips.hidden = tagOptions.length === 0;
  filterBar.hidden = recipes.length === 0;
  filterReset.hidden = !isFilterActive(filter);

  const visible = filterRecipes(recipes, filter);
  if (recipes.length === 0) listMessage.textContent = 'Noch keine Rezepte vorhanden.';
  else if (visible.length === 0) listMessage.textContent = 'Keine passenden Rezepte.';
  else listMessage.textContent = '';
  renderRecipeList(recipeList, visible, imageUrls, animateList);
  animateList = false;
}

// Hauptkomponente: nur eine gleichzeitig, nochmal antippen hebt die Auswahl auf
function toggleMainComponent(value) {
  filter.mainComponent = filter.mainComponent === value ? null : value;
  showList();
}

// Tags: mehrere gleichzeitig möglich
function toggleTag(value) {
  if (filter.tags.has(value)) filter.tags.delete(value);
  else filter.tags.add(value);
  showList();
}

searchInput.addEventListener('input', () => {
  filter.query = searchInput.value;
  showList();
});

// "Suchen"-Taste der Handytastatur: Tastatur schließen statt Seite neu laden
searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchInput.blur();
});

filterReset.addEventListener('click', () => {
  filter.query = '';
  filter.mainComponent = null;
  filter.tags.clear();
  searchInput.value = '';
  showList();
});

// Holt Anzeige-Links für die angegebenen Bilder. Klappt das nicht,
// erscheinen eben Platzhalter – die Rezepte selbst bleiben nutzbar.
async function loadImageUrls(paths) {
  try {
    Object.assign(imageUrls, await getImageUrls(paths));
  } catch (error) {
    console.error('Bild-Links konnten nicht geladen werden:', error);
  }
}

// Lädt die Rezepte vom Server. Klappt das nicht, wird der gespeicherte Stand gezeigt.
async function loadRecipes() {
  // Erstes Laden: schimmernde Platzhalter zeigen, danach die Karten einschweben lassen
  if (!isOffline && recipes.length === 0) {
    listMessage.textContent = '';
    renderSkeletonList(recipeList);
    animateList = true;
  }
  try {
    const loaded = await fetchRecipes();
    recipes = loaded;
    sortRecipes();

    // Bild-Links einmal am Tag komplett erneuern, sonst nur fehlende holen
    // (so werden die Bilder nicht bei jedem Neuladen erneut heruntergeladen)
    if (Date.now() - imageUrlsLoadedAt > 24 * 60 * 60 * 1000) {
      imageUrls = {};
      imageUrlsLoadedAt = Date.now();
    }
    await loadImageUrls(recipes.map((r) => r.image_path).filter((path) => path && !imageUrls[path]));

    setOffline(false);
    rememberRecipes();
    showList();
    refreshView();
    subscribeToRecipeChanges(handleRemoteUpsert, handleRemoteDelete);
  } catch (error) {
    console.error(error);
    const cache = readRecipeCache();
    if (cache && cache.userId === currentUserId) {
      useCache(cache);
    } else {
      listMessage.textContent = 'Rezepte konnten nicht geladen werden. Bitte Internet prüfen.';
      refreshView();
    }
  }
}

// ---- Live-Abgleich: Änderungen vom anderen Handy ----

async function handleRemoteUpsert(recipe) {
  if (recipe.image_path && !imageUrls[recipe.image_path]) await loadImageUrls([recipe.image_path]);
  recipes = recipes.filter((r) => r.id !== recipe.id).concat(recipe);
  sortRecipes();
  rememberRecipes();
  showList();
  refreshView();
}

function handleRemoteDelete(id) {
  if (!recipes.some((r) => r.id === id)) return; // z. B. eigene Löschung, schon erledigt
  recipes = recipes.filter((r) => r.id !== id);
  rememberRecipes();
  showList();
  // Wer gerade genau dieses Rezept ansieht, landet in der Liste
  if (location.hash === '#/recipe/' + id) location.replace('#');
  else refreshView();
}

// Kommt die App aus dem Hintergrund zurück, einmal neu laden: Während das Handy
// gesperrt war, war auch die Live-Verbindung unterbrochen und hat Änderungen verpasst.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !currentUserId) return;
  if (isOffline) retryConnection();
  else loadRecipes();
});

// "Erneut versuchen" und automatisch, sobald das Handy wieder Netz meldet
async function retryConnection() {
  if (!isOffline) return;
  retryButton.disabled = true;
  retryButton.textContent = 'Verbinde …';
  try {
    // Erst die Anmeldung erneuern – ohne gültige Anmeldung würde der Server
    // (wegen der Zugriffsregeln) einfach eine leere Liste liefern.
    const session = await getCurrentSession();
    if (session) {
      currentUserId = session.user.id;
      await loadRecipes();
    }
  } catch (error) {
    console.error(error);
  } finally {
    retryButton.disabled = false;
    retryButton.textContent = 'Erneut versuchen';
  }
}

retryButton.addEventListener('click', retryConnection);
window.addEventListener('online', retryConnection);

// Die Adresse bestimmt die Ansicht:
//   #/new              → Formular für neues Rezept
//   #/recipe/<id>/edit → Formular zum Bearbeiten
//   #/recipe/<id>      → Details
//   alles andere       → Liste
// So funktioniert auch die Zurück-Geste bzw. -Taste des Handys.
// showRoute: beim Wechsel der Ansicht (springt nach oben)
function showRoute() {
  renderRoute();
  window.scrollTo(0, 0);
}

// refreshView: nach geänderten Daten. Bleibt an der Stelle stehen und lässt ein
// offenes Formular in Ruhe – sonst wären die Eingaben weg.
function refreshView() {
  if (!formView.hidden) return;
  renderRoute();
}

function renderRoute() {
  const hash = location.hash;
  const editMatch = hash.match(/^#\/recipe\/([^/]+)\/edit$/);
  const detailMatch = hash.match(/^#\/recipe\/([^/]+)$/);
  const findRecipe = (match) => (match ? recipes.find((r) => r.id === match[1]) : null);

  let view = listView;
  if (isOffline && (hash === '#/new' || editMatch)) {
    // Offline kann nichts gespeichert werden, also auch kein Formular öffnen
    view = listView;
  } else if (hash === '#/new') {
    editingId = null;
    fillRecipeForm(null);
    view = formView;
  } else if (findRecipe(editMatch)) {
    const recipe = findRecipe(editMatch);
    editingId = recipe.id;
    fillRecipeForm(recipe, imageUrls[recipe.image_path]);
    view = formView;
  } else if (findRecipe(detailMatch)) {
    const recipe = findRecipe(detailMatch);
    renderRecipeDetail(detailView, recipe, imageUrls[recipe.image_path], handleDelete);
    view = detailView;
  }

  for (const v of [listView, detailView, formView]) v.hidden = v !== view;
  formError.textContent = '';

  // Neue Ansicht sanft einblenden (Klasse kurz entfernen, damit die Animation neu startet)
  if (view !== currentView) {
    view.classList.remove('view-enter');
    void view.offsetWidth;
    view.classList.add('view-enter');
    currentView = view;
  }
}

// Verständliche Fehlermeldung für Speichern/Löschen
function saveErrorText(error) {
  if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
    return 'Keine Verbindung zum Server. Bitte Internet prüfen.';
  }
  return error.message;
}

recipeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Speichert …';
  try {
    const data = readRecipeForm();
    const { newImage, removeImage } = await readImageChoice();
    const oldImagePath = editingId ? recipes.find((r) => r.id === editingId)?.image_path ?? null : null;

    // 1. Neues Bild zuerst hochladen, damit sein Pfad mit dem Rezept gespeichert werden kann
    let uploadedPath = null;
    if (newImage) {
      uploadedPath = await uploadImage(newImage);
      data.image_path = uploadedPath;
    } else if (removeImage) {
      data.image_path = null;
    }

    // 2. Rezept speichern. Schlägt das fehl, das gerade hochgeladene Bild wieder entfernen.
    let saved;
    try {
      saved = editingId ? await updateRecipe(editingId, data) : await createRecipe(data);
    } catch (error) {
      if (uploadedPath) deleteImage(uploadedPath);
      throw error;
    }

    // 3. Ersetztes oder entferntes altes Bild löschen, Anzeige-Link fürs neue holen
    if (oldImagePath && oldImagePath !== saved.image_path) deleteImage(oldImagePath);
    if (saved.image_path && !imageUrls[saved.image_path]) await loadImageUrls([saved.image_path]);

    recipes = recipes.filter((r) => r.id !== saved.id).concat(saved);
    sortRecipes();
    rememberRecipes();
    showList();
    // replace: Das Formular verschwindet aus dem Verlauf, "Zurück" führt dann zur Liste
    location.replace('#/recipe/' + saved.id);
  } catch (error) {
    console.error(error);
    formError.textContent = 'Speichern fehlgeschlagen: ' + saveErrorText(error);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Speichern';
  }
});

cancelButton.addEventListener('click', () => {
  location.replace(editingId ? '#/recipe/' + editingId : '#');
});

async function handleDelete(recipe) {
  if (!confirm(`„${recipe.name}“ wirklich löschen?`)) return;
  try {
    await deleteRecipe(recipe.id);
    if (recipe.image_path) deleteImage(recipe.image_path);
    recipes = recipes.filter((r) => r.id !== recipe.id);
    rememberRecipes();
    showList();
    location.replace('#');
  } catch (error) {
    console.error(error);
    alert('Löschen fehlgeschlagen: ' + saveErrorText(error));
  }
}

// ---- Backup ----

exportButton.addEventListener('click', async () => {
  backupMessage.textContent = '';
  await shareOrDownload(createBackupFile(recipes));
});

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = ''; // damit dieselbe Datei erneut gewählt werden kann
  if (!file) return;
  backupMessage.textContent = '';

  let result;
  try {
    result = parseBackup(await file.text(), new Set(recipes.map((r) => r.id)));
  } catch (error) {
    backupMessage.textContent = error.message;
    return;
  }

  const { newRecipes, existingCount, invalidCount } = result;
  const notes = [];
  if (existingCount > 0) notes.push(`${existingCount} schon vorhanden – bleiben unverändert`);
  if (invalidCount > 0) notes.push(`${invalidCount} unvollständig – werden übersprungen`);
  const details = notes.length > 0 ? ` (${notes.join(', ')})` : '';

  if (newRecipes.length === 0) {
    backupMessage.textContent = `Keine neuen Rezepte in der Datei${details}.`;
    return;
  }
  if (!confirm(`${newRecipes.length} neue Rezepte einspielen?${details}`)) return;

  backupMessage.textContent = 'Wird eingespielt …';
  try {
    const inserted = await insertRecipes(newRecipes);
    await loadImageUrls(inserted.map((r) => r.image_path).filter(Boolean));
    recipes = recipes.concat(inserted);
    sortRecipes();
    rememberRecipes();
    showList();
    backupMessage.textContent = `${inserted.length} Rezepte eingespielt.`;
  } catch (error) {
    console.error(error);
    backupMessage.textContent = 'Einspielen fehlgeschlagen: ' + saveErrorText(error);
  }
});

// Fehlermeldungen von Supabase in verständliches Deutsch übersetzen
function loginErrorText(error) {
  if (error.message === 'Invalid login credentials') return 'E-Mail oder Passwort ist falsch.';
  if (error.message === 'Failed to fetch' || error.name === 'AuthRetryableFetchError') {
    return 'Keine Verbindung zum Server. Bitte Internet prüfen.';
  }
  return 'Anmeldung fehlgeschlagen: ' + error.message;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  loginButton.disabled = true;
  try {
    await signIn(loginForm.email.value.trim(), loginForm.password.value);
    loginForm.reset();
  } catch (error) {
    loginError.textContent = loginErrorText(error);
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener('click', () => signOut());

window.addEventListener('hashchange', showRoute);

onAuthChange(showView);

// Service Worker anmelden (macht die App installierbar und offline startfähig)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Service Worker konnte nicht angemeldet werden:', error);
  });
}
