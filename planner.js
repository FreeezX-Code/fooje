// Wochenplanung: Regeln für den Generator (und ab Schritt 5 der Generator selbst).
import { MAIN_COMPONENT_LABELS } from './views.js';

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
