-- Migration: 0045_ritual_reminders.sql
-- Settings › Notifications › Ritual reminders, made real (cleanup, 2026-10-03). The toggle used to
-- live only in the browser and `notify` never read it; the digest went to everyone at 08:00 and
-- the nudge at 21:00 Cairo (0007's fixed UTC schedules, wrong again whenever Egypt's DST flips).
--
-- Per user: the morning digest and the evening nudge each get an on/off and a time. Times are
-- Cairo wall-clock for now — notify/ritual.ts owns the zone in one place, so the per-user-timezone
-- pass swaps in app_settings.timezone there. Defaults = what the fixed cron sent. RLS and the
-- per-user pk are already on app_settings (0003, 0030); the client writes these like any setting.
alter table app_settings
  add column if not exists morning_digest_on boolean not null default true,
  add column if not exists morning_digest_at time not null default '08:00',
  add column if not exists evening_nudge_on boolean not null default true,
  add column if not exists evening_nudge_at time not null default '21:00';

-- The two jobs now tick every 15 minutes with `scheduled: true`; notify sends each user's reminder
-- on the first tick at or after their time (ritualDue). `scheduled` keeps a manual service-role
-- call (the backend test suites) sending regardless of the time, as before.
-- Idempotent: unschedule-if-exists → schedule (0020/0040/0042 pattern).
select cron.unschedule('morning-digest') where exists (select 1 from cron.job where jobname = 'morning-digest');
select cron.unschedule('evening-nudge') where exists (select 1 from cron.job where jobname = 'evening-nudge');

select cron.schedule(
  'morning-digest',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'morning_digest', 'scheduled', true)
  );
  $$
);

select cron.schedule(
  'evening-nudge',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'evening_nudge', 'scheduled', true)
  );
  $$
);
