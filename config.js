// Verbindung zu Supabase.
// Der anon key ist bewusst öffentlich: Er erlaubt ohne Anmeldung nichts,
// weil alle Tabellen durch Row Level Security geschützt sind.
// Niemals hier den "service_role"- oder "secret"-Schlüssel eintragen!

export const SUPABASE_URL = 'https://isstlfzqsymrvmjwzqyc.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlzc3RsZnpxc3ltcnZtand6cXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODU3MzYsImV4cCI6MjEwNzY2MTczNn0.gZwmm2WPBQdqrWWfPUDTEo-ZI8814hXukAMzJkmOthk';
