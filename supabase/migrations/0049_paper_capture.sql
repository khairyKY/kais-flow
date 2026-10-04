-- Paper capture v1 (design-export/Paper Capture.dc.html 11a–11n; brainstorm §B): a photo of handwritten
-- notes becomes proposed tasks / events / notes / journal lines, reviewed before anything lands.
--
-- 1 · `captures` — one row per batch of photographed pages. Created by the `capture-image` edge function
--     (service role) when it reads the first page; the app only marks it reviewed (outbox upsert, so the
--     usual owner policy). `items` holds the proposed lines: [{text, type, when, project, confidence,
--     box:[x,y,w,h] 0–1, page}]. Photos live in Storage at `captures/<user_id>/<capture_id>/<n>.jpg`.
-- 2 · Storage bucket `captures`: private, owner-folder RLS, images only, 2 MB (the app resizes to
--     ≤1600px / ~250 KB before upload).
-- 3 · app_settings.capture_keep_photos — Settings → Capture "Keep for 7 days / Delete after reading".
-- 4 · ai_usage / ai_usage_global gain kind 'vision': one count per page read. The per-user daily cap
--     (15 pages, AI_DAILY_LIMIT_VISION) and the all-users one (AI_GLOBAL_LIMIT_VISION) live in the
--     function's env like the other kinds (_shared/quota.ts). The user can't write these rows, so the
--     cap can't be reset by deleting a capture.
-- 5 · pg_cron `capture-photo-sweep` (hourly): asks `capture-image` to delete photos whose
--     `expires_at` has passed through the Storage API (a SQL delete on storage.objects would leave the
--     file behind). 7 days by default; "delete after reading" sets expires_at to the review time.

-- ---------------------------------------------------------------------------------------------
-- 1 · captures
-- ---------------------------------------------------------------------------------------------
create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_paths text[] not null default '{}',
  pages integer not null check (pages between 1 and 5),
  pages_read integer not null default 0 check (pages_read >= 0),
  status text not null default 'queued' check (status in ('queued', 'reading', 'done', 'failed')),
  error text check (error in ('daily_limit', 'rate_limited', 'unreadable', 'upstream')),
  title text,
  items jsonb not null default '[]',
  reviewed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  photos_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table captures enable row level security;
drop policy if exists captures_owner on captures;
create policy captures_owner on captures
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_captures_updated_at on captures;
create trigger set_captures_updated_at before update on captures
  for each row execute function set_updated_at();

create index if not exists captures_user_created_idx on captures (user_id, created_at desc);
-- The sweep's scan: photos still stored, oldest expiry first.
create index if not exists captures_expiry_idx on captures (expires_at) where photos_deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- 2 · Storage: the private `captures` bucket, each user confined to their own folder
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists captures_objects_select on storage.objects;
create policy captures_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists captures_objects_insert on storage.objects;
create policy captures_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
-- A retried upload of the same page (upsert) needs update; the owner may also delete their photos.
drop policy if exists captures_objects_update on storage.objects;
create policy captures_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists captures_objects_delete on storage.objects;
create policy captures_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- 3 · Settings → Capture: keep photos 7 days (default) or delete them once reviewed
-- ---------------------------------------------------------------------------------------------
alter table app_settings add column if not exists capture_keep_photos boolean not null default true;

-- ---------------------------------------------------------------------------------------------
-- 4 · ai_usage kind 'vision' (one per page read)
-- ---------------------------------------------------------------------------------------------
alter table ai_usage drop constraint if exists ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('chat', 'parse', 'stt', 'vision'));
alter table ai_usage_global drop constraint if exists ai_usage_global_kind_check;
alter table ai_usage_global add constraint ai_usage_global_kind_check check (kind in ('chat', 'parse', 'stt', 'vision'));

-- ---------------------------------------------------------------------------------------------
-- 5 · pg_cron: the hourly photo sweep (0042's pattern: Vault service-role key → the function)
-- ---------------------------------------------------------------------------------------------
-- cron.schedule with an existing name replaces that job, so a re-run is harmless.
select cron.schedule(
  'capture-photo-sweep',
  '23 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/capture-image',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('action', 'sweep'),
    timeout_milliseconds := 60000
  );
  $$
);
