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
