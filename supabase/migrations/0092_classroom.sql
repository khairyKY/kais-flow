-- Migration: 0091_classroom.sql
-- Google Classroom deadlines (Kai 2026-11-03): classroom-sync reads a student's courses, coursework and
-- submission state (read-only scopes) and keeps them as projects and tasks. Every 3 hours via pg_cron.
--
-- What changes: integrations.provider may now be 'classroom' — its own row, its own refresh token, its own
-- consent (never the Calendar grant widened). Nothing else: no new column. Course projects and imported
-- tasks are deduped by external_ref {source:'classroom', id: <course id> | <course id>/<work id>} — 0027's
-- unique indexes on projects and tasks are the backstop.
--
-- Same invocation pattern as google-sync (0074): pg_net POST with the service-role key from Vault;
-- classroom-sync's isServiceRole() accepts it and syncs every user whose integrations row has provider
-- 'classroom' and data->>'status' = 'ok'. Minute 11 of every third hour keeps it off the other jobs' marks.
--
-- Additive and idempotent: drop-if-exists → add the check; unschedule-if-exists → schedule.

alter table integrations drop constraint if exists integrations_provider_check;
alter table integrations add constraint integrations_provider_check check (provider in ('google', 'github', 'classroom'));

select cron.unschedule('classroom-sync') where exists (select 1 from cron.job where jobname = 'classroom-sync');

select cron.schedule(
  'classroom-sync',
  '11 */3 * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/classroom-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('action', 'sync'),
    timeout_milliseconds := 150000
  );
  $$
);
