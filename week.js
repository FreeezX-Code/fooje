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

// "2026-10-21" → "Mittwoch, 21.10."
export function formatDayLong(iso) {
  return parseIsoDate(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

// "2026-10-21" → "Mi 21.10."
export function formatDayShort(iso) {
  const date = parseIsoDate(iso);
  return `${WEEKDAYS[(date.getDay() + 6) % 7]} ${date.getDate()}.${date.getMonth() + 1}.`;
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
// highlight = Set von Tagen, die gerade geändert wurden (leuchten kurz auf)
// onEdit(tag) = wird beim Antippen eines Tages oder von "⋯" aufgerufen
// showPast = vergangene Tage anzeigen; onTogglePast = Knopf "anzeigen/ausblenden" wurde angetippt
export function renderWeek(container, monday, entries, recipes, imageUrls, {
  highlight = new Set(), onEdit = () => {}, showPast = false, onTogglePast = () => {},
} = {}) {
  container.replaceChildren();
  const today = toIsoDate(new Date());

  // Vergangene Tage ausblenden – außer die ganze Woche ist vorbei (dann schaut man absichtlich zurück)
  const pastCount = Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(monday, i))).filter((iso) => iso < today).length;
  const canHidePast = pastCount > 0 && pastCount < 7;
  const hidePast = canHidePast && !showPast;

  if (canHidePast) {
    const toggle = el('button', 'past-toggle', hidePast
      ? `▾ ${pastCount === 1 ? 'Vergangenen Tag' : `${pastCount} vergangene Tage`} anzeigen`
      : '▴ Vergangene Tage ausblenden');
    toggle.type = 'button';
    toggle.addEventListener('click', onTogglePast);
    const item = el('li', 'past-toggle-item');
    item.append(toggle);
    container.append(item);
  }

  let shown = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const iso = toIsoDate(date);
    if (hidePast && iso < today) continue;
    const entry = entries[iso];
    const recipe = entry?.recipe_id && !entry.is_day_off ? recipes.find((r) => r.id === entry.recipe_id) : null;

    const card = el('div', 'day-card');
    if (iso === today) card.classList.add('is-today');
    if (iso < today) card.classList.add('is-past');

    const dateBox = el('div', 'day-date');
    dateBox.append(el('span', 'day-weekday', WEEKDAYS[i]), el('span', 'day-number', String(date.getDate())));
    if (iso === today) dateBox.append(el('span', 'day-today', 'Heute'));

    // Antippen des Tages öffnet das Menü für diesen Tag (dort auch "Rezept ansehen")
    const content = el('button', 'day-content');
    content.type = 'button';
    content.addEventListener('click', () => onEdit(iso));
    if (recipe) {
      const text = el('div', 'day-text');
      const name = el('span', 'day-recipe-name', recipe.name);
      const badges = [entry.is_locked ? '🔒' : null, entry.is_purchased ? '🛒' : null].filter(Boolean);
      if (badges.length > 0) name.prepend(el('span', 'day-badges', badges.join(' ')));
      const meta = [recipe.prep_time_minutes ? recipe.prep_time_minutes + ' Min.' : null, MAIN_COMPONENT_LABELS[recipe.main_component]];
      text.append(name, el('span', 'day-recipe-meta', meta.filter(Boolean).join(' · ')));
      content.append(thumbnail(recipe, imageUrls[recipe.image_path]), text);
    } else {
      content.classList.add('is-empty');
      if (entry?.is_day_off) {
        content.append(el('span', 'day-empty-icon', '🍽'), el('span', null, 'Frei – heute wird nicht gekocht'));
      } else if (entry?.recipe_id) {
        content.append(el('span', null, 'Rezept nicht gefunden'));
      } else {
        content.append(el('span', null, 'Noch nichts geplant'), el('span', 'day-add', '+'));
      }
    }

    const menu = el('button', 'day-menu', '⋯');
    menu.type = 'button';
    menu.setAttribute('aria-label', `${WEEKDAYS[i]} ${date.getDate()}. bearbeiten`);
    menu.addEventListener('click', () => onEdit(iso));

    card.append(dateBox, content, menu);
    const item = el('li');
    item.style.setProperty('--i', shown++);
    if (highlight.has(iso)) item.classList.add('just-planned');
    item.append(card);
    container.append(item);
  }
}
