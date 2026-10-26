-- Migration: 0087_synced_prefs.sql
-- Settings follow the person (Kai 2026-10-26: "the settings should always be the same for both the phone
-- version and desktop"). The appearance, clock, calendar view, sound, "Not now", focus and ritual-pin
-- choices lived in each device's localStorage; they still do (instant, before first paint, offline), and
-- now each is mirrored here as { "<key>": { "v": "<the stored string>", "at": "<ISO time of the change>" } }
-- (app/src/lib/prefs.ts names the keys). Additive and idempotent — every step can re-run.
alter table app_settings add column if not exists prefs jsonb not null default '{}'::jsonb;

-- The newest change wins, per key. The app writes the whole row, so a device holding an older copy of the
-- map must not take back a newer value another device sent: on update, each key keeps whichever of the
-- old and the incoming entries has the later `at` (a tie takes the incoming one). Keys are never removed.
create or replace function merge_app_settings_prefs() returns trigger
language plpgsql as $$
begin
  if new.prefs is distinct from old.prefs then
    new.prefs := (
      select coalesce(jsonb_object_agg(k, case
        when n is null then o
        when o is null then n
        when coalesce(n->>'at', '') >= coalesce(o->>'at', '') then n
        else o
      end), '{}'::jsonb)
      from (
        select key as k from jsonb_object_keys(coalesce(old.prefs, '{}'::jsonb)) as key
        union
        select key from jsonb_object_keys(coalesce(new.prefs, '{}'::jsonb)) as key
      ) keys
      cross join lateral (select old.prefs -> k as o, new.prefs -> k as n) pair
    );
  end if;
  return new;
end $$;

drop trigger if exists merge_app_settings_prefs on app_settings;
create trigger merge_app_settings_prefs before update on app_settings
  for each row execute function merge_app_settings_prefs();

-- A change on one device reaches the others while they're open (lib/realtime.ts), not only on their next
-- refetch — every app_settings column, not just prefs.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings') then
    alter publication supabase_realtime add table app_settings;
  end if;
end $$;
