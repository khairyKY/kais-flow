-- P6 step 7: capture from anywhere. A personal capture key lets a bookmarklet, a phone shortcut,
-- curl or an automation tool POST text into the user's Inbox through the `capture` function,
-- without a session. The key itself is shown once in Settings and never stored: only its SHA-256.
-- One key per user; "new key" replaces the hash, "turn off" deletes the row.
create table if not exists capture_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table capture_keys enable row level security;
drop policy if exists capture_keys_owner on capture_keys;
create policy capture_keys_owner on capture_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_capture_keys_updated_at on capture_keys;
create trigger set_capture_keys_updated_at before update on capture_keys
  for each row execute function set_updated_at();
