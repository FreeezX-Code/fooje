// Einstiegspunkt der App: entscheidet, welche Ansicht gezeigt wird.
import { onAuthChange, signIn, signOut } from './db.js';

const loadingView = document.getElementById('loading-view');
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const loginError = document.getElementById('login-error');
const userEmail = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

// Angemeldet → Hauptansicht, sonst → Anmeldebildschirm
function showView(session) {
  loadingView.hidden = true;
  loginView.hidden = Boolean(session);
  mainView.hidden = !session;
  userEmail.textContent = session ? session.user.email : '';
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

onAuthChange(showView);

// Service Worker anmelden (macht die App installierbar und offline startfähig)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Service Worker konnte nicht angemeldet werden:', error);
  });
}
