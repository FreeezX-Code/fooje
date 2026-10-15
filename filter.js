// Suche und Filter für die Rezeptliste. Groß-/Kleinschreibung spielt keine Rolle.

const normalize = (text) => text.toLocaleLowerCase('de');

// Alle vorkommenden Tags, alphabetisch, ohne Doppelte ("Sommer" und "sommer" zählen als eins).
// Gibt [{ value: "sommer", label: "Sommer" }, …] zurück.
export function collectTags(recipes) {
  const tags = new Map();
  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      if (!tags.has(normalize(tag))) tags.set(normalize(tag), tag);
    }
  }
  return [...tags]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

// filter = { query: Suchtext, mainComponent: z. B. "fish" oder null, tags: Set der gewählten Tags }
// Ein Rezept passt, wenn es zur Hauptkomponente passt, ALLE gewählten Tags hat
// und der Suchtext im Namen oder in einer Zutat vorkommt.
export function filterRecipes(recipes, filter) {
  const query = normalize(filter.query.trim());
  return recipes.filter((recipe) => {
    if (filter.mainComponent && recipe.main_component !== filter.mainComponent) return false;

    const recipeTags = recipe.tags.map(normalize);
    for (const tag of filter.tags) {
      if (!recipeTags.includes(tag)) return false;
    }

    if (query === '') return true;
    return (
      normalize(recipe.name).includes(query) ||
      recipe.ingredients.some((ingredient) => normalize(ingredient.name).includes(query))
    );
  });
}

export function isFilterActive(filter) {
  return filter.query.trim() !== '' || filter.mainComponent !== null || filter.tags.size > 0;
}
