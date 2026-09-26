-- SEC-2 — follow-ups from the 2026-09-26 security review of the release batch
-- (docs/log/*-sec2-handoff.md). Three independent parts; nothing here touches existing rows.
--
-- 1 · Per-user daily AI allowance (MEDIUM). FIX-0's requireUser() proves only that a caller has
--     an account, and signup is open — so a handful of throwaway accounts could drain the one
--     shared Groq free-tier key for everybody. `ai_usage` counts Groq-backed calls per user, per
--     Cairo day, per kind; `ai_usage_bump()` is the only writer. The chat / transcribe /
--     parse-capture edge functions call it (service-role client) right after requireUser() and
--     answer 429 {"error":"daily_limit"} past the limit, before any Groq call. The limits live in
--     the functions' env (AI_DAILY_LIMIT_CHAT / _PARSE / _STT), not here. `search` is not
--     Groq-backed (Supabase.ai embeddings), so it has no kind.
--

-- ---------------------------------------------------------------------------------------------
-- 1 · ai_usage
-- ---------------------------------------------------------------------------------------------
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null, -- the Africa/Cairo calendar date the calls were made on
  kind text not null check (kind in ('chat', 'parse', 'stt')),
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day, kind)
);
alter table ai_usage enable row level security;
-- Read-own only (so a future Settings line can show "12 of 150 today"). No insert/update/delete
-- policy: with RLS on, users can't write; the table-level revoke below says the same thing twice.
create policy "ai_usage_select_own" on ai_usage for select using (user_id = auth.uid());
revoke all on table ai_usage from anon, authenticated;
grant select on table ai_usage to authenticated;
create trigger set_ai_usage_updated_at before update on ai_usage for each row execute function set_updated_at();

-- Atomically counts one call and returns the new count for (user, today in Cairo, kind). One
-- statement: concurrent calls for the same key serialize on the unique index, so each caller gets
-- a distinct count and none is lost. The caller compares it with its limit; calls past the limit
-- still count (the row records attempts, and a rejected call costs nothing but this upsert).
-- SECURITY DEFINER so it doesn't depend on table grants; callable only by the service role (the
-- edge functions), never by a signed-in user over RPC — or anyone could reset their own counter.
create or replace function ai_usage_bump(p_user_id uuid, p_kind text)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ai_usage (user_id, day, kind, count)
  values (p_user_id, (now() at time zone 'Africa/Cairo')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = ai_usage.count + 1
  returning count;
$$;
revoke execute on function ai_usage_bump(uuid, text) from public, anon, authenticated;
grant execute on function ai_usage_bump(uuid, text) to service_role;

