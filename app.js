// Einstiegspunkt der App: entscheidet, welche Ansicht gezeigt wird.
import {
  onAuthChange, signIn, signOut,
  fetchRecipes, createRecipe, updateRecipe, deleteRecipe,
  uploadImage, deleteImage, getImageUrls,
} from './db.js';
import { renderRecipeList, renderRecipeDetail, renderChips, MAIN_COMPONENT_LABELS } from './views.js';
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

const formView = document.getElementById('form-view');
const recipeForm = document.getElementById('recipe-form');
const formError = document.getElementById('form-error');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

let recipes = [];
let imageUrls = {}; // { Bildpfad: Link zum Anzeigen }
let currentUserId = null;
let editingId = null; // id des Rezepts im Formular, null = neues Rezept

// Aktuelle Suche/Filter der Liste (bleiben erhalten, wenn man in ein Rezept und zurück geht)
const filter = { query: '', mainComponent: null, tags: new Set() };

const MAIN_COMPONENT_OPTIONS = Object.entries(MAIN_COMPONENT_LABELS).map(([value, label]) => ({ value, label }));

// Angemeldet → Hauptansicht, sonst → Anmeldebildschirm
function showView(session) {
  loadingView.hidden = true;
  loginView.hidden = Boolean(session);
  mainView.hidden = !session;
  userEmail.textContent = session ? session.user.email : '';

  // Rezepte nur neu laden, wenn sich jemand (anderes) angemeldet hat.
  // setTimeout: Supabase empfiehlt, im Anmelde-Ereignis nicht direkt weitere Anfragen zu starten.
  const userId = session ? session.user.id : null;
  if (userId && userId !== currentUserId) setTimeout(loadRecipes, 0);
  if (!userId) recipes = [];
  currentUserId = userId;
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
  renderRecipeList(recipeList, visible, imageUrls);
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

async function loadRecipes() {
  listMessage.textContent = 'Rezepte werden geladen …';
  try {
    recipes = await fetchRecipes();
    sortRecipes();
    imageUrls = {};
    await loadImageUrls(recipes.map((r) => r.image_path).filter(Boolean));
    showList();
  } catch (error) {
    console.error(error);
    listMessage.textContent = 'Rezepte konnten nicht geladen werden. Bitte Internet prüfen.';
  }
  showRoute();
}

// Die Adresse bestimmt die Ansicht:
//   #/new              → Formular für neues Rezept
//   #/recipe/<id>/edit → Formular zum Bearbeiten
//   #/recipe/<id>      → Details
//   alles andere       → Liste
// So funktioniert auch die Zurück-Geste bzw. -Taste des Handys.
function showRoute() {
  const hash = location.hash;
  const editMatch = hash.match(/^#\/recipe\/([^/]+)\/edit$/);
  const detailMatch = hash.match(/^#\/recipe\/([^/]+)$/);
  const findRecipe = (match) => (match ? recipes.find((r) => r.id === match[1]) : null);

  let view = listView;
  if (hash === '#/new') {
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
  window.scrollTo(0, 0);
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
    showList();
    location.replace('#');
  } catch (error) {
    console.error(error);
    alert('Löschen fehlgeschlagen: ' + saveErrorText(error));
  }
}

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
