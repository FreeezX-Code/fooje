-- 005: Markierung "Zutaten gekauft" im Wochenplan
-- Im Supabase-Dashboard unter "SQL Editor" einmal ausführen.
-- Vorhandene Tage bleiben erhalten und gelten als "nicht gekauft".

alter table public.meal_plan_days
  add column is_purchased boolean not null default false;
