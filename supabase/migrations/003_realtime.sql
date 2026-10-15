-- 003: Live-Abgleich (Supabase Realtime) für Rezepte
-- Im Supabase-Dashboard unter "SQL Editor" einmal ausführen.
-- Danach meldet die Datenbank jede Änderung an der Tabelle sofort an die angemeldeten Handys.
-- Die Zugriffsregeln (Row Level Security) gelten auch hier: nur Angemeldete bekommen Änderungen.

alter publication supabase_realtime add table public.recipes;
