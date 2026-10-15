-- 002: Speicher für Rezeptbilder (Supabase Storage)
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.

-- Privater Bereich: Bilder sind nur mit Anmeldung abrufbar.
-- Höchstens 5 MB pro Bild (die App verkleinert Fotos vorher auf deutlich weniger).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Zugriffsregeln: nur angemeldete Nutzer, nur in diesem Bereich
create policy "Angemeldete dürfen Rezeptbilder sehen"
  on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images');

create policy "Angemeldete dürfen Rezeptbilder hochladen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images');

create policy "Angemeldete dürfen Rezeptbilder ersetzen"
  on storage.objects for update to authenticated
  using (bucket_id = 'recipe-images')
  with check (bucket_id = 'recipe-images');

create policy "Angemeldete dürfen Rezeptbilder löschen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images');
