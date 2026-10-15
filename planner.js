// Wochenplanung: Regeln für den Generator und der Generator selbst.
import { MAIN_COMPONENT_LABELS, SIDE_DISH_LABELS } from './views.js';

// Startwerte – gleich wie in supabase/migrations/004_meal_plan.sql.
// max: null = beliebig oft
export const DEFAULT_RULES = {
  main_components: {
    meat: { min: 0, max: 2 },
    poultry: { min: 0, max: 2 },
    fish: { min: 1, max: 2 },
    vegetarian: { min: 0, max: null },
    vegan: { min: 0, max: null },
  },
  no_repeat_main_component: true,
  no_repeat_side_dish: true,
  avoid_recent_weeks: 2,
  prefer_favorites: true,
};

const clampDays = (value) => Math.min(7, Math.max(0, Math.round(value)));

// Gespeicherte Regeln mit den Startwerten ergänzen und auf gültige Werte bringen.
// So funktioniert die App auch, wenn später neue Regeln dazukommen.
export function normalizeRules(raw) {
  const rules = structuredClone(DEFAULT_RULES);
  if (!raw || typeof raw !== 'object') return rules;

  for (const key of Object.keys(rules.main_components)) {
    const saved = raw.main_components?.[key];
    if (!saved) continue;
    if (Number.isFinite(saved.min)) rules.main_components[key].min = clampDays(saved.min);
    rules.main_components[key].max = Number.isFinite(saved.max) ? clampDays(saved.max) : null;
  }
  for (const key of ['no_repeat_main_component', 'no_repeat_side_dish', 'prefer_favorites']) {
    if (typeof raw[key] === 'boolean') rules[key] = raw[key];
  }
  if (Number.isFinite(raw.avoid_recent_weeks)) rules.avoid_recent_weeks = Math.min(4, Math.max(0, Math.round(raw.avoid_recent_weeks)));
  return rules;
}

// Prüft, ob die Regeln zusammenpassen.
// errors: Speichern nicht möglich. warnings: Speichern möglich, aber gut zu wissen.
export function checkRules(rules) {
  const errors = [];
  const warnings = [];
  let minSum = 0;
  let maxSum = 0;
  let allHaveMax = true;

  for (const [key, { min, max }] of Object.entries(rules.main_components)) {
    const label = MAIN_COMPONENT_LABELS[key];
    if (max !== null && min > max) errors.push(`${label}: „mindestens ${min}“ ist mehr als „höchstens ${max}“.`);
    minSum += min;
    if (max === null) allHaveMax = false;
    else maxSum += max;
  }

  if (minSum > 7) errors.push(`Die Mindestwerte ergeben zusammen ${minSum} Tage – eine Woche hat nur 7.`);
  if (allHaveMax && maxSum < 7) {
    warnings.push(`Mit diesen Höchstwerten lassen sich nur ${maxSum} von 7 Tagen füllen. Der Rest bleibt leer.`);
  }
  return { errors, warnings };
}

// ---- Generator ----
//
// Vorgehen: viele zufällige Versuche, die Tage der Reihe nach zu belegen.
// Zuerst müssen alle Regeln streng eingehalten werden. Klappt das nicht, wird eine Regel
// nach der anderen gelockert – gelockert heißt aber nur "darf verletzt werden, wenn es
// nicht anders geht": Verstöße machen ein Rezept weiterhin deutlich unwahrscheinlicher,
// und von allen Versuchen wird der mit den wenigsten Verstößen genommen.

const RELAXATION_ORDER = ['avoid_recent', 'no_repeat_side_dish', 'no_repeat_main_component', 'max', 'min', 'duplicates'];
const ATTEMPTS_PER_LEVEL = 150;

// Wie schwer ein Verstoß wiegt (für die Auswahl des besten Versuchs)
const PROBLEM_WEIGHT = { empty: 100, under_min: 10, over_max: 10, duplicate: 8, repeat_main: 3, repeat_side: 2, recent: 1 };

// Zufällige Auswahl, bei der Rezepte mit höherem Gewicht öfter drankommen
function pickWeighted(candidates, weightOf, random) {
  const weights = candidates.map(weightOf);
  let point = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < candidates.length; i++) {
    point -= weights[i];
    if (point < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// "Dieselbe Beilage hintereinander" – "keine Beilage" zählt nicht als Beilage
const sameSideDish = (a, b) => a.side_dish !== 'none' && a.side_dish === b.side_dish;

/**
 * Plant eine Woche.
 *   days: die 7 Tage ab Montag: [{ day: "2026-10-19", entry: Eintrag aus meal_plan_days oder undefined, fillable: true/false }]
 *         fillable = dieser Tag darf (neu) belegt werden. Andere Tage mit Rezept zählen für die Regeln mit.
 *   recipes: alle Rezepte, rules: normalisierte Regeln
 *   previousDayRecipeId: Rezept am Sonntag davor (für "nicht zweimal hintereinander")
 *   recentRecipeIds: Rezepte aus den letzten Wochen (Set)
 *   random: Zufallsquelle (für Tests austauschbar)
 * Ergebnis: { assignments: { "2026-10-19": rezeptId, … }, notes: ["…", …] }
 */
export function generateWeek({ days, recipes, rules, previousDayRecipeId = null, recentRecipeIds = new Set(), random = Math.random }) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const fixed = days.map(({ entry, fillable }) =>
    !fillable && entry?.recipe_id && !entry.is_day_off ? byId.get(entry.recipe_id) ?? null : null
  );
  const slots = days.map((d, i) => (d.fillable ? i : -1)).filter((i) => i >= 0);
  const previousRecipe = previousDayRecipeId ? byId.get(previousDayRecipeId) ?? null : null;
  const context = { slots, rules, previousRecipe, recentRecipeIds };

  if (slots.length === 0) return { assignments: {}, notes: ['In dieser Woche gibt es keine freien Tage mehr zum Planen.'] };
  if (recipes.length === 0) return { assignments: {}, notes: ['Es gibt noch keine Rezepte zum Planen.'] };

  // Mindestwerte, die mit den vorhandenen Rezepten gar nicht erreichbar sind (z. B. kein Fisch-Rezept),
  // gleich passend herabsetzen – sonst müssten dafür unnötig alle anderen Regeln gelockert werden.
  const fixedIds = new Set(fixed.filter(Boolean).map((r) => r.id));
  const limits = {};
  for (const [k, { min, max }] of Object.entries(rules.main_components)) {
    const reachable = recipes.filter((r) => r.main_component === k).length;
    limits[k] = { min: Math.min(min, reachable), max };
  }

  // Gibt es weniger unbenutzte Rezepte als freie Tage, sind Wiederholungen von Anfang an unvermeidbar
  const unusedCount = recipes.filter((r) => !fixedIds.has(r.id)).length;
  const order = unusedCount < slots.length
    ? ['duplicates', ...RELAXATION_ORDER.filter((rule) => rule !== 'duplicates')]
    : RELAXATION_ORDER;

  // Ein Versuch: Tage der Reihe nach belegen. Gibt den Plan zurück oder null, wenn es nicht aufgeht.
  function attempt(relaxed) {
    const plan = [...fixed];
    const used = new Set(fixedIds);
    const counts = Object.fromEntries(Object.keys(limits).map((k) => [k, 0]));
    for (const r of fixed) if (r) counts[r.main_component]++;

    for (let s = 0; s < slots.length; s++) {
      const i = slots[s];
      const neighbours = [i === 0 ? previousRecipe : plan[i - 1], plan[i + 1]].filter(Boolean);

      const isDuplicate = (r) => used.has(r.id);
      const isRecent = (r) => recentRecipeIds.has(r.id);
      const exceedsMax = (r) => limits[r.main_component].max !== null && counts[r.main_component] >= limits[r.main_component].max;
      const repeatsMain = (r) => rules.no_repeat_main_component && neighbours.some((n) => n.main_component === r.main_component);
      const repeatsSide = (r) => rules.no_repeat_side_dish && neighbours.some((n) => sameSideDish(n, r));

      // Nicht gelockerte Regeln sind streng
      let candidates = recipes.filter((r) =>
        (relaxed.has('duplicates') || !isDuplicate(r)) &&
        (relaxed.has('avoid_recent') || !isRecent(r)) &&
        (relaxed.has('max') || !exceedsMax(r)) &&
        (relaxed.has('no_repeat_main_component') || !repeatsMain(r)) &&
        (relaxed.has('no_repeat_side_dish') || !repeatsSide(r))
      );

      // Werden die übrigen Tage für die Mindestwerte gebraucht, nur noch passende Rezepte nehmen
      if (!relaxed.has('min')) {
        const need = Object.entries(limits).reduce((sum, [k, { min }]) => sum + Math.max(0, min - counts[k]), 0);
        if (need >= slots.length - s) candidates = candidates.filter((r) => counts[r.main_component] < limits[r.main_component].min);
      }
      if (candidates.length === 0) return null;

      // Gelockerte Regeln: Verstöße möglich, aber deutlich unwahrscheinlicher
      const weightOf = (r) =>
        (rules.prefer_favorites && r.is_favorite ? 3 : 1) *
        (isDuplicate(r) ? 0.02 : 1) *
        (exceedsMax(r) ? 0.05 : 1) *
        (repeatsMain(r) ? 0.1 : 1) *
        (repeatsSide(r) ? 0.2 : 1) *
        (isRecent(r) ? 0.2 : 1);

      const recipe = pickWeighted(candidates, weightOf, random);
      plan[i] = recipe;
      used.add(recipe.id);
      counts[recipe.main_component]++;
    }

    if (!relaxed.has('min') && Object.entries(limits).some(([k, { min }]) => counts[k] < min)) return null;
    return plan;
  }

  const score = (plan) => findProblems(plan, context).reduce((sum, p) => sum + PROBLEM_WEIGHT[p.type] * (p.amount ?? 1), 0);

  // Stufe 0: erster Versuch, der alle Regeln einhält. Ab Stufe 1: bester von allen Versuchen.
  let best = null;
  let bestScore = Infinity;
  for (let level = 0; level <= order.length && !best; level++) {
    const relaxed = new Set(order.slice(0, level));
    for (let n = 0; n < ATTEMPTS_PER_LEVEL; n++) {
      const plan = attempt(relaxed);
      if (!plan) continue;
      const planScore = level === 0 ? 0 : score(plan);
      if (planScore < bestScore) {
        best = plan;
        bestScore = planScore;
      }
      if (level === 0 || planScore === 0) break;
    }
  }

  const assignments = {};
  for (const i of slots) if (best[i]) assignments[days[i].day] = best[i].id;
  return { assignments, notes: describeProblems(findProblems(best, context), rules) };
}

// Prüft einen fertigen Plan gegen die (ursprünglichen) Regeln. Gibt eine Liste von Verstößen zurück.
function findProblems(plan, { slots, rules, previousRecipe, recentRecipeIds }) {
  const problems = [];
  const isNew = (i) => slots.includes(i);

  for (const i of slots) {
    if (!plan[i]) problems.push({ type: 'empty' });
    else if (rules.avoid_recent_weeks > 0 && recentRecipeIds.has(plan[i].id)) problems.push({ type: 'recent', recipe: plan[i] });
  }

  for (let i = 0; i < plan.length; i++) {
    const before = i === 0 ? previousRecipe : plan[i - 1];
    if (!plan[i] || !before || !(isNew(i) || isNew(i - 1))) continue;
    if (rules.no_repeat_main_component && before.main_component === plan[i].main_component) {
      problems.push({ type: 'repeat_main', key: plan[i].main_component });
    }
    if (rules.no_repeat_side_dish && sameSideDish(before, plan[i])) problems.push({ type: 'repeat_side', key: plan[i].side_dish });
  }

  const counts = {};
  for (const r of plan) if (r) counts[r.main_component] = (counts[r.main_component] ?? 0) + 1;
  for (const [k, { min, max }] of Object.entries(rules.main_components)) {
    const count = counts[k] ?? 0;
    if (max !== null && count > max) problems.push({ type: 'over_max', key: k, count, limit: max, amount: count - max });
    if (count < min) problems.push({ type: 'under_min', key: k, count, limit: min, amount: min - count });
  }

  const seen = new Map();
  for (const r of plan) if (r) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  for (const [id, n] of seen) {
    if (n > 1) problems.push({ type: 'duplicate', recipe: plan.find((r) => r?.id === id), amount: n - 1 });
  }
  return problems;
}

// Verstöße in verständliche Hinweise übersetzen
function describeProblems(problems, rules) {
  const notes = [];
  const of = (type) => problems.filter((p) => p.type === type);
  const names = (list) => {
    const quoted = [...new Set(list.map((p) => `„${p.recipe.name}“`))];
    return quoted.length <= 3 ? quoted.join(', ') : `${quoted.slice(0, 3).join(', ')} und ${quoted.length - 3} weitere`;
  };

  if (of('recent').length > 0) {
    const weeks = rules.avoid_recent_weeks === 1 ? 'in der letzten Woche' : `in den letzten ${rules.avoid_recent_weeks} Wochen`;
    notes.push(`${names(of('recent'))} gab es schon ${weeks} – es gibt nicht genug andere passende Rezepte.`);
  }
  for (const key of new Set(of('repeat_main').map((p) => p.key))) notes.push(`Zweimal hintereinander ${MAIN_COMPONENT_LABELS[key]}.`);
  for (const key of new Set(of('repeat_side').map((p) => p.key))) notes.push(`Zweimal hintereinander ${SIDE_DISH_LABELS[key]} als Beilage.`);
  for (const p of of('over_max')) notes.push(`${MAIN_COMPONENT_LABELS[p.key]} kommt ${p.count}× vor (höchstens ${p.limit}×).`);
  for (const p of of('under_min')) {
    notes.push(`${MAIN_COMPONENT_LABELS[p.key]} kommt nur ${p.count}× vor (mindestens ${p.limit}×) – es gibt nicht genug passende Rezepte.`);
  }
  if (of('duplicate').length > 0) {
    const verb = new Set(of('duplicate').map((p) => p.recipe.id)).size === 1 ? 'kommt' : 'kommen';
    notes.push(`${names(of('duplicate'))} ${verb} mehrmals vor – es gibt zu wenige Rezepte.`);
  }
  const empty = of('empty').length;
  if (empty > 0) notes.push(empty === 1 ? '1 Tag konnte nicht belegt werden.' : `${empty} Tage konnten nicht belegt werden.`);
  return notes;
}
