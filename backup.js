// Backup: alle Rezepte als JSON-Datei speichern und wieder einlesen.
import { MAIN_COMPONENT_LABELS, SIDE_DISH_LABELS } from './views.js';

const BACKUP_APP = 'rezept-wochenplaner';
const BACKUP_VERSION = 1;

// Erstellt die Backup-Datei, z. B. "rezepte-backup-2026-10-15.json"
export function createBackupFile(recipes) {
  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
  };
  const date = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(backup, null, 2)], `rezepte-backup-${date}.json`, { type: 'application/json' });
}

// Datei an den Nutzer geben: auf dem Handy über das Teilen-Menü
// (dort "In Dateien sichern", Drive, Mail …), sonst als normaler Download.
export async function shareOrDownload(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return; // Teilen-Menü abgebrochen
      console.warn('Teilen nicht möglich, lade stattdessen herunter:', error);
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---- Einlesen ----

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const asText = (value) => (typeof value === 'string' ? value.trim() : '');
const asTextOrNull = (value) => asText(value) || null;
const asIntegerOrNull = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

// Prüft ein Rezept aus der Datei und übernimmt nur bekannte, gültige Felder.
// Gibt null zurück, wenn das Rezept unbrauchbar ist (kein Name, unbekannte Hauptkomponente).
function cleanRecipe(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = asText(raw.name);
  if (!name || !(raw.main_component in MAIN_COMPONENT_LABELS)) return null;

  const recipe = {
    name,
    main_component: raw.main_component,
    side_dish: raw.side_dish in SIDE_DISH_LABELS ? raw.side_dish : 'none',
    ingredients: (Array.isArray(raw.ingredients) ? raw.ingredients : [])
      .map((i) => ({ name: asText(i?.name), amount: asText(i?.amount), unit: asText(i?.unit) }))
      .filter((i) => i.name),
    steps: (Array.isArray(raw.steps) ? raw.steps : []).map(asText).filter(Boolean),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map(asText).filter(Boolean),
    servings: asIntegerOrNull(raw.servings) || null,
    prep_time_minutes: asIntegerOrNull(raw.prep_time_minutes),
    image_path: asTextOrNull(raw.image_path),
    source_url: asTextOrNull(raw.source_url),
    is_favorite: raw.is_favorite === true,
    last_cooked_on: DATE_PATTERN.test(raw.last_cooked_on) ? raw.last_cooked_on : null,
  };
  // Die ID behalten, damit ein erneutes Einspielen das Rezept wiedererkennt
  if (UUID_PATTERN.test(raw.id)) recipe.id = raw.id;
  if (typeof raw.created_at === 'string' && !Number.isNaN(Date.parse(raw.created_at))) recipe.created_at = raw.created_at;
  return recipe;
}

// Liest den Dateiinhalt und teilt die Rezepte auf.
// Gibt { newRecipes, existingCount, invalidCount } zurück oder wirft einen Fehler mit deutscher Meldung.
export function parseBackup(text, existingIds) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige Backup-Datei.');
  }
  if (backup?.app !== BACKUP_APP || !Array.isArray(backup.recipes)) {
    throw new Error('Die Datei ist kein Backup dieser App.');
  }

  const newRecipes = [];
  let existingCount = 0;
  let invalidCount = 0;
  const seenIds = new Set();
  for (const raw of backup.recipes) {
    const recipe = cleanRecipe(raw);
    if (!recipe) invalidCount++;
    else if (recipe.id && (existingIds.has(recipe.id) || seenIds.has(recipe.id))) existingCount++;
    else {
      if (recipe.id) seenIds.add(recipe.id);
      newRecipes.push(recipe);
    }
  }
  return { newRecipes, existingCount, invalidCount };
}
