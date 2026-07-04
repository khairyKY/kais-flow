-- P5: pg_cron schedules for the embed drain (via pg_net, service-role auth from Vault — same
-- pattern as 0006_notify_cron) and the daily resurfacing pick (pure SQL, no HTTP call needed).

select cron.schedule(
  'embed-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/embed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'daily-resurface',
  '30 3 * * *', -- same slot as keep-alive; well before Cairo morning
  $$select do_resurface();$$
);
