// Wochenplan: Datumsrechnung (Woche beginnt am Montag) und die Tageskarten.
// Gerechnet wird immer mit der Ortszeit des Handys, gespeichert als "JJJJ-MM-TT".
import { MAIN_COMPONENT_LABELS, MAIN_COMPONENT_ICONS } from './views.js';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// ---- Datumsrechnung ----

// Datum → "2026-10-19" (nicht toISOString: das rechnet in UTC und kann einen Tag danebenliegen)
export function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "2026-10-19" → Datum (Mitternacht Ortszeit)
export function parseIsoDate(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Montag der Woche, in der das Datum liegt
export function startOfWeek(date) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

// Kalenderwoche nach ISO 8601 (wie in deutschen Kalendern)
export function isoWeekNumber(date) {
  const thursday = addDays(startOfWeek(date), 3); // Die KW gehört zu dem Jahr, in dem ihr Donnerstag liegt
  const firstThursday = addDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
  return 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

// z. B. "19.–25. Oktober" oder "27. Okt. – 2. Nov."
export function weekRangeLabel(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}.–${sunday.getDate()}. ${monday.toLocaleDateString('de-DE', { month: 'long' })}`;
  }
  const short = (date) => date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return `${short(monday)} – ${short(sunday)}`;
}

// ---- Tageskarten ----

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function thumbnail(recipe, imageUrl) {
  if (imageUrl) {
    const img = el('img', 'day-thumb recipe-image');
    img.src = imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.crossOrigin = 'anonymous';
    return img;
  }
  const placeholder = el('div', 'day-thumb recipe-placeholder', MAIN_COMPONENT_ICONS[recipe.main_component] || '🍽️');
  placeholder.dataset.main = recipe.main_component;
  return placeholder;
}

// Zeichnet die 7 Tage ab "monday".
// entries = { "2026-10-19": Eintrag aus meal_plan_days, … }, recipes = alle Rezepte
// highlight = Set von Tagen, die gerade neu geplant wurden (leuchten kurz auf)
export function renderWeek(container, monday, entries, recipes, imageUrls, highlight = new Set()) {
  container.replaceChildren();
  const today = toIsoDate(new Date());

  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const iso = toIsoDate(date);
    const entry = entries[iso];
    const recipe = entry?.recipe_id ? recipes.find((r) => r.id === entry.recipe_id) : null;

    // Mit Rezept ist die ganze Karte ein Link zum Rezept
    const card = el(recipe ? 'a' : 'div', 'day-card');
    if (recipe) card.href = '#/recipe/' + recipe.id;
    if (iso === today) card.classList.add('is-today');
    if (iso < today) card.classList.add('is-past');

    const dateBox = el('div', 'day-date');
    dateBox.append(el('span', 'day-weekday', WEEKDAYS[i]), el('span', 'day-number', String(date.getDate())));
    if (iso === today) dateBox.append(el('span', 'day-today', 'Heute'));

    const content = el('div', 'day-content');
    if (entry?.is_day_off) {
      content.classList.add('is-empty');
      content.append(el('span', 'day-empty-icon', '🍽'), el('span', null, 'Frei – heute wird nicht gekocht'));
    } else if (recipe) {
      const text = el('div', 'day-text');
      const name = el('span', 'day-recipe-name', recipe.name);
      if (entry.is_locked) name.prepend(el('span', 'day-lock', '🔒'));
      const meta = [recipe.prep_time_minutes ? recipe.prep_time_minutes + ' Min.' : null, MAIN_COMPONENT_LABELS[recipe.main_component]];
      text.append(name, el('span', 'day-recipe-meta', meta.filter(Boolean).join(' · ')));
      content.append(thumbnail(recipe, imageUrls[recipe.image_path]), text);
    } else if (entry?.recipe_id) {
      content.classList.add('is-empty');
      content.append(el('span', null, 'Rezept nicht gefunden'));
    } else {
      content.classList.add('is-empty');
      content.append(el('span', null, 'Noch nichts geplant'));
    }

    card.append(dateBox, content);
    const item = el('li');
    item.style.setProperty('--i', i);
    if (highlight.has(iso)) item.classList.add('just-planned');
    item.append(card);
    container.append(item);
  }
}
