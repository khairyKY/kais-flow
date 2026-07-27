-- Migration: 0032_compost_cron.sql
-- V1 punch 25: make the 30-day compost real.
--
-- Two places in the UI promise it and nothing was doing it:
--   · Inbox → Dismissed: "N dismissed · auto-clears after 30 days" and
--     "dismissed captures rest here, then compost after 30 days ✿"
--   · Trash: the same 30-day compost promise for soft-deleted rows.
-- (`features/inbox/api.ts` documented the gap in `purgeInboxItem`.)
--
-- pg_cron is already enabled in 0001_foundation; job registration follows the
-- unschedule-if-exists → schedule pattern from 0020_projects_perennials so a re-run
-- of this migration is a no-op rather than a duplicate job.

-- Hard-deletes everything past the 30-day grace window, for every user, and returns how
-- many rows it removed (so the job is verifiable by hand: `select compost_expired();`).
-- `security definer` because pg_cron carries no JWT — there is no `auth.uid()` to satisfy
-- the RLS policies, and this sweep is deliberately cross-user housekeeping.
-- Note `deleted_at < cutoff` is already null-safe: `null < x` is null, never true, so rows
-- that were never soft-deleted are untouched.
create or replace function compost_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
  removed integer := 0;
  n integer;
begin
  -- Trash (soft-deleted rows) — the same four tables the Trash page lists.
  delete from tasks where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  delete from calendar_events where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  delete from journal_entries where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  -- Inbox: soft-deleted rows ("Clear now"), plus dismissed captures that were simply
  -- left to compost. `updated_at` is the dismissal stamp — it is what the Dismissed
  -- tab itself renders as "dismissed 3d ago".
  delete from inbox_items
   where deleted_at < cutoff
      or (status = 'dismissed' and updated_at < cutoff);
  get diagnostics n = row_count; removed := removed + n;

  return removed;
end;
$$;

-- A `security definer` function is callable over PostgREST by any signed-in user by
-- default, which would hand every account a cross-tenant delete button. Only the cron
-- job (running as the function owner) needs it.
revoke execute on function compost_expired() from public, anon, authenticated;

select cron.unschedule('compost-expired') where exists (select 1 from cron.job where jobname = 'compost-expired');

-- 03:30 UTC daily — after the 03:00 keep-alive, well clear of the digest/reminder sweeps.
select cron.schedule(
  'compost-expired',
  '30 3 * * *',
  $$select compost_expired()$$
);
