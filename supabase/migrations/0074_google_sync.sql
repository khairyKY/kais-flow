-- Migration: 0074_google_sync.sql
-- Google Calendar sync, read-only (parity audit B1 → option a, Kai 2026-10-13): run `google-sync`
-- every 15 minutes for every connected user.
--
-- No new columns. Since 0004 calendar_events already has source ('native' | 'gcal'), gcal_id and
-- gcal_etag; 0027 gave it external_ref and the unique (user_id, source, id) index that dedupes synced
-- events ({source:'gcal', id:'<calendar id>/<event id>', calendar, calendar_id}); integrations already
-- allows provider 'google'. The one addition is an index for the sync's own read (a user's synced rows
-- that end after the window's start).
--
-- Same invocation pattern as github-sync (0042): pg_net POST with the service-role key read from Vault
-- ('service_role_key'); google-sync's isServiceRole() accepts it and syncs every user whose
-- integrations row has provider 'google' and data->>'status' = 'ok'. Minutes 3/18/33/48 keep it off
-- the :00/:05 marks the notify jobs share and github-sync's :07/:37.
--
-- Additive and idempotent: if-not-exists index, unschedule-if-exists → schedule.

create index if not exists calendar_events_gcal_idx on calendar_events (user_id, ends_at) where source = 'gcal';

select cron.unschedule('google-sync') where exists (select 1 from cron.job where jobname = 'google-sync');

select cron.schedule(
  'google-sync',
  '3,18,33,48 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/google-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('action', 'sync'),
    timeout_milliseconds := 150000
  );
  $$
);
