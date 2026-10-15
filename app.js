// Einstiegspunkt der App: entscheidet, welche Ansicht gezeigt wird.
import { onAuthChange, signIn, signOut, fetchRecipes, createRecipe, updateRecipe, deleteRecipe } from './db.js';
import { renderRecipeList, renderRecipeDetail } from './views.js';
import { fillRecipeForm, readRecipeForm } from './recipe-form.js';

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

const formView = document.getElementById('form-view');
const recipeForm = document.getElementById('recipe-form');
const formError = document.getElementById('form-error');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

let recipes = [];
let currentUserId = null;
let editingId = null; // id des Rezepts im Formular, null = neues Rezept

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

function showList() {
  listMessage.textContent = recipes.length === 0 ? 'Noch keine Rezepte vorhanden.' : '';
  renderRecipeList(recipeList, recipes);
}

async function loadRecipes() {
  listMessage.textContent = 'Rezepte werden geladen …';
  try {
    recipes = await fetchRecipes();
    sortRecipes();
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
    fillRecipeForm(recipe);
    view = formView;
  } else if (findRecipe(detailMatch)) {
    renderRecipeDetail(detailView, findRecipe(detailMatch), handleDelete);
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
  try {
    const data = readRecipeForm();
    const saved = editingId ? await updateRecipe(editingId, data) : await createRecipe(data);
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
  }
});

cancelButton.addEventListener('click', () => {
  location.replace(editingId ? '#/recipe/' + editingId : '#');
});

async function handleDelete(recipe) {
  if (!confirm(`„${recipe.name}“ wirklich löschen?`)) return;
  try {
    await deleteRecipe(recipe.id);
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
