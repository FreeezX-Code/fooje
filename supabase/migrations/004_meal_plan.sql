-- 004: Wochenplan und Regeln für den Generator (Stufe 2)
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.
-- Die Rezept-Tabelle bleibt unverändert.

-- ---------- Wochenplan: ein Eintrag pro Kalendertag ----------

create table public.meal_plan_days (
  day        date primary key,

  -- Geplantes Rezept. Wird das Rezept gelöscht, wird der Tag wieder leer.
  recipe_id  uuid references public.recipes (id) on delete set null,

  is_locked  boolean not null default false,  -- Gericht festgehalten: bleibt beim Neu-Würfeln stehen
  is_day_off boolean not null default false,  -- Tag frei: hier wird nichts geplant

  updated_at timestamptz not null default now()
);

-- "geändert am" automatisch setzen (Funktion aus 001_recipes.sql)
create trigger meal_plan_days_set_updated_at
  before update on public.meal_plan_days
  for each row execute function public.set_updated_at();

alter table public.meal_plan_days enable row level security;

create policy "Angemeldete dürfen den Wochenplan lesen"
  on public.meal_plan_days for select to authenticated using (true);

create policy "Angemeldete dürfen Tage eintragen"
  on public.meal_plan_days for insert to authenticated with check (true);

create policy "Angemeldete dürfen Tage ändern"
  on public.meal_plan_days for update to authenticated using (true) with check (true);

create policy "Angemeldete dürfen Tage löschen"
  on public.meal_plan_days for delete to authenticated using (true);

grant select, insert, update, delete on public.meal_plan_days to authenticated;

-- ---------- Regeln für den Generator: genau eine Zeile ----------

create table public.planner_settings (
  id         smallint primary key default 1 check (id = 1),

  -- Regeln als JSON, damit später weitere dazukommen können, ohne die Tabelle umzubauen.
  -- main_components: je Hauptkomponente mindestens/höchstens pro Woche (max null = beliebig)
  rules      jsonb not null default '{
    "main_components": {
      "meat":       { "min": 0, "max": 2 },
      "poultry":    { "min": 0, "max": 2 },
      "fish":       { "min": 1, "max": 2 },
      "vegetarian": { "min": 0, "max": null },
      "vegan":      { "min": 0, "max": null }
    },
    "no_repeat_main_component": true,
    "no_repeat_side_dish": true,
    "avoid_recent_weeks": 2,
    "prefer_favorites": true
  }'::jsonb,

  updated_at timestamptz not null default now()
);

create trigger planner_settings_set_updated_at
  before update on public.planner_settings
  for each row execute function public.set_updated_at();

-- Die eine Zeile mit den Startwerten anlegen
insert into public.planner_settings (id) values (1);

alter table public.planner_settings enable row level security;

create policy "Angemeldete dürfen die Regeln lesen"
  on public.planner_settings for select to authenticated using (true);

create policy "Angemeldete dürfen die Regeln ändern"
  on public.planner_settings for update to authenticated using (true) with check (true);

grant select, update on public.planner_settings to authenticated;

-- ---------- Live-Abgleich für beide Tabellen ----------

alter publication supabase_realtime add table public.meal_plan_days, public.planner_settings;
