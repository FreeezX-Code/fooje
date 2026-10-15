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

// ---- Live-Abgleich (Supabase Realtime) ----

let recipeChannel = null;

// Meldet jede Änderung an den Rezepten (auch die eigenen):
//   onUpsert(rezept) bei neuem oder geändertem Rezept, onDelete(id) bei gelöschtem
export function subscribeToRecipeChanges(onUpsert, onDelete) {
  if (recipeChannel) return;
  recipeChannel = supabase
    .channel('recipe-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, (payload) => {
      if (payload.eventType === 'DELETE') onDelete(payload.old.id);
      else onUpsert(payload.new);
    })
    .subscribe((status, error) => {
      if (error) console.warn('Live-Abgleich:', status, error);
    });
}

export function unsubscribeFromRecipeChanges() {
  if (!recipeChannel) return;
  supabase.removeChannel(recipeChannel);
  recipeChannel = null;
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
