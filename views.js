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
const MAIN_COMPONENT_ICONS = {
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

function placeholder(recipe, className) {
  return el('div', 'recipe-placeholder ' + className, MAIN_COMPONENT_ICONS[recipe.main_component] || '🍽️');
}

// z. B. "30 Min. · Vegetarisch"
function metaLine(recipe) {
  const parts = [];
  if (recipe.prep_time_minutes) parts.push(recipe.prep_time_minutes + ' Min.');
  parts.push(MAIN_COMPONENT_LABELS[recipe.main_component]);
  return parts.join(' · ');
}

// z. B. "200 g Nudeln" oder "etwas Salz"
function ingredientText(ingredient) {
  return [ingredient.amount, ingredient.unit, ingredient.name].filter(Boolean).join(' ');
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('de-DE');
}

// Nur echte Web-Links zulassen
function isWebLink(url) {
  return /^https?:\/\//i.test(url || '');
}

export function renderRecipeList(container, recipes) {
  container.replaceChildren();
  for (const recipe of recipes) {
    const link = el('a', 'recipe-card');
    link.href = '#/recipe/' + recipe.id;

    const text = el('div', 'recipe-card-text');
    text.append(el('span', 'recipe-card-name', recipe.name), el('span', 'recipe-card-meta', metaLine(recipe)));

    link.append(placeholder(recipe, 'recipe-placeholder-small'), text);
    if (recipe.is_favorite) link.append(el('span', 'favorite', '★'));

    const item = el('li');
    item.append(link);
    container.append(item);
  }
}

export function renderRecipeDetail(container, recipe) {
  container.replaceChildren();

  const back = el('a', 'back-link', '‹ Alle Rezepte');
  back.href = '#';
  container.append(back);

  container.append(placeholder(recipe, 'recipe-placeholder-large'));

  const title = el('h2', 'recipe-title', recipe.name);
  if (recipe.is_favorite) title.append(el('span', 'favorite', ' ★'));
  container.append(title);

  // Eckdaten
  const facts = el('dl', 'recipe-facts');
  const addFact = (label, value) => {
    if (!value) return;
    facts.append(el('dt', null, label), el('dd', null, value));
  };
  addFact('Portionen', recipe.servings);
  addFact('Zeit', recipe.prep_time_minutes ? recipe.prep_time_minutes + ' Min.' : null);
  addFact('Hauptkomponente', MAIN_COMPONENT_LABELS[recipe.main_component]);
  addFact('Beilage', SIDE_DISH_LABELS[recipe.side_dish]);
  addFact('Zuletzt gekocht', recipe.last_cooked_on ? formatDate(recipe.last_cooked_on) : null);
  container.append(facts);

  if (recipe.tags.length > 0) {
    const tags = el('ul', 'tags');
    for (const tag of recipe.tags) tags.append(el('li', 'tag', tag));
    container.append(tags);
  }

  container.append(el('h3', null, 'Zutaten'));
  if (recipe.ingredients.length > 0) {
    const list = el('ul', 'ingredients');
    for (const ingredient of recipe.ingredients) list.append(el('li', null, ingredientText(ingredient)));
    container.append(list);
  } else {
    container.append(el('p', 'muted', 'Keine Zutaten eingetragen.'));
  }

  container.append(el('h3', null, 'Zubereitung'));
  if (recipe.steps.length > 0) {
    const list = el('ol', 'steps');
    for (const step of recipe.steps) list.append(el('li', null, step));
    container.append(list);
  } else {
    container.append(el('p', 'muted', 'Keine Schritte eingetragen.'));
  }

  if (isWebLink(recipe.source_url)) {
    const source = el('p', 'source');
    const link = el('a', null, 'Originalrezept öffnen');
    link.href = recipe.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    source.append(link);
    container.append(source);
  }
}
