// Alles, was mit Supabase zu tun hat, steht in dieser Datei.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Die Anmeldung wird im Browser unter diesem Namen gespeichert, man bleibt also angemeldet.
// (Das ist der Standardname von Supabase, hier nur ausdrücklich festgelegt.)
const SESSION_STORAGE_KEY = 'sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: SESSION_STORAGE_KEY },
});

// Ruft callback(session) beim Start und bei jeder An-/Abmeldung auf.
// session ist null, wenn niemand angemeldet ist – oder wenn die Anmeldung
// gerade nicht erneuert werden konnte, weil keine Verbindung besteht.
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// Ist noch eine Anmeldung gespeichert? Supabase löscht sie beim Abmelden
// oder wenn sie ungültig ist – aber nicht, wenn nur die Verbindung fehlt.
export function hasStoredSession() {
  return localStorage.getItem(SESSION_STORAGE_KEY) !== null;
}

// Aktuelle Anmeldung holen (erneuert sie bei Bedarf, dafür braucht es Verbindung)
export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut({ scope: 'local' });
}

// Alle Rezepte, alphabetisch sortiert
export async function fetchRecipes() {
  const { data, error } = await supabase.from('recipes').select('*').order('name');
  if (error) throw error;
  return data;
}

// Neues Rezept speichern, gibt das gespeicherte Rezept (mit id) zurück
export async function createRecipe(recipe) {
  const { data, error } = await supabase.from('recipes').insert(recipe).select().single();
  if (error) throw error;
  return data;
}

// Vorhandenes Rezept ändern, gibt das geänderte Rezept zurück
export async function updateRecipe(id, recipe) {
  const { data, error } = await supabase.from('recipes').update(recipe).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Mehrere Rezepte auf einmal anlegen (Backup einspielen), gibt die gespeicherten zurück
export async function insertRecipes(list) {
  const { data, error } = await supabase.from('recipes').insert(list).select();
  if (error) throw error;
  return data;
}

export async function deleteRecipe(id) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

// ---- Wochenplan ----

// Alle geplanten Tage von "from" bis "to" (jeweils "JJJJ-MM-TT", einschließlich)
export async function fetchPlanDays(from, to) {
  const { data, error } = await supabase.from('meal_plan_days').select('*').gte('day', from).lte('day', to);
  if (error) throw error;
  return data;
}

// Tage eintragen oder ändern (ein Eintrag pro Tag; vorhandene Tage werden überschrieben).
// Nur die mitgeschickten Spalten werden geändert.
export async function savePlanDays(rows) {
  const { data, error } = await supabase.from('meal_plan_days').upsert(rows, { onConflict: 'day' }).select();
  if (error) throw error;
  return data;
}

// Regeln für den Generator (genau eine Zeile mit id 1)
export async function fetchPlannerRules() {
  const { data, error } = await supabase.from('planner_settings').select('rules').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data?.rules ?? null;
}

export async function savePlannerRules(rules) {
  const { data, error } = await supabase.from('planner_settings').update({ rules }).eq('id', 1).select('rules').single();
  if (error) throw error;
  return data.rules;
}

// ---- Live-Abgleich (Supabase Realtime) ----

let changesChannel = null;

// Meldet jede Änderung (auch die eigenen) an Rezepten, Wochenplan und Regeln:
//   onRecipeUpsert(rezept), onRecipeDelete(id)
//   onPlanUpsert(tag), onPlanDelete(datum)
//   onRulesChange(regeln)
export function subscribeToChanges({ onRecipeUpsert, onRecipeDelete, onPlanUpsert, onPlanDelete, onRulesChange }) {
  if (changesChannel) return;
  changesChannel = supabase
    .channel('app-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, (payload) => {
      if (payload.eventType === 'DELETE') onRecipeDelete(payload.old.id);
      else onRecipeUpsert(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_days' }, (payload) => {
      if (payload.eventType === 'DELETE') onPlanDelete(payload.old.day);
      else onPlanUpsert(payload.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'planner_settings' }, (payload) => {
      onRulesChange(payload.new.rules);
    })
    .subscribe((status, error) => {
      if (error) console.warn('Live-Abgleich:', status, error);
    });
}

export function unsubscribeFromChanges() {
  if (!changesChannel) return;
  supabase.removeChannel(changesChannel);
  changesChannel = null;
}

// ---- Rezeptbilder (Supabase Storage) ----

const IMAGE_BUCKET = 'recipe-images';

// Lädt ein Bild hoch und gibt seinen Pfad zurück (zufälliger Dateiname)
export async function uploadImage(blob) {
  const path = crypto.randomUUID() + '.jpg';
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

// Löschen klappt nicht? Dann bleibt nur eine ungenutzte Datei übrig – kein Grund für eine Fehlermeldung.
export async function deleteImage(path) {
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) console.warn('Bild konnte nicht gelöscht werden:', error);
}

// Der Bildspeicher ist privat. Zum Anzeigen braucht jedes Bild einen
// zeitlich begrenzten Link (hier 7 Tage). Gibt { pfad: link } zurück.
export async function getImageUrls(paths) {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, 7 * 24 * 60 * 60);
  if (error) throw error;
  return Object.fromEntries(data.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
}
