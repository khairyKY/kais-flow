-- P4: pg_cron schedules calling the `notify` edge function via pg_net.
-- The service-role key used for auth is stored in Supabase Vault as 'service_role_key'
-- (inserted out-of-band, never committed here — see phase notes).
--
-- Cairo offset simplification: Egypt currently runs UTC+2 with no DST, so schedules below are
-- fixed UTC times computed from that offset rather than dynamically read from app_settings.
-- Revisit if Egypt's DST policy changes again or app_settings.digest_hour becomes user-editable.

select cron.schedule(
  'morning-digest',
  '0 6 * * *', -- 06:00 UTC = 08:00 Cairo (digest_hour default)
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
  '0 19 * * *', -- 19:00 UTC = 21:00 Cairo
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

select cron.schedule(
  'overdue-sweep',
  '0 * * * *', -- hourly
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'overdue')
  );
  $$
);
