-- Migration: 0042_github_sync_cron.sql
-- P6 step 2: run `github-sync` every 30 minutes for every connected user.
--
-- Same invocation pattern as the notify jobs (0006/0007/0016): pg_net POST with the service-role
-- key read from Vault ('service_role_key'); github-sync's isServiceRole() accepts it and syncs
-- every user whose integrations row has provider 'github' and data->>'status' = 'ok'.
-- Minutes 7 and 37 keep it off the :00/:05 marks the other jobs share.
-- timeout_milliseconds: pg_net's default (5 s) is shorter than a 100-user run; the function's own
-- wall-clock limit (150 s on the free plan) is the real ceiling.
--
-- Idempotent: unschedule-if-exists → schedule (0020/0040 pattern). No schema change — the
-- `integrations` table (0004) already has provider 'github' and a data jsonb.

select cron.unschedule('github-sync') where exists (select 1 from cron.job where jobname = 'github-sync');

select cron.schedule(
  'github-sync',
  '7,37 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/github-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('action', 'sync'),
    timeout_milliseconds := 150000
  );
  $$
);
