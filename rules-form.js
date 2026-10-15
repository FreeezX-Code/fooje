// Die Seite "Regeln für den Wochenplan": Werte hineinschreiben und wieder auslesen.
import { MAIN_COMPONENT_LABELS, MAIN_COMPONENT_ICONS } from './views.js';

const form = document.getElementById('rules-form');
const componentRows = document.getElementById('rule-components');
const field = (name) => form.elements.namedItem(name);

// Auswahlfeld mit 0–7 (und bei "höchstens" zusätzlich "beliebig")
function daySelect(name, label, withAny) {
  const select = document.createElement('select');
  select.name = name;
  select.setAttribute('aria-label', label);
  if (withAny) select.add(new Option('beliebig', ''));
  for (let n = 0; n <= 7; n++) select.add(new Option(n + '×', String(n)));
  return select;
}

// Kopfzeile einmal oben, dann eine Zeile pro Hauptkomponente: Symbol + Name | mindestens | höchstens
const head = document.createElement('div');
head.className = 'rule-row rule-head';
for (const text of ['', 'mindestens', 'höchstens']) {
  const cell = document.createElement('span');
  cell.textContent = text;
  head.append(cell);
}
componentRows.append(head);

for (const [key, label] of Object.entries(MAIN_COMPONENT_LABELS)) {
  const row = document.createElement('div');
  row.className = 'rule-row';

  const name = document.createElement('span');
  name.className = 'rule-name';
  name.textContent = `${MAIN_COMPONENT_ICONS[key]} ${label}`;

  row.append(name, daySelect(`${key}_min`, `${label} mindestens`, false), daySelect(`${key}_max`, `${label} höchstens`, true));
  componentRows.append(row);
}

export function fillRulesForm(rules) {
  for (const [key, { min, max }] of Object.entries(rules.main_components)) {
    field(`${key}_min`).value = String(min);
    field(`${key}_max`).value = max === null ? '' : String(max);
  }
  field('no_repeat_main_component').checked = rules.no_repeat_main_component;
  field('no_repeat_side_dish').checked = rules.no_repeat_side_dish;
  field('avoid_recent_weeks').value = String(rules.avoid_recent_weeks);
  field('prefer_favorites').checked = rules.prefer_favorites;
}

export function readRulesForm() {
  const mainComponents = {};
  for (const key of Object.keys(MAIN_COMPONENT_LABELS)) {
    const max = field(`${key}_max`).value;
    mainComponents[key] = { min: Number(field(`${key}_min`).value), max: max === '' ? null : Number(max) };
  }
  return {
    main_components: mainComponents,
    no_repeat_main_component: field('no_repeat_main_component').checked,
    no_repeat_side_dish: field('no_repeat_side_dish').checked,
    avoid_recent_weeks: Number(field('avoid_recent_weeks').value),
    prefer_favorites: field('prefer_favorites').checked,
  };
}
