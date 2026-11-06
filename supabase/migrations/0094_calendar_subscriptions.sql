-- Migration: 0094_calendar_subscriptions.sql
-- Calendar subscriptions by link (Kai 2026-11-06): any .ics feed (a prayer-times calendar, a team's, a sports
-- fixture list) on the calendar read-only, the way Google Calendar's "From URL" works — no Google account.
-- `ics-sync` fetches on add, on Refresh, and every 3 hours (pg_cron below).
--
-- 1. calendar_events.source may now be 'ics' (0004's check admitted native | gcal). A subscribed event is one
--    row per occurrence in the window, external_ref {source:'ics', id:'<sub>/<uid>/<recurrence-id>', sub_id, uid,
--    recurrence_id, calendar:<name>, calendar_id:<sub>, url?} — 0027's unique (user_id, source, id) index dedupes
--    them, as it does Google's. remind_min (0077) carries the feed's VALARM when the subscription's switch is on.
--    Never an AI's: chat and the MCP tools leave source 'ics' out, as they do 'gcal'.
--
-- 2. calendar_subscriptions: one row per link. The URL can hold a location or a secret token, so it is PRIVATE:
--    only ics-sync (service role) reads or writes it; the client has SELECT on every column but `url` (column
--    grant) and no INSERT / UPDATE / DELETE at all — adding, renaming, recolouring, refreshing and removing all
--    go through the function. `host` is the link's host name, for display.
--
-- 3. pg_cron `ics-sync` every 3 hours (0074's pattern: pg_net POST with the service-role key from Vault).
--    Minute 21 keeps it off the other jobs' marks.
--
-- Additive and idempotent: every step can re-run.
alter table calendar_events drop constraint if exists calendar_events_source_check;
alter table calendar_events add constraint calendar_events_source_check check (source in ('native', 'gcal', 'ics'));

-- A subscription's rows by their subscription (ics-sync's own read, and Remove).
create index if not exists calendar_events_ics_idx on calendar_events (user_id, (external_ref->>'sub_id')) where source = 'ics';

create table if not exists calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null check (length(url) <= 2048),
  host text not null,
  name text not null check (length(name) between 1 and 200),
  -- "#RRGGBB": the feed's own colour, else a palette C swatch the person picked.
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  -- "Use the feed's reminders": a VALARM becomes the event's remind_min.
  use_alarms boolean not null default true,
  -- the last sync's outcome: 'ok', or 'failing' with `error` a stable code (unreachable · timeout · too_large · not_ics · blocked · http_error …).
  status text check (status in ('ok', 'failing')),
  error text,
  synced_at timestamptz,
  event_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);
alter table calendar_subscriptions enable row level security;
drop policy if exists "calendar_subscriptions_select" on calendar_subscriptions;
create policy "calendar_subscriptions_select" on calendar_subscriptions for select using (user_id = auth.uid());
drop trigger if exists set_calendar_subscriptions_updated_at on calendar_subscriptions;
create trigger set_calendar_subscriptions_updated_at before update on calendar_subscriptions for each row execute function set_updated_at();

revoke all on calendar_subscriptions from anon, authenticated;
grant select (id, user_id, host, name, color, use_alarms, status, error, synced_at, event_count, created_at, updated_at) on calendar_subscriptions to authenticated;

select cron.unschedule('ics-sync') where exists (select 1 from cron.job where jobname = 'ics-sync');

select cron.schedule(
  'ics-sync',
  '21 */3 * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/ics-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('action', 'sync'),
    timeout_milliseconds := 150000
  );
  $$
);
