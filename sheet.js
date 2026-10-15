// Menü, das von unten hereingleitet ("Bottom Sheet").
// openSheet: Auswahl aus mehreren Aktionen. openRecipePicker: Rezept suchen und auswählen.
// Beide geben ein Promise zurück: die Auswahl, oder null bei Abbruch (Tippen daneben, "Abbrechen").
import { MAIN_COMPONENT_LABELS, MAIN_COMPONENT_ICONS } from './views.js';

let closeCurrent = null;

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

// Baut Hintergrund + Menü, zeigt es an und liefert eine Funktion zum Schließen
function showPanel(panel, onClose) {
  closeCurrent?.(null);

  const backdrop = el('div', 'sheet-backdrop');
  backdrop.append(panel);
  document.body.append(backdrop);
  document.body.classList.add('sheet-open');

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    closeCurrent = null;
    window.removeEventListener('hashchange', onHashChange);
    backdrop.classList.add('closing');
    document.body.classList.remove('sheet-open');
    setTimeout(() => backdrop.remove(), 220);
    onClose(result);
  }
  // Wechselt die Ansicht (z. B. Zurück-Geste), Menü schließen
  const onHashChange = () => close(null);
  window.addEventListener('hashchange', onHashChange);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close(null);
  });

  closeCurrent = close;
  return close;
}

function sheetHeader(title, subtitle) {
  const header = el('div', 'sheet-header');
  header.append(el('div', 'sheet-handle'), el('h3', 'sheet-title', title));
  if (subtitle) header.append(el('p', 'sheet-subtitle muted', subtitle));
  return header;
}

/**
 * actions: [{ label: "…", value: "…", danger: true/false }]
 */
export function openSheet({ title, subtitle = '', actions }) {
  return new Promise((resolve) => {
    const panel = el('div', 'sheet');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    const close = showPanel(panel, resolve);

    const list = el('div', 'sheet-actions');
    for (const action of actions) {
      const button = el('button', 'sheet-action' + (action.danger ? ' danger' : ''), action.label);
      button.type = 'button';
      button.addEventListener('click', () => close(action.value));
      list.append(button);
    }
    const cancel = el('button', 'sheet-action sheet-cancel', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => close(null));

    panel.append(sheetHeader(title, subtitle), list, cancel);
  });
}

// Rezept auswählen: Suchfeld + Liste, Antippen wählt aus
export function openRecipePicker({ title, recipes, imageUrls }) {
  return new Promise((resolve) => {
    const panel = el('div', 'sheet sheet-tall');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    const close = showPanel(panel, resolve);

    const search = el('input', 'search-input sheet-search');
    search.type = 'search';
    search.placeholder = 'Rezept suchen';
    search.setAttribute('aria-label', 'Rezept suchen');
    search.autocomplete = 'off';

    const list = el('ul', 'picker-list');
    const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name, 'de'));

    function render() {
      const query = search.value.trim().toLocaleLowerCase('de');
      const matches = sorted.filter((r) => r.name.toLocaleLowerCase('de').includes(query));
      list.replaceChildren();
      if (matches.length === 0) list.append(el('li', 'muted picker-empty', 'Kein passendes Rezept.'));
      for (const recipe of matches) {
        const button = el('button', 'picker-item');
        button.type = 'button';
        const imageUrl = imageUrls[recipe.image_path];
        let thumb;
        if (imageUrl) {
          thumb = el('img', 'picker-thumb recipe-image');
          thumb.src = imageUrl;
          thumb.alt = '';
          thumb.crossOrigin = 'anonymous';
        } else {
          thumb = el('span', 'picker-thumb recipe-placeholder', MAIN_COMPONENT_ICONS[recipe.main_component]);
          thumb.dataset.main = recipe.main_component;
        }
        const text = el('span', 'picker-text');
        text.append(el('span', 'picker-name', recipe.name + (recipe.is_favorite ? ' ★' : '')), el('span', 'picker-meta muted', MAIN_COMPONENT_LABELS[recipe.main_component]));
        button.append(thumb, text);
        button.addEventListener('click', () => close(recipe));
        const item = el('li');
        item.append(button);
        list.append(item);
      }
    }
    search.addEventListener('input', render);
    render();

    const cancel = el('button', 'sheet-action sheet-cancel', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => close(null));

    panel.append(sheetHeader(title), search, list, cancel);
  });
}
