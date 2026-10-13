-- Migration: 0065_notice_kinds.sql
-- The three notification kinds Tray and Notifications.dc.html (12h–12k) drew and nobody built until
-- 2026-10-12: Paper capture ready, Birthday, Sync problem. Idempotent — every step can re-run.
--
-- 1. Their switches (Settings → Notifications → Kinds, the 0048 pattern), defaulting as 12i draws
--    them: paper ready on, birthday OFF, sync problem on. All three are silent by default (12k).
--    - paper ready: notify `{kind: 'paper_ready', capture_id}`, called by capture-image when a page is
--      read to the end (Web Push + the history row), and the app's own notice when it finishes there.
--    - birthday: notify `{kind: 'birthday', scheduled: true}` below, 08:00 on each user's clock.
--    - sync problem: this device only (its outbox); the column carries the switch across devices.
alter table app_settings add column if not exists paper_ready_on boolean not null default true;
alter table app_settings add column if not exists birthday_on boolean not null default false;
alter table app_settings add column if not exists sync_problem_on boolean not null default true;

-- 2. Birthdays: every 15 minutes, like the morning digest (0045). notify sends to the users whose own
--    08:00 falls on the tick and who turned Birthday on (notify/birthday.ts). cron.schedule with an
--    existing name replaces that job, so a re-run is harmless.
select cron.schedule(
  'birthday-notice',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'birthday', 'scheduled', true)
  );
  $$
);
