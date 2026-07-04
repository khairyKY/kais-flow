-- Fixes 0006: Egypt is currently observing DST (UTC+3, "Egypt Daylight Time"), not the UTC+2
-- standard-time assumption made when 0006 was written. Confirmed live via `now()` vs. a
-- Cairo-timezone system clock at migration time (2026-07-04). Reschedules to the correct UTC
-- times for the current +3 offset.
--
-- Known limitation (unchanged): still a fixed offset, not dynamically computed from
-- app_settings.timezone. If/when Egypt's DST status flips again, these need re-adjusting by hand
-- (or — better, left for a future phase — a small pg_cron job that re-derives the schedule from
-- a real IANA tz lookup instead of a hardcoded offset).

select cron.unschedule('morning-digest');
select cron.unschedule('evening-nudge');

select cron.schedule(
  'morning-digest',
  '0 5 * * *', -- 05:00 UTC = 08:00 Cairo (UTC+3, current DST)
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'morning_digest')
  );
  $$
);

select cron.schedule(
  'evening-nudge',
  '0 18 * * *', -- 18:00 UTC = 21:00 Cairo (UTC+3, current DST)
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'evening_nudge')
  );
  $$
);
