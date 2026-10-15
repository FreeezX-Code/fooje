// Einstiegspunkt der App: entscheidet, welche Ansicht gezeigt wird.
import { onAuthChange, signIn, signOut, fetchRecipes } from './db.js';
import { renderRecipeList, renderRecipeDetail } from './views.js';

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

let recipes = [];
let currentUserId = null;

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

async function loadRecipes() {
  listMessage.textContent = 'Rezepte werden geladen …';
  try {
    recipes = await fetchRecipes();
    listMessage.textContent = recipes.length === 0 ? 'Noch keine Rezepte vorhanden.' : '';
  } catch (error) {
    console.error(error);
    listMessage.textContent = 'Rezepte konnten nicht geladen werden. Bitte Internet prüfen.';
  }
  renderRecipeList(recipeList, recipes);
  showRoute();
}

// Die Adresse bestimmt die Ansicht: "#/recipe/<id>" → Details, sonst → Liste.
// So funktioniert auch die Zurück-Geste bzw. -Taste des Handys.
function showRoute() {
  const match = location.hash.match(/^#\/recipe\/(.+)$/);
  const recipe = match ? recipes.find((r) => r.id === match[1]) : null;
  listView.hidden = Boolean(recipe);
  detailView.hidden = !recipe;
  if (recipe) renderRecipeDetail(detailView, recipe);
  window.scrollTo(0, 0);
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
