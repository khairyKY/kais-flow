-- SCALE — the backend half of "100 users on free tiers". Three independent parts; nothing here
-- changes a row a user can see. Idempotent throughout (production's history has drifted before —
-- see 0038 — so nothing assumes an object exists or doesn't).
--
-- 1 · user_id indexes. Every client read is `select * … ` filtered only by RLS's
--     `user_id = auth.uid()`, and most tables had no index leading with user_id — one user's page
--     load seq-scanned every user's rows. Tables that already have one are left alone:
--     time_entries (0024), journal_entries (0033), app_settings (PK, 0030), integrations,
--     resurfaced_log and ai_usage (unique constraints). embed_queue is never read by the client.
--
-- 2 · Daily housekeeping (`cron-history-prune`): pg_cron keeps a row per job run forever, and the
--     5-minute jobs (embed-drain, task-reminder-sweep) write ~580 a day; embed_queue keeps every
--     `done` row forever. Both only grow the database toward the free tier's 500 MB.
--
-- 3 · Global daily AI cap. Every user shares ONE Groq free-tier key, so per-user caps (0036)
--     alone can't stop 100 users together from exhausting it. `ai_usage_global` counts calls per
--     (Cairo day, kind) across everyone; `ai_usage_take()` bumps the per-user counter (through
--     0036's unchanged `ai_usage_bump`) and, only if the user is within their own limit, the
--     global one — in one call, one transaction. The limits stay in the functions' env
--     (quota.ts); the database only counts.

-- ---------------------------------------------------------------------------------------------
-- 1 · Indexes for the RLS predicate
-- ---------------------------------------------------------------------------------------------
-- tasks: the Tasks/Today/Calendar queries read all of a user's tasks.
create index if not exists tasks_user_id_idx on tasks (user_id);
-- inbox_items: Inbox reads all of a user's captures.
create index if not exists inbox_items_user_id_idx on inbox_items (user_id);
-- activity_log: the biggest table (append-only); every read is newest-first or created_at-ranged.
create index if not exists activity_log_user_id_created_at_idx on activity_log (user_id, created_at);
-- calendar_events: the calendar reads a user's events ordered by starts_at.
create index if not exists calendar_events_user_id_starts_at_idx on calendar_events (user_id, starts_at);
-- routine_completions: read in full for streaks; the only index was on routine_id.
create index if not exists routine_completions_user_id_idx on routine_completions (user_id);
-- The rest are read in full on page load (sidebar, settings, library, people).
create index if not exists domains_user_id_idx on domains (user_id);
create index if not exists projects_user_id_idx on projects (user_id);
create index if not exists areas_user_id_idx on areas (user_id);
create index if not exists routines_user_id_idx on routines (user_id);
create index if not exists push_subscriptions_user_id_idx on push_subscriptions (user_id);
create index if not exists people_user_id_idx on people (user_id);
create index if not exists interactions_user_id_idx on interactions (user_id);
create index if not exists books_user_id_idx on books (user_id);
create index if not exists notes_user_id_idx on notes (user_id);
create index if not exists quotes_user_id_idx on quotes (user_id);
create index if not exists commentary_user_id_idx on commentary (user_id);

-- ---------------------------------------------------------------------------------------------
-- 2 · cron-history-prune (daily, 03:15 UTC — between the 03:00 keep-alive and 03:30 compost)
-- ---------------------------------------------------------------------------------------------
-- job_run_details: a week of history is plenty to debug a failing job.
-- embed_queue: `embed` marks a row 'done' once the embedding is written onto the task/inbox item,
-- so a done row is only a receipt. Only 'done' rows go: 'pending' is still to be drained, 'error'
-- is left for a human to look at. embed_queue has no updated_at, so age is created_at; a row
-- re-enqueued by an edit keeps its old created_at and is flipped back to 'pending', which this
-- never touches — at worst a just-finished receipt goes a day early, and the next edit re-inserts it.
select cron.unschedule('cron-history-prune') where exists (select 1 from cron.job where jobname = 'cron-history-prune');
select cron.schedule(
  'cron-history-prune',
  '15 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days';
    delete from public.embed_queue where status = 'done' and created_at < now() - interval '1 day'$$
);

-- ---------------------------------------------------------------------------------------------
-- 3 · ai_usage_global + ai_usage_take()
-- ---------------------------------------------------------------------------------------------
-- Not a per-user table, so none of the id/user_id columns: one row per (Cairo day, kind).
create table if not exists ai_usage_global (
  day date not null, -- the Africa/Cairo calendar date, same clock as ai_usage
  kind text not null check (kind in ('chat', 'parse', 'stt')),
  count integer not null default 0 check (count >= 0),
  primary key (day, kind)
);
-- RLS on with no policies, and no grants: only the definer function below touches it.
alter table ai_usage_global enable row level security;
revoke all on table ai_usage_global from anon, authenticated;

-- Returns (user_count, global_count) for today in Cairo. user_count comes from 0036's
-- ai_usage_bump, so the per-user counter behaves exactly as before. The global counter moves only
-- when this call is within the user's own limit (p_user_limit, from the function's env): a call
-- the per-user cap rejects never reaches Groq, and must not spend everyone's shared day — or one
-- account hammering past its own cap could lock everybody out. global_count is null then.
-- Same concurrency story as ai_usage_bump: the upsert serializes on the primary key.
create or replace function ai_usage_take(p_user_id uuid, p_kind text, p_user_limit integer)
returns table (user_count integer, global_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  user_count := public.ai_usage_bump(p_user_id, p_kind);
  if user_count <= p_user_limit then
    insert into public.ai_usage_global (day, kind, count)
    values ((now() at time zone 'Africa/Cairo')::date, p_kind, 1)
    on conflict (day, kind) do update set count = ai_usage_global.count + 1
    returning ai_usage_global.count into global_count;
  end if;
  return next;
end;
$$;
revoke execute on function ai_usage_take(uuid, text, integer) from public, anon, authenticated;
grant execute on function ai_usage_take(uuid, text, integer) to service_role;
