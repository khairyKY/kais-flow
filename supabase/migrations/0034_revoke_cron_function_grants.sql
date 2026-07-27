-- Punch item 4 (public-safety pass) — found by WA-10 while widening search, 2026-07-27.
--
-- `do_resurface()` (0008) and `reload_retainers()` (0020) are SECURITY DEFINER because
-- pg_cron has no JWT and therefore no `auth.uid()` to satisfy RLS. That is correct and
-- unavoidable for cron work. What was NOT correct: Postgres grants EXECUTE on new functions
-- to `public` by default, and PostgREST exposes every executable function as an RPC. So any
-- signed-in account could `POST /rest/v1/rpc/do_resurface` and run a definer function that
-- loops over EVERY user's rows — cross-tenant writes with one HTTP call.
--
-- This was harmless while Kai was the only account. It stops being harmless the moment a
-- second person signs up, which is exactly what v1.0 is for.
--
-- Both functions are only ever invoked by their pg_cron jobs, which run as the table owner
-- and are unaffected by these revokes. `search_hybrid` is deliberately left alone: it is
-- SECURITY INVOKER, so RLS still filters it per-caller, and the app calls it as the user.
-- The two `enqueue_embed_*` functions return `trigger` and cannot be called over RPC at all.

revoke execute on function do_resurface() from public, anon, authenticated;
revoke execute on function reload_retainers() from public, anon, authenticated;

-- `reload_retainers()` also shipped without a pinned search_path, which lets a caller who can
-- create objects shadow an unqualified name inside a definer function. Pin it to match every
-- other definer function in this schema.
alter function reload_retainers() set search_path = public;
