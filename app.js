// Einstiegspunkt der App: entscheidet, welche Ansicht gezeigt wird.
import {
  onAuthChange, signIn, signOut, hasStoredSession, getCurrentSession,
  fetchRecipes, createRecipe, updateRecipe, deleteRecipe, insertRecipes,
  subscribeToChanges, unsubscribeFromChanges,
  fetchPlanDays, savePlanDays, fetchPlannerRules, savePlannerRules, sendToBring, importRecipe,
  uploadImage, deleteImage, getImageUrls,
} from './db.js';
import { saveRecipeCache, readRecipeCache, clearRecipeCache } from './offline.js';
import { createBackupFile, shareOrDownload, parseBackup } from './backup.js';
import {
  renderWeek, startOfWeek, addDays, toIsoDate, parseIsoDate, isoWeekNumber, weekRangeLabel, formatDayLong, formatDayShort,
} from './week.js';
import { openSheet, openRecipePicker } from './sheet.js';
import { aggregateIngredients, renderShopping, shoppingListText } from './shopping.js';
import { normalizeRules, checkRules, generateWeek } from './planner.js';
import { fillRulesForm, readRulesForm } from './rules-form.js';
import { renderRecipeList, renderSkeletonList, renderRecipeDetail, renderChips, MAIN_COMPONENT_LABELS } from './views.js';
import { fillRecipeForm, readRecipeForm, readImageChoice, useImportedImage } from './recipe-form.js';
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

const weekView = document.getElementById('week-view');
const weekNumber = document.getElementById('week-number');
const weekRange = document.getElementById('week-range');
const weekPrev = document.getElementById('week-prev');
const weekNext = document.getElementById('week-next');
const weekToday = document.getElementById('week-today');
const weekMessage = document.getElementById('week-message');
const weekDays = document.getElementById('week-days');
const planWeekButton = document.getElementById('plan-week');
const rerollWeekButton = document.getElementById('reroll-week');
const purchaseWeekButton = document.getElementById('purchase-week');
const openShoppingButton = document.getElementById('open-shopping');

const shoppingView = document.getElementById('shopping-view');
const shoppingWeek = document.getElementById('shopping-week');
const shoppingContent = document.getElementById('shopping-content');
const shoppingMessage = document.getElementById('shopping-message');
const shoppingBack = document.getElementById('shopping-back');
const shoppingShare = document.getElementById('shopping-share');
const shoppingBring = document.getElementById('shopping-bring');
const weekNotes = document.getElementById('week-notes');
const rulesView = document.getElementById('rules-view');
const rulesForm = document.getElementById('rules-form');
const rulesMessage = document.getElementById('rules-message');
const rulesProblems = document.getElementById('rules-problems');
const rulesSave = document.getElementById('rules-save');
const rulesCancel = document.getElementById('rules-cancel');
const pageTitle = document.getElementById('page-title');
const tabBar = document.getElementById('tab-bar');

const newRecipeButton = document.getElementById('new-recipe');
const importView = document.getElementById('import-view');
const importForm = document.getElementById('import-form');
const importStatus = document.getElementById('import-status');
const importError = document.getElementById('import-error');
const importPaste = document.getElementById('import-paste');
const importCancel = document.getElementById('import-cancel');
const importSubmit = document.getElementById('import-submit');
const importTextToggle = document.getElementById('import-text-toggle');
const importTextSection = document.getElementById('import-text-section');
const importTextPaste = document.getElementById('import-text-paste');
const importImagesInput = document.getElementById('import-images');
const importImagesInfo = document.getElementById('import-images-info');
const importImagesText = document.getElementById('import-images-text');

const formView = document.getElementById('form-view');
const formNotice = document.getElementById('form-notice');
const recipeForm = document.getElementById('recipe-form');
const formError = document.getElementById('form-error');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');

let recipes = [];
let imageUrls = {}; // { Bildpfad: Link zum Anzeigen }
let imageUrlsLoadedAt = 0; // Zeitpunkt, ab dem die Links gelten (sie laufen nach 7 Tagen ab)
let currentUserId = null;
let editingId = null; // id des Rezepts im Formular, null = neues Rezept
let pendingDraft = null; // importierter Entwurf, der beim nächsten Öffnen von "Neues Rezept" eingesetzt wird
let pendingShare = null; // per "Teilen" (Android) geschickter Link/Text, wird beim Öffnen von #/import eingesetzt
let isOffline = false; // true = keine Verbindung, es wird der gespeicherte Stand gezeigt
let animateList = false; // true = Karten beim nächsten Anzeigen einschweben lassen
let planEntries = {}; // geladene Tage des Wochenplans: { "2026-10-19": Eintrag, … }
let weekMonday = startOfWeek(new Date()); // Montag der angezeigten Woche
let showPastDays = false; // vergangene Tage der Woche eingeblendet?

// Einkaufsliste: Auswahl bleibt erhalten, solange man in derselben Woche bleibt
const shopping = {
  monday: null,         // "JJJJ-MM-TT" der Woche
  days: new Set(),      // ausgewählte Tage
  daysTouched: false,   // Auswahl schon von Hand geändert?
  servings: new Map(),  // Tag → gewünschte Portionen
  unchecked: new Set(), // abgewählte Zutaten (key)
};
let plannerRules = null; // Regeln für den Generator (geladen beim Öffnen der Regel-Seite)
let rulesEdited = false; // true, sobald auf der Regel-Seite etwas geändert wurde
let currentView = null; // gerade sichtbare Ansicht (für die Einblend-Animation)
let detailTab = 'recipes'; // Reiter, von dem aus das angezeigte Rezept geöffnet wurde

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
  unsubscribeFromChanges();
  currentUserId = null;
  userEmail.textContent = '';
  recipes = [];
  imageUrls = {};
  imageUrlsLoadedAt = 0;
  planEntries = {};
  plannerRules = null;
  shopping.monday = null;
  clearRecipeCache();
  setOffline(false);
  loadingView.hidden = true;
  loginView.hidden = false;
  mainView.hidden = true;
}

// Offline-Hinweis ein-/ausblenden. Offline sind Neu, Bearbeiten und Löschen ausgeblendet (siehe style.css).
function setOffline(offline, savedAt = null) {
  isOffline = offline;
  if (offline) weekMessage.textContent = ''; // der Offline-Hinweis oben sagt schon alles
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
  planEntries = { ...(cache.planEntries ?? {}), ...planEntries };
  sortRecipes();
  setOffline(true, cache.savedAt);
  showList();
  refreshView();
}

// Aktuellen Stand auf dem Handy merken (nach Laden, Speichern, Löschen):
// Rezepte und der Wochenplan von 4 Wochen zurück bis 8 Wochen voraus
function rememberRecipes() {
  if (!currentUserId) return; // abgemeldet: nichts auf dem Handy speichern
  const from = toIsoDate(addDays(new Date(), -28));
  const to = toIsoDate(addDays(new Date(), 56));
  const plan = Object.fromEntries(Object.entries(planEntries).filter(([day]) => day >= from && day <= to));
  saveRecipeCache({ userId: currentUserId, email: userEmail.textContent, recipes, imageUrls, planEntries: plan });
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
    subscribeToChanges({
      onRecipeUpsert: handleRemoteUpsert,
      onRecipeDelete: handleRemoteDelete,
      onPlanUpsert: handleRemotePlanUpsert,
      onPlanDelete: handleRemotePlanDelete,
      onRulesChange: handleRemoteRulesChange,
    });
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

// ---- Wochenplan ----

// Zeigt die Woche ab "monday" sofort mit dem, was schon geladen ist, und lädt sie dann frisch
function showWeek(monday) {
  const isNewWeek = toIsoDate(monday) !== toIsoDate(weekMonday);
  weekMonday = monday;
  weekNumber.textContent = 'KW ' + isoWeekNumber(monday);
  weekRange.textContent = weekRangeLabel(monday);
  weekToday.hidden = toIsoDate(monday) === toIsoDate(startOfWeek(new Date()));
  if (isNewWeek) weekNotes.hidden = true;
  drawWeek();
  // Offline nicht nachladen: Ohne gültige Anmeldung käme wegen der Zugriffsregeln eine
  // leere Liste zurück und würde den gemerkten Plan überschreiben. Neu geladen wird,
  // sobald Verbindung und Anmeldung wieder stehen (siehe retryConnection).
  if (!isOffline && currentUserId) loadWeek(monday, isNewWeek);
}

// Zeichnet die angezeigte Woche neu. highlight = Tage, die kurz aufleuchten sollen.
function drawWeek(highlight = new Set()) {
  renderWeek(weekDays, weekMonday, planEntries, recipes, imageUrls, {
    highlight,
    onEdit: editDay,
    showPast: showPastDays,
    onTogglePast: () => {
      showPastDays = !showPastDays;
      drawWeek();
    },
  });
  updatePlanButtons();
}

// Die 7 Tage der angezeigten Woche mit der Angabe, ob der Generator sie belegen darf:
// nur ab heute, nicht frei, nicht festgehalten, nicht gekauft – und bei "nur leere füllen" ohne Rezept
function weekDaysForPlanning(rerollAll) {
  const today = toIsoDate(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const day = toIsoDate(addDays(weekMonday, i));
    const entry = planEntries[day];
    const changeable = day >= today && !entry?.is_day_off && !entry?.is_locked && !entry?.is_purchased;
    return { day, entry, fillable: changeable && (rerollAll || !entry?.recipe_id) };
  });
}

// Geplante Tage ab heute (mit Rezept, nicht frei)
function upcomingPlannedDays() {
  const today = toIsoDate(new Date());
  return Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(weekMonday, i)))
    .filter((day) => day >= today && planEntries[day]?.recipe_id && !planEntries[day].is_day_off);
}

// "Woche planen" nur, wenn es leere Tage gibt; "Alles neu würfeln" nur, wenn schon etwas geplant ist;
// "Alles als gekauft markieren" nur, wenn noch nicht alles gekauft ist
function updatePlanButtons() {
  planWeekButton.hidden = !weekDaysForPlanning(false).some((d) => d.fillable);
  rerollWeekButton.hidden = !weekDaysForPlanning(true).some((d) => d.fillable && d.entry?.recipe_id);
  purchaseWeekButton.hidden = !upcomingPlannedDays().some((day) => !planEntries[day].is_purchased);
  openShoppingButton.hidden = plannedDaysOfWeek(weekMonday).length === 0;
}

// Kasten über den Tagen: Ergebnis einer Aktion, ggf. mit Hinweisen
function showWeekNotes(title, notes = [], hasProblems = notes.length > 0) {
  weekNotes.replaceChildren();
  const heading = document.createElement('p');
  heading.className = 'week-notes-title';
  heading.textContent = title;
  weekNotes.append(heading);
  if (notes.length > 0) {
    const list = document.createElement('ul');
    for (const note of notes) {
      const item = document.createElement('li');
      item.textContent = note;
      list.append(item);
    }
    weekNotes.append(list);
  }
  weekNotes.classList.toggle('has-problems', hasProblems);
  weekNotes.hidden = false;
}

// Alles, was der Generator außer der Woche selbst braucht: Regeln, Rezepte der letzten Wochen, Sonntag davor
async function planningContext(monday) {
  plannerRules ??= normalizeRules(await fetchPlannerRules());
  const weeksBack = Math.max(plannerRules.avoid_recent_weeks, 1);
  const sundayBefore = toIsoDate(addDays(monday, -1));
  const history = await fetchPlanDays(toIsoDate(addDays(monday, -7 * weeksBack)), sundayBefore);
  const recentRecipeIds = new Set(
    plannerRules.avoid_recent_weeks > 0 ? history.filter((h) => h.recipe_id && !h.is_day_off).map((h) => h.recipe_id) : []
  );
  const dayBefore = history.find((h) => h.day === sundayBefore && !h.is_day_off);
  return { rules: plannerRules, recentRecipeIds, previousDayRecipeId: dayBefore?.recipe_id ?? null };
}

async function planWeek(rerollAll) {
  if (rerollAll && !confirm('Alle Tage ab heute neu würfeln?\nFestgehaltene, gekaufte und freie Tage bleiben, wie sie sind.')) return;
  const monday = weekMonday;
  planWeekButton.disabled = true;
  planWeekButton.textContent = '🎲 Plane …';
  weekMessage.textContent = '';
  try {
    // Frischen Stand dieser Woche holen (vielleicht hat das andere Handy gerade geplant)
    await loadWeek(monday, false);
    const context = await planningContext(monday);
    const { assignments, notes } = generateWeek({ ...context, days: weekDaysForPlanning(rerollAll), recipes });

    const rows = Object.entries(assignments).map(([day, recipe_id]) => ({ day, recipe_id, is_locked: false, is_day_off: false }));
    if (rows.length > 0) {
      for (const saved of await savePlanDays(rows)) planEntries[saved.day] = saved;
      rememberRecipes();
    }
    if (toIsoDate(monday) === toIsoDate(weekMonday)) {
      drawWeek(new Set(rows.map((r) => r.day)));
      const title = rows.length === 0 ? 'Nichts geplant.' : notes.length > 0 ? '✓ Geplant – mit Hinweisen:' : '✓ Woche geplant.';
      showWeekNotes(title, notes);
    }
  } catch (error) {
    console.error(error);
    weekMessage.textContent = 'Planen fehlgeschlagen: ' + saveErrorText(error);
  } finally {
    planWeekButton.disabled = false;
    planWeekButton.textContent = '🎲 Woche planen';
    updatePlanButtons();
  }
}

planWeekButton.addEventListener('click', () => planWeek(false));
rerollWeekButton.addEventListener('click', () => planWeek(true));
openShoppingButton.addEventListener('click', () => {
  location.hash = '#/shopping/' + toIsoDate(weekMonday);
});

// ---- Einkaufsliste ----

// Alle Tage der Woche mit einem Gericht (nicht frei, Rezept vorhanden)
function plannedDaysOfWeek(monday) {
  return Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(monday, i))).filter((day) => {
    const entry = planEntries[day];
    return entry?.recipe_id && !entry.is_day_off && recipeById(entry.recipe_id);
  });
}

// Vorauswahl: ab heute, noch nicht gekauft
function defaultShoppingDays(monday) {
  const today = toIsoDate(new Date());
  return new Set(plannedDaysOfWeek(monday).filter((day) => day >= today && !planEntries[day].is_purchased));
}

function openShopping(monday) {
  const iso = toIsoDate(monday);
  if (shopping.monday !== iso) {
    Object.assign(shopping, { monday: iso, days: defaultShoppingDays(monday), daysTouched: false, servings: new Map(), unchecked: new Set() });
  }
  shoppingWeek.textContent = `KW ${isoWeekNumber(monday)} · ${weekRangeLabel(monday)}`;
  shoppingMessage.textContent = '';
  drawShopping();

  // Plan der Woche frisch laden (z. B. beim direkten Öffnen); Vorauswahl anpassen, solange nichts geändert wurde
  if (!isOffline && currentUserId) {
    fetchPlanDays(iso, toIsoDate(addDays(monday, 6))).then((days) => {
      for (const day of days) planEntries[day.day] = day;
      if (!shopping.daysTouched) shopping.days = defaultShoppingDays(monday);
      if (!shoppingView.hidden && shopping.monday === iso) drawShopping();
    }).catch((error) => console.error(error));
  }
}

// Ausgewählte Gerichte mit Portionen und die zusammengefasste Zutatenliste
function currentShopping() {
  const monday = parseIsoDate(shopping.monday);
  const days = plannedDaysOfWeek(monday).map((day) => ({
    day,
    label: formatDayShort(day),
    recipe: recipeById(planEntries[day].recipe_id),
    purchased: planEntries[day].is_purchased,
    selected: shopping.days.has(day),
  }));
  const dishes = days.filter((d) => d.selected).map((d) => ({
    day: d.day,
    recipe: d.recipe,
    purchased: d.purchased,
    baseServings: d.recipe.servings,
    servings: shopping.servings.get(d.day) ?? d.recipe.servings,
  }));
  const items = aggregateIngredients(dishes.map((d) => ({ recipe: d.recipe, factor: d.baseServings ? d.servings / d.baseServings : 1 })));
  return { days, dishes, items };
}

function drawShopping() {
  const { days, dishes, items } = currentShopping();
  renderShopping(shoppingContent, {
    days, dishes, items, unchecked: shopping.unchecked,
    on: {
      toggleDay(day) {
        shopping.daysTouched = true;
        if (shopping.days.has(day)) shopping.days.delete(day);
        else shopping.days.add(day);
        drawShopping();
      },
      changeServings(day, delta) {
        const dish = dishes.find((d) => d.day === day);
        shopping.servings.set(day, Math.max(1, dish.servings + delta));
        drawShopping();
      },
      toggleItem(key) {
        if (shopping.unchecked.has(key)) shopping.unchecked.delete(key);
        else shopping.unchecked.add(key);
        drawShopping();
      },
    },
  });
  const nothingToBuy = !items.some((item) => !shopping.unchecked.has(item.key));
  shoppingShare.disabled = nothingToBuy;
  shoppingBring.disabled = nothingToBuy;
}

// Nur die angehakten Zutaten
const itemsToBuy = () => currentShopping().items.filter((item) => !shopping.unchecked.has(item.key));

shoppingShare.addEventListener('click', async () => {
  const monday = parseIsoDate(shopping.monday);
  const text = shoppingListText(`Einkaufsliste KW ${isoWeekNumber(monday)}`, itemsToBuy());
  shoppingMessage.textContent = '';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Einkaufsliste', text });
    } else {
      await navigator.clipboard.writeText(text);
      shoppingMessage.textContent = 'Liste in die Zwischenablage kopiert.';
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(error);
      shoppingMessage.textContent = 'Teilen hat nicht geklappt.';
    }
  }
});

// An Bring! senden, danach fragen, ob die Tage als "Zutaten gekauft" markiert werden sollen
shoppingBring.addEventListener('click', async () => {
  const items = itemsToBuy().map((item) => ({ name: item.name, spec: item.quantity }));
  shoppingMessage.textContent = '';
  shoppingBring.disabled = true;
  shoppingBring.textContent = 'Sende …';
  let result;
  try {
    result = await sendToBring(items);
  } catch (error) {
    console.error(error);
    shoppingMessage.textContent = error.message;
    return;
  } finally {
    shoppingBring.disabled = false;
    shoppingBring.textContent = '🛒 An Bring! senden';
  }

  const count = result.count === 1 ? '1 Zutat' : `${result.count} Zutaten`;
  shoppingMessage.textContent = `✓ ${count} an Bring! gesendet (Liste „${result.list}“).`;

  const days = [...shopping.days].filter((day) => planEntries[day]?.recipe_id && !planEntries[day].is_purchased).sort();
  if (days.length === 0) {
    // Nichts zu fragen – aber sagen, warum, statt die Rückfrage stillschweigend wegzulassen
    shoppingMessage.textContent += ' Die gewählten Tage waren schon als gekauft markiert.';
    return;
  }
  const label = days.length === 1 ? '1 Tag' : `${days.length} Tage`;
  const choice = await openSheet({
    title: 'An Bring! gesendet',
    subtitle: `${count} stehen jetzt auf der Liste „${result.list}“. Sollen die Tage als „Zutaten gekauft“ markiert werden?`,
    actions: [
      { label: `🛒 Ja, ${label} als gekauft markieren`, value: 'yes' },
      { label: 'Nein, später selbst', value: 'no' },
    ],
  });
  if (choice !== 'yes') return;
  if (await saveDays(days.map((day) => ({ day, ...dayFields(planEntries[day]), is_purchased: true })))) {
    shoppingMessage.textContent = `✓ ${count} an Bring! gesendet, ${label} als gekauft markiert.`;
    drawShopping();
  } else {
    shoppingMessage.textContent = weekMessage.textContent;
  }
});

// Zurück zum Wochenplan (wirklich zurück, damit die Zurück-Geste danach nicht wieder hier landet)
shoppingBack.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.replace('#/week/' + shopping.monday);
});

// ---- Einzelne Tage bearbeiten ----

const EMPTY_DAY = { recipe_id: null, is_locked: false, is_day_off: false, is_purchased: false };

// Alle Felder eines Tages (für Tauschen und Umschalten)
function dayFields(entry) {
  return {
    recipe_id: entry?.recipe_id ?? null,
    is_locked: entry?.is_locked ?? false,
    is_day_off: entry?.is_day_off ?? false,
    is_purchased: entry?.is_purchased ?? false,
  };
}

const recipeById = (id) => recipes.find((r) => r.id === id) ?? null;

// Tage speichern, Anzeige aktualisieren, geänderte Tage kurz aufleuchten lassen
async function saveDays(rows) {
  weekMessage.textContent = '';
  try {
    for (const saved of await savePlanDays(rows)) planEntries[saved.day] = saved;
    rememberRecipes();
    drawWeek(new Set(rows.map((r) => r.day)));
    return true;
  } catch (error) {
    console.error(error);
    weekMessage.textContent = 'Speichern fehlgeschlagen: ' + saveErrorText(error);
    return false;
  }
}

// Nächster freier Tag nach "day" (frühestens morgen bzw. heute): kein Gericht und nicht "frei".
// Sucht bis zu 8 Wochen voraus, notfalls also auch in den Folgewochen.
async function findNextFreeDay(day) {
  const today = toIsoDate(new Date());
  const afterDay = toIsoDate(addDays(parseIsoDate(day), 1));
  const start = afterDay > today ? afterDay : today;
  const end = toIsoDate(addDays(parseIsoDate(start), 56));
  for (const entry of await fetchPlanDays(start, end)) planEntries[entry.day] = entry;
  for (let i = 0; i <= 56; i++) {
    const candidate = toIsoDate(addDays(parseIsoDate(start), i));
    const entry = planEntries[candidate];
    if (!entry || (!entry.recipe_id && !entry.is_day_off)) return candidate;
  }
  return toIsoDate(addDays(parseIsoDate(start), 57));
}

// Muss ein gekauftes Gericht seinen Tag verlassen? Dann nachfragen.
// Gibt zusätzliche zu speichernde Tage zurück ([] = nichts verschieben) oder null = Abbruch.
async function askWherePurchasedGoes(day) {
  const entry = planEntries[day];
  const recipe = entry?.is_purchased && !entry.is_day_off ? recipeById(entry.recipe_id) : null;
  if (!recipe) return [];
  const target = await findNextFreeDay(day);
  const choice = await openSheet({
    title: 'Zutaten schon gekauft',
    subtitle: `Für „${recipe.name}“ sind die Zutaten schon gekauft.`,
    actions: [
      { label: `➜ Auf ${formatDayLong(target)} verschieben`, value: 'move' },
      { label: 'Nicht mehr einplanen', value: 'drop' },
    ],
  });
  if (choice === null) return null;
  if (choice === 'drop') return [];
  showWeekNotes(`„${recipe.name}“ wurde auf ${formatDayLong(target)} verschoben.`, [], false);
  return [{ day: target, ...EMPTY_DAY, recipe_id: recipe.id, is_purchased: true }];
}

// Nur diesen einen Tag neu auslosen (nach den Regeln, möglichst ein anderes Rezept als bisher)
async function rerollDay(day, extraRows) {
  try {
    const context = await planningContext(weekMonday);
    const current = planEntries[day]?.recipe_id;
    if (current) context.recentRecipeIds.add(current);
    const days = weekDaysForPlanning(true).map((d) => ({ ...d, fillable: d.day === day }));
    const { assignments, notes } = generateWeek({ ...context, days, recipes });
    if (!assignments[day]) {
      showWeekNotes('Nichts geplant.', notes);
      return;
    }
    if (await saveDays([...extraRows, { day, ...EMPTY_DAY, recipe_id: assignments[day] }])) {
      if (notes.length > 0) showWeekNotes('Neu gewürfelt – mit Hinweisen:', notes);
    }
  } catch (error) {
    console.error(error);
    weekMessage.textContent = 'Neu würfeln fehlgeschlagen: ' + saveErrorText(error);
  }
}

// Menü für einen Tag (Antippen des Tages oder "⋯")
async function editDay(day) {
  const entry = planEntries[day];
  const recipe = entry && !entry.is_day_off ? recipeById(entry.recipe_id) : null;

  // Offline kann nichts geändert werden: dann direkt das Rezept öffnen (zum Nachlesen beim Kochen)
  if (isOffline) {
    if (recipe) location.hash = '#/recipe/' + recipe.id;
    return;
  }

  const actions = [];
  if (recipe) actions.push({ label: '📖 Rezept ansehen', value: 'view' });
  actions.push({ label: recipe ? '🔍 Anderes Rezept wählen' : '🔍 Rezept auswählen', value: 'pick' });
  if (!entry?.is_locked) actions.push({ label: recipe ? '🎲 Neu würfeln' : '🎲 Zufällig planen', value: 'reroll' });
  if (recipe) {
    actions.push({ label: entry.is_locked ? '🔓 Nicht mehr festhalten' : '🔒 Festhalten', value: 'lock' });
    actions.push({ label: entry.is_purchased ? '🛒 Doch nicht gekauft' : '🛒 Zutaten gekauft', value: 'purchased' });
    actions.push({ label: '⇄ Mit anderem Tag tauschen', value: 'swap' });
  }
  actions.push(entry?.is_day_off ? { label: '🍳 Doch kochen', value: 'cook' } : { label: '🍽 Tag frei (nicht kochen)', value: 'off' });
  if (recipe) actions.push({ label: 'Gericht entfernen', value: 'remove', danger: true });

  const subtitle = recipe ? recipe.name : entry?.is_day_off ? 'Frei' : 'Noch nichts geplant';
  const choice = await openSheet({ title: formatDayLong(day), subtitle, actions });
  if (choice === null) return;

  if (choice === 'view') {
    location.hash = '#/recipe/' + recipe.id;
  } else if (choice === 'pick') {
    const picked = await openRecipePicker({ title: formatDayLong(day), recipes, imageUrls });
    if (!picked || picked.id === recipe?.id) return;
    const extra = await askWherePurchasedGoes(day);
    if (extra === null) return;
    await saveDays([...extra, { day, ...EMPTY_DAY, recipe_id: picked.id }]);
  } else if (choice === 'reroll') {
    const extra = await askWherePurchasedGoes(day);
    if (extra === null) return;
    await rerollDay(day, extra);
  } else if (choice === 'lock') {
    await saveDays([{ day, ...dayFields(entry), is_locked: !entry.is_locked }]);
  } else if (choice === 'purchased') {
    await saveDays([{ day, ...dayFields(entry), is_purchased: !entry.is_purchased }]);
  } else if (choice === 'swap') {
    const others = Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(weekMonday, i))).filter((d) => d !== day);
    const target = await openSheet({
      title: 'Tauschen mit …',
      subtitle: `„${recipe.name}“ kommt auf den gewählten Tag, dessen Gericht hierher.`,
      actions: others.map((d) => {
        const other = planEntries[d];
        const otherRecipe = other && !other.is_day_off ? recipeById(other.recipe_id) : null;
        const what = otherRecipe ? otherRecipe.name : other?.is_day_off ? 'frei' : 'leer – verschieben';
        return { label: `${formatDayShort(d)} · ${what}`, value: d };
      }),
    });
    if (target === null) return;
    await saveDays([{ day, ...dayFields(planEntries[target]) }, { day: target, ...dayFields(entry) }]);
  } else if (choice === 'off') {
    const extra = await askWherePurchasedGoes(day);
    if (extra === null) return;
    await saveDays([...extra, { day, ...EMPTY_DAY, is_day_off: true }]);
  } else if (choice === 'cook') {
    await saveDays([{ day, ...EMPTY_DAY }]);
  } else if (choice === 'remove') {
    const extra = await askWherePurchasedGoes(day);
    if (extra === null) return;
    await saveDays([...extra, { day, ...EMPTY_DAY }]);
  }
}

// Nach dem Einkauf: alle geplanten Tage ab heute als gekauft markieren
purchaseWeekButton.addEventListener('click', async () => {
  const rows = upcomingPlannedDays()
    .filter((day) => !planEntries[day].is_purchased)
    .map((day) => ({ day, ...dayFields(planEntries[day]), is_purchased: true }));
  if (rows.length > 0 && (await saveDays(rows))) showWeekNotes(`🛒 ${rows.length} ${rows.length === 1 ? 'Tag' : 'Tage'} als gekauft markiert.`, [], false);
});

// showLoading: Tage kurz abblenden (nur beim Wechsel der Woche, nicht bei jeder Aktualisierung)
async function loadWeek(monday, showLoading) {
  if (showLoading) weekDays.classList.add('is-loading');
  weekMessage.textContent = '';
  try {
    const from = toIsoDate(monday);
    const to = toIsoDate(addDays(monday, 6));
    const days = await fetchPlanDays(from, to);
    if (!currentUserId) return; // inzwischen abgemeldet
    // Die Tage dieser Woche komplett ersetzen, damit auch gelöschte Einträge verschwinden
    for (const iso of Object.keys(planEntries)) {
      if (iso >= from && iso <= to) delete planEntries[iso];
    }
    for (const day of days) planEntries[day.day] = day;
    rememberRecipes();
  } catch (error) {
    console.error(error);
    if (!isOffline) weekMessage.textContent = 'Wochenplan konnte nicht geladen werden. Bitte Internet prüfen.';
  }
  weekDays.classList.remove('is-loading');
  // Nur neu zeichnen, wenn noch dieselbe Woche angezeigt wird
  if (toIsoDate(monday) === toIsoDate(weekMonday)) drawWeek();
}

// ---- Regeln für den Wochenplan ----

// Zeigt sofort die bekannten Regeln (falls schon geladen) und holt dann den aktuellen Stand.
// Hat man inzwischen etwas geändert, wird die Eingabe nicht überschrieben.
async function openRules() {
  rulesEdited = false;
  rulesProblems.replaceChildren();
  if (plannerRules) {
    fillRulesForm(plannerRules);
  } else {
    rulesMessage.textContent = 'Regeln werden geladen …';
    rulesSave.disabled = true;
  }
  try {
    plannerRules = normalizeRules(await fetchPlannerRules());
    if (!rulesEdited) fillRulesForm(plannerRules);
    rulesMessage.textContent = '';
    rulesSave.disabled = false;
  } catch (error) {
    console.error(error);
    rulesMessage.textContent = 'Regeln konnten nicht geladen werden. Bitte Internet prüfen.';
  }
}

function showRuleProblems(lines, className) {
  rulesProblems.replaceChildren(...lines.map((line) => {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = line;
    return p;
  }));
}

rulesForm.addEventListener('input', () => {
  rulesEdited = true;
  rulesProblems.replaceChildren();
});

rulesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const rules = readRulesForm();
  const { errors, warnings } = checkRules(rules);
  if (errors.length > 0) {
    showRuleProblems(errors, 'error');
    return;
  }
  if (warnings.length > 0 && !confirm(warnings.join('\n') + '\n\nTrotzdem speichern?')) return;

  rulesSave.disabled = true;
  rulesSave.textContent = 'Speichert …';
  try {
    plannerRules = normalizeRules(await savePlannerRules(rules));
    location.replace('#/week');
  } catch (error) {
    console.error(error);
    showRuleProblems(['Speichern fehlgeschlagen: ' + saveErrorText(error)], 'error');
  } finally {
    rulesSave.disabled = false;
    rulesSave.textContent = 'Speichern';
  }
});

rulesCancel.addEventListener('click', () => location.replace('#/week'));

// ‹ und ›: replace, damit "Zurück" den Wochenplan verlässt statt durch alle Wochen zu blättern
weekPrev.addEventListener('click', () => location.replace('#/week/' + toIsoDate(addDays(weekMonday, -7))));
weekNext.addEventListener('click', () => location.replace('#/week/' + toIsoDate(addDays(weekMonday, 7))));
weekToday.addEventListener('click', () => location.replace('#/week'));

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
  if (location.hash === '#/recipe/' + id) location.replace('#/recipes');
  else refreshView();
}

// Wochenplan vom anderen Handy. Eigene Änderungen kommen hier auch an – die sind
// schon eingetragen (gleicher Stand) und werden übersprungen, damit nichts doppelt aufblinkt.
function handleRemotePlanUpsert(row) {
  const known = planEntries[row.day];
  if (known && known.updated_at === row.updated_at) return;
  planEntries[row.day] = row;
  rememberRecipes();
  if (!weekView.hidden) drawWeek(new Set([row.day]));
}

function handleRemotePlanDelete(day) {
  if (!planEntries[day]) return;
  delete planEntries[day];
  rememberRecipes();
  if (!weekView.hidden) drawWeek();
}

// Regeln vom anderen Handy. Ist die Regel-Seite offen und noch unverändert, sofort anzeigen.
function handleRemoteRulesChange(rules) {
  plannerRules = normalizeRules(rules);
  if (!rulesView.hidden && !rulesEdited) fillRulesForm(plannerRules);
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
  if (!formView.hidden || !rulesView.hidden || !importView.hidden) return;
  renderRoute();
}

function renderRoute() {
  const hash = location.hash;
  const editMatch = hash.match(/^#\/recipe\/([^/]+)\/edit$/);
  const detailMatch = hash.match(/^#\/recipe\/([^/]+)$/);
  const findRecipe = (match) => (match ? recipes.find((r) => r.id === match[1]) : null);

  let view = null;
  const weekMatch = hash.match(/^#\/week(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  const shoppingMatch = hash.match(/^#\/shopping\/(\d{4}-\d{2}-\d{2})$/);
  if (hash === '#/recipes') {
    view = listView;
  } else if (shoppingMatch) {
    openShopping(startOfWeek(parseIsoDate(shoppingMatch[1])));
    view = shoppingView;
  } else if (weekMatch) {
    // "#/week" = aktuelle Woche, "#/week/2026-10-26" = Woche mit diesem Tag
    showWeek(startOfWeek(weekMatch[1] ? parseIsoDate(weekMatch[1]) : new Date()));
    view = weekView;
  } else if (hash === '#/rules') {
    // Offline kann nichts gespeichert werden, dann bleibt es beim Wochenplan
    if (isOffline) {
      showWeek(weekMonday);
      view = weekView;
    } else {
      openRules();
      view = rulesView;
    }
  } else if (isOffline && (hash === '#/new' || hash === '#/import' || editMatch)) {
    // Offline kann nichts gespeichert werden, also auch kein Formular öffnen
    view = listView;
  } else if (hash === '#/import') {
    openImport();
    view = importView;
  } else if (hash === '#/new') {
    editingId = null;
    showDraft(pendingDraft);
    pendingDraft = null; // nur einmal einsetzen
    view = formView;
  } else if (findRecipe(editMatch)) {
    const recipe = findRecipe(editMatch);
    editingId = recipe.id;
    fillRecipeForm(recipe, imageUrls[recipe.image_path]);
    formNotice.hidden = true;
    view = formView;
  } else if (findRecipe(detailMatch)) {
    const recipe = findRecipe(detailMatch);
    renderRecipeDetail(detailView, recipe, imageUrls[recipe.image_path], handleDelete);
    view = detailView;
  } else if (editMatch || detailMatch) {
    // Rezept (noch) nicht bekannt, z. B. während die Rezepte laden: Rezeptliste zeigen
    view = listView;
  }

  // Alles andere (auch die leere Adresse beim Start): Wochenplan der aktuellen Woche
  if (!view) {
    showWeek(startOfWeek(new Date()));
    view = weekView;
  }

  for (const v of [listView, detailView, formView, weekView, rulesView, shoppingView, importView]) v.hidden = v !== view;
  formError.textContent = '';

  // Leiste unten: aktiven Reiter markieren, Überschrift anpassen.
  // Ein Rezept gehört zu dem Reiter, von dem aus es geöffnet wurde.
  // In Formularen ausblenden, dort stehen unten "Speichern/Abbrechen".
  if (view === detailView && currentView !== detailView) detailTab = currentView === weekView ? 'week' : 'recipes';
  const activeTab = [weekView, rulesView, shoppingView].includes(view) || (view === detailView && detailTab === 'week') ? 'week' : 'recipes';
  for (const tab of tabBar.querySelectorAll('.tab')) {
    if (tab.dataset.tab === activeTab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  pageTitle.textContent = activeTab === 'week' ? 'Wochenplan' : 'Rezepte';
  const isForm = [formView, rulesView, shoppingView, importView].includes(view);
  tabBar.hidden = isForm;
  document.body.classList.toggle('has-tab-bar', !isForm);

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
  location.replace(editingId ? '#/recipe/' + editingId : '#/recipes');
});

// ---- Rezept importieren ----

// "+": importieren (Hauptweg) oder selbst eingeben
newRecipeButton.addEventListener('click', async () => {
  const choice = await openSheet({
    title: 'Neues Rezept',
    actions: [
      { label: '🔗 Aus Link importieren (Webseite, TikTok)', value: 'import' },
      { label: '✍️ Selbst eingeben', value: 'manual' },
    ],
  });
  if (choice === 'import') location.hash = '#/import';
  else if (choice === 'manual') location.hash = '#/new';
});

let importRunning = false;
let importImages = []; // gewählte Screenshots, verkleinert: [{ type, data (Base64) }]
let pendingImages = null; // läuft gerade das Verkleinern? (Promise)

function openImport() {
  if (importRunning) return; // Import läuft noch: alles stehen lassen
  importForm.reset();
  importError.textContent = '';
  importStatus.hidden = true;
  showImportText(false);
  setImportImages([]);

  // Per "Teilen" geschickt: Link einsetzen und gleich importieren (bzw. Text einsetzen)
  const shared = pendingShare;
  pendingShare = null;
  if (!shared) return;
  const url = extractUrl(shared);
  if (url) {
    importForm.elements.namedItem('url').value = url;
    importForm.requestSubmit();
  } else {
    showImportText(true);
    importForm.elements.namedItem('text').value = shared;
  }
}

// Zweiter Weg: Rezepttext einfügen statt die Seite laden zu lassen
function showImportText(show) {
  importTextSection.hidden = !show;
  importTextToggle.hidden = show;
}

importTextToggle.addEventListener('click', () => {
  showImportText(true);
  importForm.elements.namedItem('text').focus();
});

importTextPaste.addEventListener('click', async () => {
  importError.textContent = '';
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim()) importForm.elements.namedItem('text').value = text;
    else importError.textContent = 'Die Zwischenablage ist leer.';
  } catch {
    importError.textContent = 'Kein Zugriff auf die Zwischenablage – bitte lange ins Feld tippen und „Einfügen“ wählen.';
  }
});

// ---- Screenshots ----

const MAX_SCREENSHOTS = 4;
const SCREENSHOT_SIZE = 1800; // lange Seite in Pixeln: Text bleibt gut lesbar, Kosten bleiben klein

// Verkleinert ein Bild und gibt es als JPEG in Base64 zurück (so geht es an die Supabase-Funktion)
async function screenshotToBase64(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SCREENSHOT_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { type: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

function setImportImages(images) {
  importImages = images;
  importImagesInfo.hidden = images.length === 0;
  importImagesText.textContent = images.length === 1 ? '📷 1 Screenshot gewählt' : `📷 ${images.length} Screenshots gewählt`;
}

importImagesInput.addEventListener('change', () => {
  const files = [...importImagesInput.files];
  importImagesInput.value = ''; // damit dieselben Bilder erneut gewählt werden können
  if (files.length === 0) return;
  importError.textContent = '';
  if (files.length > MAX_SCREENSHOTS) {
    importError.textContent = `Bitte höchstens ${MAX_SCREENSHOTS} Screenshots wählen – die ersten ${MAX_SCREENSHOTS} werden genommen.`;
  }
  importImagesInfo.hidden = false;
  importImagesText.textContent = '📷 Screenshots werden vorbereitet …';
  pendingImages = Promise.all(files.slice(0, MAX_SCREENSHOTS).map(screenshotToBase64))
    .then(setImportImages)
    .catch(() => {
      setImportImages([]);
      importError.textContent = 'Diese Bilder können nicht verwendet werden. Bitte andere Screenshots wählen.';
    })
    .finally(() => {
      pendingImages = null;
    });
});

document.getElementById('import-images-clear').addEventListener('click', () => setImportImages([]));

// Aus geteiltem Text den Link herausfischen ("Schau dir das an! https://vm.tiktok.com/…")
function extractUrl(text) {
  return String(text ?? '').match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[).,!?]+$/, '') ?? null;
}

importPaste.addEventListener('click', async () => {
  importError.textContent = '';
  try {
    const url = extractUrl(await navigator.clipboard.readText());
    if (url) importForm.elements.namedItem('url').value = url;
    else importError.textContent = 'In der Zwischenablage ist kein Link.';
  } catch {
    importError.textContent = 'Kein Zugriff auf die Zwischenablage – bitte lange ins Feld tippen und „Einfügen“ wählen.';
  }
});

importForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pendingImages) await pendingImages; // Screenshots erst fertig verkleinern
  const url = extractUrl(importForm.elements.namedItem('url').value);
  const text = importTextSection.hidden ? '' : importForm.elements.namedItem('text').value.trim();
  const images = importImages;
  if (!url && !text && images.length === 0) {
    importError.textContent = importTextSection.hidden ? 'Bitte einen Link (https://…) einfügen oder Screenshots wählen.' : 'Bitte den Rezepttext einfügen.';
    return;
  }
  importError.textContent = '';
  importStatus.hidden = false;
  importSubmit.disabled = true;
  importSubmit.textContent = 'Importiere …';
  importRunning = true;
  try {
    const result = await importRecipe(url ?? '', images.length > 0 ? '' : text, images);
    // Nur übernehmen, wenn man noch auf der Import-Seite ist (sonst nicht ungefragt ins Formular springen)
    if (location.hash === '#/import') {
      pendingDraft = result;
      location.replace('#/new');
    }
  } catch (error) {
    importError.textContent = error.message;
    // Seite blockt automatische Abrufe: gleich das Textfeld anbieten
    if (error.details?.blocked) showImportText(true);
  } finally {
    importRunning = false;
    importStatus.hidden = true;
    importSubmit.disabled = false;
    importSubmit.textContent = 'Importieren';
  }
});

importCancel.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.replace('#/recipes');
});

function base64ToBlob({ data, type }) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

// "Neues Rezept": leer, oder mit importiertem Entwurf vorausgefüllt (Prüf-Bildschirm)
function showDraft(draft) {
  if (!draft) {
    fillRecipeForm(null);
    formNotice.hidden = true;
    return;
  }
  fillRecipeForm({ ...draft.recipe, is_favorite: false, last_cooked_on: null });
  document.getElementById('form-title').textContent = 'Importiertes Rezept prüfen';
  if (draft.image) useImportedImage(base64ToBlob(draft.image));

  // Hinweis oben: woher, und ob es das Rezept schon gibt
  const source = draft.recipe.source_url;
  const origin = (() => {
    try {
      return `aus ${new URL(source).hostname.replace(/^www\./, '')} importiert`;
    } catch {
      return 'aus dem eingefügten Text erstellt';
    }
  })();
  const lines = [document.createElement('p')];
  lines[0].textContent = `✨ Von Claude ${origin} – bitte prüfen, bei Bedarf anpassen und speichern.`;
  const duplicate = recipes.find((r) => r.source_url && r.source_url === source);
  if (duplicate) {
    const warning = document.createElement('p');
    warning.append('⚠️ Dieses Rezept gibt es schon: ');
    const link = document.createElement('a');
    link.href = '#/recipe/' + duplicate.id;
    link.textContent = duplicate.name;
    warning.append(link);
    lines.push(warning);
  }
  formNotice.replaceChildren(...lines);
  formNotice.classList.toggle('has-warning', Boolean(duplicate));
  formNotice.hidden = false;
}

async function handleDelete(recipe) {
  if (!confirm(`„${recipe.name}“ wirklich löschen?`)) return;
  try {
    await deleteRecipe(recipe.id);
    if (recipe.image_path) deleteImage(recipe.image_path);
    recipes = recipes.filter((r) => r.id !== recipe.id);
    rememberRecipes();
    showList();
    location.replace('#/recipes');
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

// Android "Teilen" (share_target im Manifest) öffnet die App als ./?shared_text=…
// Geteiltes merken, Adresse aufräumen und zur Import-Seite wechseln.
{
  const params = new URLSearchParams(location.search);
  const shared = ['shared_url', 'shared_text', 'shared_title'].map((key) => params.get(key)?.trim()).filter(Boolean);
  if (shared.length > 0) {
    pendingShare = shared.find((value) => extractUrl(value)) ?? shared.join('\n');
    history.replaceState(null, '', location.pathname + '#/import');
  }
}

window.addEventListener('hashchange', showRoute);

onAuthChange(showView);

// Service Worker anmelden (macht die App installierbar und offline startfähig)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Service Worker konnte nicht angemeldet werden:', error);
  });
}
