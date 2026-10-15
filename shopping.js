// Einkaufsliste: Zutaten mehrerer Gerichte zusammenfassen, Mengen umrechnen und addieren.

// ---- Mengen lesen und schreiben ----

const UNICODE_FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

// "200" → 200, "1,5" → 1.5, "1/2" → 0.5, "1 1/2" → 1.5, "½" → 0.5. Alles andere ("etwas", "2-3") → null.
export function parseAmount(text) {
  let value = String(text ?? '').trim().replace(',', '.');
  if (value === '') return null;
  for (const [char, number] of Object.entries(UNICODE_FRACTIONS)) {
    if (value.endsWith(char)) {
      const whole = value.slice(0, -1).trim();
      if (whole === '') return number;
      if (/^\d+$/.test(whole)) return Number(whole) + number;
      return null;
    }
  }
  let match = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (match) return Number(match[1]) + Number(match[2]) / Number(match[3]);
  match = value.match(/^(\d+)\/(\d+)$/);
  if (match && Number(match[2]) !== 0) return Number(match[1]) / Number(match[2]);
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

// Zahl schön auf Deutsch: 0.5 → "0,5", 250 → "250", 1.333 → "1,3"
export function formatAmount(number) {
  const rounded = number >= 10 ? Math.round(number) : Math.round(number * 10) / 10;
  return String(rounded).replace('.', ',');
}

// Einheiten vereinheitlichen, damit "g" und "Gramm" zusammengezählt werden.
// kg und l werden zum Rechnen in g und ml umgewandelt (factor).
const UNITS = {
  g: { unit: 'g', factor: 1 }, gr: { unit: 'g', factor: 1 }, gramm: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 }, kilo: { unit: 'g', factor: 1000 }, kilogramm: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 }, milliliter: { unit: 'ml', factor: 1 },
  l: { unit: 'ml', factor: 1000 }, liter: { unit: 'ml', factor: 1000 },
  el: { unit: 'EL', factor: 1 }, esslöffel: { unit: 'EL', factor: 1 },
  tl: { unit: 'TL', factor: 1 }, teelöffel: { unit: 'TL', factor: 1 },
  stück: { unit: '', factor: 1 }, stk: { unit: '', factor: 1 }, 'stk.': { unit: '', factor: 1 },
};

function normalizeUnit(unit) {
  const key = String(unit ?? '').trim().toLocaleLowerCase('de');
  return UNITS[key] ?? { unit: String(unit ?? '').trim(), factor: 1 };
}

// Summe in einer Einheit lesbar machen: 1500 g → "1,5 kg", 750 ml → "750 ml"
function formatQuantity(amount, unit) {
  if (unit === 'g' && amount >= 1000) return `${formatAmount(amount / 1000)} kg`;
  if (unit === 'ml' && amount >= 1000) return `${formatAmount(amount / 1000)} l`;
  return unit ? `${formatAmount(amount)} ${unit}` : formatAmount(amount);
}

// ---- Zusammenfassen ----

const nameKey = (name) => name.trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');

/**
 * dishes: [{ recipe, factor }] – factor = gewünschte Portionen / Portionen im Rezept
 * Ergebnis (alphabetisch): [{ key, name, quantity: "500 g + 1 Dose", sources: ["Curry", …] }]
 *   name = Zutat, quantity = zusammengefasste Menge (leer, wenn keine angegeben)
 */
export function aggregateIngredients(dishes) {
  const groups = new Map();

  for (const { recipe, factor } of dishes) {
    for (const ingredient of recipe.ingredients ?? []) {
      const name = String(ingredient.name ?? '').trim();
      if (!name) continue;
      const key = nameKey(name);
      if (!groups.has(key)) groups.set(key, { key, name, sums: new Map(), texts: [], sources: [] });
      const group = groups.get(key);
      if (!group.sources.includes(recipe.name)) group.sources.push(recipe.name);

      const amount = parseAmount(ingredient.amount);
      const { unit, factor: unitFactor } = normalizeUnit(ingredient.unit);
      if (amount !== null) {
        // Zahl: umrechnen und zu gleicher Einheit addieren
        group.sums.set(unit, (group.sums.get(unit) ?? 0) + amount * factor * unitFactor);
      } else {
        // Keine Zahl ("etwas", "2-3"): als Text übernehmen, doppelte nur einmal.
        // Spannen wie "2-3" werden dabei mit umgerechnet.
        const range = String(ingredient.amount ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
        const amountText = range
          ? `${formatAmount(parseAmount(range[1]) * factor)}–${formatAmount(parseAmount(range[2]) * factor)}`
          : ingredient.amount;
        const text = [amountText, ingredient.unit].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
        if (text && !group.texts.includes(text)) group.texts.push(text);
      }
    }
  }

  return [...groups.values()]
    .map(({ key, name, sums, texts, sources }) => ({
      key,
      name,
      quantity: [...[...sums].map(([unit, amount]) => formatQuantity(amount, unit)), ...texts].join(' + '),
      sources,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ---- Anzeige ----

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function card(title) {
  const section = el('section', 'form-card');
  section.append(el('h3', null, title));
  return section;
}

/**
 * Zeichnet die Einkaufsliste.
 *   days:   [{ day, label, recipe, purchased, selected }] – alle geplanten Tage der Woche
 *   dishes: [{ day, recipe, servings, baseServings }]     – Gerichte der ausgewählten Tage
 *   items:  Ergebnis von aggregateIngredients, unchecked: Set der abgewählten Zutaten (key)
 *   on:     { toggleDay(day), changeServings(day, delta), toggleItem(key) }
 */
export function renderShopping(container, { days, dishes, items, unchecked, on }) {
  container.replaceChildren();

  if (days.length === 0) {
    container.append(el('p', 'muted', 'In dieser Woche ist noch nichts geplant.'));
    return;
  }

  // Tage
  const dayCard = card('Für welche Tage?');
  const chips = el('div', 'shopping-days');
  for (const d of days) {
    const chip = el('button', 'chip', `${d.label} · ${d.recipe.name}${d.purchased ? ' 🛒' : ''}`);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(d.selected));
    chip.addEventListener('click', () => on.toggleDay(d.day));
    chips.append(chip);
  }
  dayCard.append(chips);
  container.append(dayCard);

  if (dishes.length === 0) {
    container.append(el('p', 'muted', 'Bitte mindestens einen Tag auswählen.'));
    return;
  }

  // Portionen pro Gericht
  const servingsCard = card('Portionen');
  for (const dish of dishes) {
    const row = el('div', 'servings-row');
    row.append(el('span', 'servings-name', dish.recipe.name));
    if (dish.baseServings) {
      const stepper = el('div', 'stepper');
      const minus = el('button', 'stepper-button', '−');
      minus.type = 'button';
      minus.disabled = dish.servings <= 1;
      minus.setAttribute('aria-label', `${dish.recipe.name}: weniger Portionen`);
      minus.addEventListener('click', () => on.changeServings(dish.day, -1));
      const plus = el('button', 'stepper-button', '+');
      plus.type = 'button';
      plus.setAttribute('aria-label', `${dish.recipe.name}: mehr Portionen`);
      plus.addEventListener('click', () => on.changeServings(dish.day, 1));
      stepper.append(minus, el('span', 'stepper-value', `${dish.servings} Port.`), plus);
      row.append(stepper);
    } else {
      row.append(el('span', 'muted servings-unknown', 'Portionen nicht angegeben'));
    }
    servingsCard.append(row);
  }
  container.append(servingsCard);

  // Zutaten zum Abhaken
  const selectedCount = items.filter((item) => !unchecked.has(item.key)).length;
  const itemCard = card(`Zutaten (${selectedCount} von ${items.length})`);
  itemCard.append(el('p', 'muted card-hint', 'Was ihr schon im Haus habt, antippen – dann wird es nicht mitgeschickt.'));
  const list = el('ul', 'shopping-items');
  for (const item of items) {
    const checked = !unchecked.has(item.key);
    const button = el('button', 'shopping-item' + (checked ? '' : ' is-unchecked'));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(checked));
    const text = el('span', 'shopping-item-text');
    const line = el('span', 'shopping-item-line');
    if (item.quantity) line.append(el('strong', null, item.quantity + ' '));
    line.append(item.name);
    text.append(line, el('span', 'shopping-item-sources muted', item.sources.join(', ')));
    button.append(el('span', 'shopping-check', checked ? '✓' : ''), text);
    button.addEventListener('click', () => on.toggleItem(item.key));
    const li = el('li');
    li.append(button);
    list.append(li);
  }
  if (items.length === 0) list.append(el('li', 'muted', 'Diese Gerichte haben keine Zutaten eingetragen.'));
  itemCard.append(list);
  container.append(itemCard);
}

// Text zum Teilen: "Einkaufsliste KW 42\n\n• 500 g Nudeln\n• Salz"
export function shoppingListText(title, items) {
  const lines = items.map((item) => `• ${item.quantity ? item.quantity + ' ' : ''}${item.name}`);
  return `${title}\n\n${lines.join('\n')}`;
}
