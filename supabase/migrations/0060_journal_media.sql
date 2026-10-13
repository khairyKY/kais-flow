-- Journal photos (P7a, Kai 2026-10-12: "+ Photo" in the Journal did nothing).
-- A private `journal` bucket, each user confined to their own folder — the same shape as 0049's
-- `captures` policies. Paths are `<user_id>/<entry_id>/<photo_id>.jpg`, listed on the entry in
-- `journal_entries.media_paths` (0021). The app compresses to ~250 KB before upload; 1 MB is the
-- ceiling. Images only. No sweep: a journal photo stays until the user removes it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal', 'journal', false, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists journal_objects_select on storage.objects;
create policy journal_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists journal_objects_insert on storage.objects;
create policy journal_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists journal_objects_update on storage.objects;
create policy journal_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists journal_objects_delete on storage.objects;
create policy journal_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text);
