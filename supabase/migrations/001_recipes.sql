-- 001: Tabelle für Rezepte
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.

create table public.recipes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) > 0),

  -- Liste von Zutaten, z. B. [{"name": "Salz", "amount": "etwas", "unit": ""}]
  -- amount und unit sind Text, weil auch "etwas" oder "1/2" vorkommen
  ingredients       jsonb not null default '[]'::jsonb,

  -- Liste von Zubereitungsschritten, z. B. ["Wasser aufkochen", "Nudeln hineingeben"]
  steps             jsonb not null default '[]'::jsonb,

  servings          integer check (servings > 0),
  prep_time_minutes integer check (prep_time_minutes >= 0),

  -- Feste Auswahlwerte (englisch gespeichert, in der App deutsch angezeigt)
  main_component    text not null
                    check (main_component in ('meat', 'poultry', 'fish', 'vegetarian', 'vegan')),
  side_dish         text not null default 'none'
                    check (side_dish in ('pasta', 'rice', 'potatoes', 'bread', 'none')),

  tags              text[] not null default '{}',
  image_path        text,      -- Pfad des Bildes in Supabase Storage (kommt in einem späteren Schritt)
  source_url        text,
  is_favorite       boolean not null default false,
  last_cooked_on    date,

  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- "geändert am" automatisch bei jeder Änderung setzen
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Row Level Security: ohne Anmeldung sieht und ändert niemand etwas
alter table public.recipes enable row level security;

create policy "Angemeldete dürfen Rezepte lesen"
  on public.recipes for select to authenticated using (true);

create policy "Angemeldete dürfen Rezepte anlegen"
  on public.recipes for insert to authenticated with check (true);

create policy "Angemeldete dürfen Rezepte ändern"
  on public.recipes for update to authenticated using (true) with check (true);

create policy "Angemeldete dürfen Rezepte löschen"
  on public.recipes for delete to authenticated using (true);

grant select, insert, update, delete on public.recipes to authenticated;
