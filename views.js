// Baut die Ansichten (Rezeptliste, Rezeptdetails) aus den Daten auf.
// Texte werden immer über textContent eingesetzt, nie als HTML. So kann ein
// Rezepttext nie versehentlich als Code ausgeführt werden.

// Gespeicherte Werte (englisch) → Anzeige (deutsch)
export const MAIN_COMPONENT_LABELS = {
  meat: 'Fleisch',
  poultry: 'Geflügel',
  fish: 'Fisch',
  vegetarian: 'Vegetarisch',
  vegan: 'Vegan',
};

export const SIDE_DISH_LABELS = {
  pasta: 'Nudeln',
  rice: 'Reis',
  potatoes: 'Kartoffeln',
  bread: 'Brot',
  none: 'keine',
};

// Platzhalter, solange ein Rezept kein Bild hat
export const MAIN_COMPONENT_ICONS = {
  meat: '🥩',
  poultry: '🍗',
  fish: '🐟',
  vegetarian: '🥕',
  vegan: '🌱',
};

// Kleiner Helfer: erzeugt ein HTML-Element mit Klasse und Text
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

// Rezeptbild, oder ein Symbol als Platzhalter, wenn es (noch) kein Bild gibt
function recipeImage(recipe, imageUrl, className) {
  if (imageUrl) {
    const img = el('img', 'recipe-image ' + className);
    img.src = imageUrl;
    img.alt = recipe.name;
    img.loading = 'lazy';
    // Damit der Service Worker erkennen kann, ob das Bild erfolgreich geladen wurde
    img.crossOrigin = 'anonymous';
    return img;
  }
  const placeholder = el('div', 'recipe-placeholder ' + className, MAIN_COMPONENT_ICONS[recipe.main_component] || '🍽️');
  placeholder.dataset.main = recipe.main_component; // für den Farbton in style.css
  return placeholder;
}

// z. B. "30 Min. · Vegetarisch"
function metaLine(recipe) {
  const parts = [];
  if (recipe.prep_time_minutes) parts.push(recipe.prep_time_minutes + ' Min.');
  parts.push(MAIN_COMPONENT_LABELS[recipe.main_component]);
  return parts.join(' · ');
}

// z. B. "200 g" oder "etwas"
function quantityText(ingredient) {
  return [ingredient.amount, ingredient.unit].filter(Boolean).join(' ');
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('de-DE');
}

// Nur echte Web-Links zulassen
function isWebLink(url) {
  return /^https?:\/\//i.test(url || '');
}

// Reihe von Filter-Knöpfen. options = [{ value, label }], selected = Set der gewählten Werte,
// onToggle(value) wird beim Antippen aufgerufen.
export function renderChips(container, options, selected, onToggle) {
  container.replaceChildren();
  for (const option of options) {
    const chip = el('button', 'chip', option.label);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(selected.has(option.value)));
    chip.addEventListener('click', () => onToggle(option.value));
    container.append(chip);
  }
}

// imageUrls = { Bildpfad: Link } für alle Rezepte mit Bild
// animate = true: Karten schweben nacheinander ein (nur beim ersten Anzeigen, nicht bei jeder Suche)
export function renderRecipeList(container, recipes, imageUrls, animate = false) {
  container.replaceChildren();
  container.classList.toggle('animate-in', animate);
  recipes.forEach((recipe, index) => {
    // Karte: Foto (oder Farbkachel), darauf unten Name (+ ★) und Eckdaten
    const link = el('a', 'recipe-card');
    link.href = '#/recipe/' + recipe.id;

    const title = el('div', 'recipe-card-title');
    title.append(el('span', 'recipe-card-name', recipe.name));
    if (recipe.is_favorite) title.append(el('span', 'favorite', '★'));

    const overlay = el('div', 'recipe-card-overlay');
    overlay.append(title, el('span', 'recipe-card-meta', metaLine(recipe)));

    link.append(recipeImage(recipe, imageUrls[recipe.image_path], 'recipe-card-image'), overlay);

    const item = el('li');
    item.style.setProperty('--i', Math.min(index, 8)); // Verzögerung fürs Einschweben
    item.append(link);
    container.append(item);
  });
}

// Schimmernde Platzhalter-Karten, solange die Rezepte laden
export function renderSkeletonList(container) {
  container.replaceChildren();
  container.classList.remove('animate-in');
  for (let i = 0; i < 3; i++) {
    const item = el('li');
    item.append(el('div', 'skeleton-card'));
    container.append(item);
  }
}

// imageUrl = Link zum Bild (oder undefined), onDelete wird bei "Löschen" aufgerufen
export function renderRecipeDetail(container, recipe, imageUrl, onDelete) {
  container.replaceChildren();

  // "Zurück" führt dorthin, wo man herkam (Wochenplan oder Rezeptliste).
  // Wurde die App direkt auf dem Rezept geöffnet, geht es zur Rezeptliste.
  const back = el('a', 'back-link', '‹ Zurück');
  back.href = '#/recipes';
  back.addEventListener('click', (event) => {
    if (history.length > 1) {
      event.preventDefault();
      history.back();
    }
  });
  container.append(back);

  container.append(recipeImage(recipe, imageUrl, 'recipe-hero'));

  const title = el('h2', 'recipe-title', recipe.name);
  if (recipe.is_favorite) title.append(el('span', 'favorite', ' ★'));
  container.append(title);

  // Eckdaten als kleine Kärtchen
  const facts = el('ul', 'facts');
  const addFact = (icon, text) => {
    if (!text) return;
    const fact = el('li', 'fact');
    fact.append(el('span', 'fact-icon', icon), el('span', null, text));
    facts.append(fact);
  };
  addFact('⏱', recipe.prep_time_minutes ? recipe.prep_time_minutes + ' Min.' : null);
  addFact('👥', recipe.servings ? recipe.servings + (recipe.servings === 1 ? ' Portion' : ' Portionen') : null);
  addFact(MAIN_COMPONENT_ICONS[recipe.main_component], MAIN_COMPONENT_LABELS[recipe.main_component]);
  addFact('🍽', recipe.side_dish !== 'none' ? 'mit ' + SIDE_DISH_LABELS[recipe.side_dish] : null);
  addFact('📅', recipe.last_cooked_on ? 'zuletzt ' + formatDate(recipe.last_cooked_on) : null);
  container.append(facts);

  if (recipe.tags.length > 0) {
    const tags = el('ul', 'tags');
    for (const tag of recipe.tags) tags.append(el('li', 'tag', tag));
    container.append(tags);
  }

  // Zutaten: Menge links, Zutat rechts
  const ingredientCard = el('section', 'detail-card');
  ingredientCard.append(el('h3', null, 'Zutaten'));
  if (recipe.ingredients.length > 0) {
    const list = el('ul', 'ingredients');
    for (const ingredient of recipe.ingredients) {
      const item = el('li');
      item.append(el('span', 'ingredient-quantity', quantityText(ingredient)), el('span', null, ingredient.name));
      list.append(item);
    }
    ingredientCard.append(list);
  } else {
    ingredientCard.append(el('p', 'muted', 'Keine Zutaten eingetragen.'));
  }
  container.append(ingredientCard);

  // Zubereitung: nummerierte Schritte
  const stepCard = el('section', 'detail-card');
  stepCard.append(el('h3', null, 'Zubereitung'));
  if (recipe.steps.length > 0) {
    const list = el('ol', 'steps');
    for (const step of recipe.steps) list.append(el('li', null, step));
    stepCard.append(list);
  } else {
    stepCard.append(el('p', 'muted', 'Keine Schritte eingetragen.'));
  }
  container.append(stepCard);

  if (isWebLink(recipe.source_url)) {
    const source = el('p', 'source');
    const link = el('a', null, 'Originalrezept öffnen');
    link.href = recipe.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    source.append(link);
    container.append(source);
  }

  const actions = el('div', 'detail-actions');
  const edit = el('a', 'button-primary', 'Bearbeiten');
  edit.href = '#/recipe/' + recipe.id + '/edit';
  const remove = el('button', 'link-button danger', 'Rezept löschen');
  remove.type = 'button';
  remove.addEventListener('click', () => onDelete(recipe));
  actions.append(edit, remove);
  container.append(actions);
}
