// Das Formular zum Anlegen und Bearbeiten eines Rezepts:
// Werte hineinschreiben (fillRecipeForm) und wieder auslesen (readRecipeForm).
import { MAIN_COMPONENT_LABELS, SIDE_DISH_LABELS } from './views.js';

const form = document.getElementById('recipe-form');
const formTitle = document.getElementById('form-title');
const ingredientRows = document.getElementById('ingredient-rows');
const stepRows = document.getElementById('step-rows');
const moreDetails = document.getElementById('more-details');

const imagePreview = document.getElementById('image-preview');
const imageInput = document.getElementById('image-input');
const imagePickText = document.getElementById('image-pick-text');
const imageRemove = document.getElementById('image-remove');
const imageError = document.getElementById('image-error');

const field = (name) => form.elements.namedItem(name);

// Bild-Auswahl im Formular:
//   newImage    = neu gewähltes, verkleinertes Bild (noch nicht hochgeladen) oder null
//   removeImage = true, wenn das vorhandene Bild entfernt werden soll
let newImage = null;
let removeImage = false;
let previewObjectUrl = null;
let pendingImage = null; // läuft gerade eine Verkleinerung? (Promise)

const MAX_IMAGE_SIZE = 1200; // längste Seite in Pixeln

// Verkleinert ein Foto auf höchstens MAX_IMAGE_SIZE Pixel und speichert es als JPEG
async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', 0.8);
  });
}

function showPreview(url) {
  imagePreview.hidden = !url;
  if (url) imagePreview.src = url;
  else imagePreview.removeAttribute('src');
  imageRemove.hidden = !url;
  imagePickText.textContent = url ? 'Anderes Foto' : 'Foto hinzufügen';
  imagePickText.parentElement.classList.toggle('has-image', Boolean(url));
}

function releasePreview() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
}

async function prepareImage(file) {
  imageError.textContent = '';
  imagePickText.textContent = 'Foto wird vorbereitet …';
  try {
    newImage = await resizeImage(file);
    removeImage = false;
    releasePreview();
    previewObjectUrl = URL.createObjectURL(newImage);
    showPreview(previewObjectUrl);
  } catch (error) {
    console.error(error);
    showPreview(imagePreview.hidden ? null : imagePreview.src);
    imageError.textContent = 'Dieses Bild kann nicht verwendet werden. Bitte ein anderes Foto wählen.';
  }
}

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  imageInput.value = ''; // damit dasselbe Foto erneut gewählt werden kann
  if (!file) return;
  pendingImage = prepareImage(file).finally(() => {
    pendingImage = null;
  });
});

imageRemove.addEventListener('click', () => {
  newImage = null;
  removeImage = true;
  releasePreview();
  showPreview(null);
});

// Wartet ggf., bis ein gerade gewähltes Foto fertig verkleinert ist
export async function readImageChoice() {
  if (pendingImage) await pendingImage;
  return { newImage, removeImage };
}

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

// Eine Zeile pro Zutat: [Menge mit Einheit] [Zutat] [✕]
// Menge und Einheit stehen zusammen in einem Feld, z. B. "200 g" oder "etwas".
function addIngredientRow(ingredient = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  const quantity = [ingredient.amount, ingredient.unit].filter(Boolean).join(' ');
  row.append(
    textInput('ingredient-quantity', 'Menge', quantity),
    textInput('ingredient-name', 'Zutat', ingredient.name),
    removeButton(row)
  );
  ingredientRows.append(row);
  return row;
}

// "200 g" → Menge "200", Einheit "g"; "1/2 TL" → "1/2", "TL"; "etwas" → "etwas", ""
// Regel: das erste Wort ist die Menge, der Rest die Einheit.
function splitQuantity(text) {
  const [amount = '', ...unit] = text.trim().split(/\s+/);
  return { amount, unit: unit.join(' ') };
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
  addIngredientRow().querySelector('.ingredient-quantity').focus();
});
document.getElementById('add-step').addEventListener('click', () => {
  addStepRow().querySelector('textarea').focus();
});

// recipe = null → leeres Formular für ein neues Rezept
// imageUrl = Link zum vorhandenen Bild (oder null)
export function fillRecipeForm(recipe, imageUrl = null) {
  form.reset();
  formTitle.textContent = recipe ? 'Rezept bearbeiten' : 'Neues Rezept';

  newImage = null;
  removeImage = false;
  releasePreview();
  imageError.textContent = '';
  showPreview(imageUrl);

  field('name').value = recipe?.name ?? '';
  field('main_component').value = recipe?.main_component ?? '';
  field('side_dish').value = recipe?.side_dish ?? 'none';
  field('servings').value = recipe?.servings ?? '';
  field('prep_time_minutes').value = recipe?.prep_time_minutes ?? '';
  field('tags').value = (recipe?.tags ?? []).join(', ');
  field('source_url').value = recipe?.source_url ?? '';
  field('last_cooked_on').value = recipe?.last_cooked_on ?? '';
  field('is_favorite').checked = recipe?.is_favorite ?? false;

  // "Weitere Angaben" aufklappen, wenn dort schon etwas eingetragen ist
  moreDetails.open = Boolean(
    recipe && (recipe.tags.length > 0 || recipe.source_url || recipe.last_cooked_on || recipe.is_favorite)
  );

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
      ...splitQuantity(row.querySelector('.ingredient-quantity').value),
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
