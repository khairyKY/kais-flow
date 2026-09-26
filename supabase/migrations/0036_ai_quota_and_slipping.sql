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
-- 2 · push_subscriptions.endpoint must be a known Web Push service (LOW, SSRF). The endpoint is
--     user-supplied, and `notify` POSTs to it — so `{kind:'test'}` made the edge runtime POST to
--     any URL a user had stored. notify now skips any endpoint whose host is not FCM, Mozilla
--     autopush, Apple (*.push.apple.com) or WNS (*.notify.windows.com); this constraint is the
--     same rule at write time. NOT VALID: rows stored before this migration are not checked (and
--     can't block it) — notify skips them instead. Every new or updated row is checked.
--
-- 3 · slipping view owner filters (LOW). Every correlated subquery matched activity_log /
--     projects / tasks / areas by entity id alone. Under a user's JWT that is harmless (RLS hides
--     other users' rows), but the service role — notify's morning digest — bypasses RLS, so an
--     activity_log row another account logged against your domain/project/area id counted as a
--     "touch" on it. Same bug class 0035 fixed in do_resurface(). Recreated identically (same
--     columns, same order, same security_invoker) except that each subquery now also requires
--     the joined row to belong to the owner of the domain/project/area being scored.

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

-- ---------------------------------------------------------------------------------------------
-- 2 · push_subscriptions.endpoint: known push services only (mirrors notify/push-endpoint.ts)
-- ---------------------------------------------------------------------------------------------
-- https only, host anchored at both ends (the host must be followed by the path's '/'), so
-- `fcm.googleapis.com.evil.example`, `user@host`, ports, IP literals and plain http all fail.
-- Case-insensitive, as hostnames are (notify's URL parser lowercases them). notify applies the
-- same host rule to the parsed URL; this string check is, if anything, the stricter of the two
-- (it also refuses an explicit `:443` or a missing path, which browsers never produce).
alter table push_subscriptions
  add constraint push_subscriptions_endpoint_known_service check (
    endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+push\.apple\.com|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+notify\.windows\.com)/'
  ) not valid;

-- ---------------------------------------------------------------------------------------------
-- 3 · slipping — 0013's definition with owner filters added, nothing else changed
-- ---------------------------------------------------------------------------------------------
create or replace view slipping with (security_invoker = true) as
with domain_touch as (
  select
    d.id,
    d.name,
    greatest(
      d.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.user_id = d.user_id and al.entity_type = 'domain' and al.entity_id = d.id), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.user_id = d.user_id and al.entity_type = 'project' and al.entity_id in (select id from projects where domain_id = d.id and projects.user_id = d.user_id)), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.user_id = d.user_id and al.entity_type = 'task' and al.entity_id in (select id from tasks where domain_id = d.id and tasks.user_id = d.user_id)), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.user_id = d.user_id and al.entity_type = 'area' and al.entity_id in (select id from areas where domain_id = d.id and areas.user_id = d.user_id)), d.created_at)
    ) as last_touch
  from domains d
),
project_touch as (
  select
    p.id,
    p.name,
    greatest(
      p.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.user_id = p.user_id and al.entity_type = 'project' and al.entity_id = p.id), p.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.user_id = p.user_id and al.entity_type = 'task' and al.entity_id in (select id from tasks where project_id = p.id and tasks.user_id = p.user_id)), p.created_at)
    ) as last_touch
  from projects p
),
area_touch as (
  select
    a.id,
    a.name,
    greatest(
      a.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.user_id = a.user_id and al.entity_type = 'area' and al.entity_id = a.id), a.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.user_id = a.user_id and al.entity_type = 'task' and al.entity_id in (select id from tasks where area_id = a.id and tasks.user_id = a.user_id)), a.created_at)
    ) as last_touch
  from areas a
)
select 'domain'::text as entity_type, id as entity_id, name as entity_name, last_touch,
  extract(epoch from (now() - last_touch)) / 86400 as days_since
from domain_touch
union all
select 'project'::text, id, name, last_touch,
  extract(epoch from (now() - last_touch)) / 86400
from project_touch
union all
select 'area'::text, id, name, last_touch,
  extract(epoch from (now() - last_touch)) / 86400
from area_touch;
