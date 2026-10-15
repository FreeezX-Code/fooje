// Alles, was mit Supabase zu tun hat, steht in dieser Datei.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Die Anmeldung wird im Browser gespeichert, man bleibt also angemeldet.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ruft callback(session) beim Start und bei jeder An-/Abmeldung auf.
// session ist null, wenn niemand angemeldet ist.
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => callback(session));
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

export async function deleteRecipe(id) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
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
