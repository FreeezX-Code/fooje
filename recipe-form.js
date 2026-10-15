// Das Formular zum Anlegen und Bearbeiten eines Rezepts:
// Werte hineinschreiben (fillRecipeForm) und wieder auslesen (readRecipeForm).
import { MAIN_COMPONENT_LABELS, SIDE_DISH_LABELS } from './views.js';

const form = document.getElementById('recipe-form');
const formTitle = document.getElementById('form-title');
const ingredientRows = document.getElementById('ingredient-rows');
const stepRows = document.getElementById('step-rows');

const field = (name) => form.elements.namedItem(name);

// Auswahllisten einmalig füllen
function fillSelect(select, labels) {
  for (const [value, label] of Object.entries(labels)) select.add(new Option(label, value));
}
fillSelect(field('main_component'), MAIN_COMPONENT_LABELS);
fillSelect(field('side_dish'), SIDE_DISH_LABELS);

function textInput(className, placeholder, value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = className;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  input.autocomplete = 'off';
  input.value = value ?? '';
  return input;
}

function removeButton(row) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-remove';
  button.textContent = '✕';
  button.setAttribute('aria-label', 'Entfernen');
  button.addEventListener('click', () => row.remove());
  return button;
}

function addIngredientRow(ingredient = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.append(
    textInput('ingredient-name', 'Zutat', ingredient.name),
    textInput('ingredient-amount', 'Menge', ingredient.amount),
    textInput('ingredient-unit', 'Einheit', ingredient.unit),
    removeButton(row)
  );
  ingredientRows.append(row);
  return row;
}

function addStepRow(text = '') {
  const row = document.createElement('div');
  row.className = 'step-row';
  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.placeholder = 'Was ist zu tun?';
  textarea.setAttribute('aria-label', 'Schritt');
  textarea.value = text;
  row.append(textarea, removeButton(row));
  stepRows.append(row);
  return row;
}

document.getElementById('add-ingredient').addEventListener('click', () => {
  addIngredientRow().querySelector('.ingredient-name').focus();
});
document.getElementById('add-step').addEventListener('click', () => {
  addStepRow().querySelector('textarea').focus();
});

// recipe = null → leeres Formular für ein neues Rezept
export function fillRecipeForm(recipe) {
  form.reset();
  formTitle.textContent = recipe ? 'Rezept bearbeiten' : 'Neues Rezept';

  field('name').value = recipe?.name ?? '';
  field('main_component').value = recipe?.main_component ?? '';
  field('side_dish').value = recipe?.side_dish ?? 'none';
  field('servings').value = recipe?.servings ?? '';
  field('prep_time_minutes').value = recipe?.prep_time_minutes ?? '';
  field('tags').value = (recipe?.tags ?? []).join(', ');
  field('source_url').value = recipe?.source_url ?? '';
  field('last_cooked_on').value = recipe?.last_cooked_on ?? '';
  field('is_favorite').checked = recipe?.is_favorite ?? false;

  ingredientRows.replaceChildren();
  const ingredients = recipe?.ingredients ?? [];
  ingredients.forEach((ingredient) => addIngredientRow(ingredient));
  if (ingredients.length === 0) addIngredientRow();

  stepRows.replaceChildren();
  const steps = recipe?.steps ?? [];
  steps.forEach((step) => addStepRow(step));
  if (steps.length === 0) addStepRow();
}

// Leere Eingabe → null, sonst ganze Zahl
function numberOrNull(value) {
  return value === '' ? null : parseInt(value, 10);
}

function trimOrNull(value) {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Liest das Formular aus. Leere Zutaten- und Schrittzeilen werden ignoriert.
export function readRecipeForm() {
  const ingredients = [...ingredientRows.querySelectorAll('.ingredient-row')]
    .map((row) => ({
      name: row.querySelector('.ingredient-name').value.trim(),
      amount: row.querySelector('.ingredient-amount').value.trim(),
      unit: row.querySelector('.ingredient-unit').value.trim(),
    }))
    .filter((ingredient) => ingredient.name !== '');

  const steps = [...stepRows.querySelectorAll('textarea')]
    .map((textarea) => textarea.value.trim())
    .filter((step) => step !== '');

  // "schnell, Sommer, schnell" → ["schnell", "Sommer"]
  const tags = [...new Set(field('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean))];

  return {
    name: field('name').value.trim(),
    main_component: field('main_component').value,
    side_dish: field('side_dish').value,
    servings: numberOrNull(field('servings').value),
    prep_time_minutes: numberOrNull(field('prep_time_minutes').value),
    ingredients,
    steps,
    tags,
    source_url: trimOrNull(field('source_url').value),
    last_cooked_on: field('last_cooked_on').value || null,
    is_favorite: field('is_favorite').checked,
  };
}
