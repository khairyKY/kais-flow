-- Migration: 0095_review_reminder.sql
-- The weekly review's reminder (v1.6.4 F2). notify's new kind 'weekly_review' sends "Ten quiet minutes to
-- close the week" on the review day (app_settings.review_day, else the first day of the weekend) at
-- review_time (18:00 when none), on the user's clock, unless that week's review is already closed
-- (activity `review.week_closed`, notify/review.ts). This is its switch (Settings -> Notifications ->
-- Kinds -> Weekly review; the 0048 pattern). Idempotent - every step can re-run.
alter table app_settings add column if not exists review_reminder_on boolean not null default true;

-- Every 15 minutes, like the digest and the nudge (0045): a user's reminder is due on the first tick at
-- or after their time. cron.schedule with an existing name replaces that job, so a re-run is harmless.
select cron.schedule(
  'weekly-review-reminder',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'weekly_review', 'scheduled', true)
  );
  $$
);
