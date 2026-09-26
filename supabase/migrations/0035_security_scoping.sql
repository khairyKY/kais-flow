-- FIX-0 — security audit 2026-08-01 (docs/SECURITY-AUDIT-2026-08-01.md), findings S4 and S6.
--
-- S4 · do_resurface() selected across all tenants (MEDIUM). 0008's version picked ONE user —
-- `select id from auth.users order by created_at limit 1`, i.e. the oldest account — and then
-- drew candidates from EVERY user's tasks/inbox_items (it is SECURITY DEFINER, so RLS never
-- applied), with unscoped resurfaced_log checks. Effects: the nightly cron could log another
-- user's entity_id into the oldest user's resurfaced_log, and every other account never got a
-- resurface at all. The 0034 revoke closed the RPC path; this is the cron path (0009,
-- `daily-resurface`, 03:30 UTC), which runs regardless.
-- Now: loop over every user; each user's pick is drawn only from their own tasks/inbox_items,
-- de-duplicated and boosted only against their own resurfaced_log, and weighted only by their
-- own activity_log rows (a row another account logs against your entity id no longer counts).
-- Kai's K-f ruling (2026-09-26): approved, knowing it changes which item resurfaces.
-- The weighting itself (days since last touch, +20 for 'review_later', 14-day exclusion,
-- 3-day minimum age) is unchanged. `on conflict do nothing`: with one user, a same-day row
-- racing in just failed that one run; with many, it would roll back everyone's pick.
--
-- S6 · search_hybrid was safe only because it is SECURITY INVOKER (LOW, defence in depth).
-- Its body had no user_id predicate anywhere; isolation came 100% from RLS. Same signature,
-- still SECURITY INVOKER, body identical to 0031 except for a redundant
-- `<alias>.user_id = auth.uid()` on every branch — the RLS predicate restated, so the planner
-- folds it at no cost, and a future switch to SECURITY DEFINER can't turn it into a six-table
-- cross-tenant dump.

create or replace function do_resurface() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  for v_user_id in select id from auth.users order by created_at loop
    if exists (select 1 from resurfaced_log where user_id = v_user_id and shown_on = current_date) then
      continue;
    end if;

    v_entity_type := null;
    v_entity_id := null;

    select entity_type, entity_id into v_entity_type, v_entity_id
    from (
      select
        raw.entity_type,
        raw.entity_id,
        greatest(
          extract(epoch from (now() - coalesce(
            (select max(al.created_at) from activity_log al
             where al.user_id = v_user_id
               and al.entity_type = raw.entity_type and al.entity_id = raw.entity_id),
            raw.created_at
          ))) / 86400,
          1
        )
        + case when exists (
            select 1 from resurfaced_log rl
            where rl.user_id = v_user_id
              and rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id and rl.action = 'review_later'
          ) then 20 else 0 end as weight
      from (
        select 'task'::text as entity_type, id as entity_id, created_at from tasks
        where user_id = v_user_id and created_at < now() - interval '3 days'
        union all
        select 'inbox_item', id, created_at from inbox_items
        where user_id = v_user_id and created_at < now() - interval '3 days'
      ) raw
      where not exists (
        select 1 from resurfaced_log rl
        where rl.user_id = v_user_id
          and rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id and rl.shown_on > current_date - 14
      )
    ) candidates
    order by power(random(), 1.0 / weight) desc
    limit 1;

    if v_entity_type is not null then
      insert into resurfaced_log (user_id, entity_type, entity_id, shown_on)
      values (v_user_id, v_entity_type, v_entity_id, current_date)
      on conflict (user_id, shown_on) do nothing;
    end if;
  end loop;
end;
$$;

-- Re-stated from 0034. CREATE OR REPLACE keeps existing grants today, but it resets every
-- attribute the statement doesn't name — restating the revoke keeps this migration correct on
-- its own if it is ever re-run or read in isolation.
revoke execute on function do_resurface() from public, anon, authenticated;

create or replace function search_hybrid(query_text text, query_embedding vector(384), match_limit int default 20)
returns table (entity_type text, entity_id uuid, title text, snippet text, score double precision)
language sql
stable
security invoker
as $$
  with q as (
    select websearch_to_tsquery('english', query_text) as tsq
  ),
  fts_raw as (
    select 'task'::text as entity_type, t.id as entity_id, t.title as title,
           left(coalesce(t.notes, ''), 200) as snippet,
           ts_rank(t.search_tsv, q.tsq) as rank_val
    from tasks t, q
    where t.deleted_at is null and t.search_tsv @@ q.tsq
      and t.user_id = auth.uid()
    union all
    select 'inbox_item', i.id, left(i.raw_text, 80),
           left(i.raw_text, 200),
           ts_rank(i.search_tsv, q.tsq)
    from inbox_items i, q
    where i.deleted_at is null and i.search_tsv @@ q.tsq
      and i.user_id = auth.uid()
    union all
    -- People: name + every fact label/value, so "climbing plan" finds Tarek, not just "Tarek".
    select 'person', p.id, p.name,
           left(coalesce(fx.txt, ''), 200),
           ts_rank(to_tsvector('english', p.name || ' ' || coalesce(fx.txt, '')), q.tsq)
    from people p, q,
         -- jsonb_array_elements throws on a non-array; one malformed row must not take the whole
         -- of search down with it, so anything that isn't an array contributes no fact text.
         lateral (
           select string_agg(coalesce(f ->> 'label', '') || ' ' || coalesce(f ->> 'value', ''), ' · ') as txt
           from jsonb_array_elements(case when jsonb_typeof(p.facts) = 'array' then p.facts else '[]'::jsonb end) f
         ) fx
    where to_tsvector('english', p.name || ' ' || coalesce(fx.txt, '')) @@ q.tsq
      and p.user_id = auth.uid()
    union all
    select 'calendar_event', e.id, e.title,
           null::text,
           ts_rank(to_tsvector('english', e.title), q.tsq)
    from calendar_events e, q
    where e.deleted_at is null and to_tsvector('english', e.title) @@ q.tsq
      and e.user_id = auth.uid()
    union all
    select 'project', pr.id, pr.name,
           left(coalesce(pr.completion_summary, ''), 200),
           ts_rank(to_tsvector('english', pr.name || ' ' || coalesce(pr.completion_summary, '')), q.tsq)
    from projects pr, q
    where to_tsvector('english', pr.name || ' ' || coalesce(pr.completion_summary, '')) @@ q.tsq
      and pr.user_id = auth.uid()
    union all
    select 'journal_entry', j.id, left(j.body, 80),
           left(j.body, 200),
           ts_rank(to_tsvector('english', j.body || ' ' || coalesce(j.transcript, '')), q.tsq)
    from journal_entries j, q
    where j.deleted_at is null
      and to_tsvector('english', j.body || ' ' || coalesce(j.transcript, '')) @@ q.tsq
      and j.user_id = auth.uid()
  ),
  fts_ranked as (
    select entity_type, entity_id, title, snippet,
           row_number() over (order by rank_val desc) as rnk
    from fts_raw
    order by rank_val desc
    limit 40
  ),
  vec_raw as (
    select 'task'::text as entity_type, id as entity_id, title as title,
           left(coalesce(notes, ''), 200) as snippet,
           embedding <=> query_embedding as dist
    from tasks
    where deleted_at is null and embedding is not null and (embedding <=> query_embedding) < 0.45
      and user_id = auth.uid()
    union all
    select 'inbox_item', id, left(raw_text, 80),
           left(raw_text, 200),
           embedding <=> query_embedding
    from inbox_items
    where deleted_at is null and embedding is not null and (embedding <=> query_embedding) < 0.45
      and user_id = auth.uid()
  ),
  vec_ranked as (
    select entity_type, entity_id, title, snippet,
           row_number() over (order by dist asc) as rnk
    from vec_raw
    order by dist asc
    limit 40
  ),
  merged as (
    select entity_type, entity_id, title, snippet, 1.0 / (60 + rnk) as score from fts_ranked
    union all
    select entity_type, entity_id, title, snippet, 1.0 / (60 + rnk) as score from vec_ranked
  )
  select entity_type, entity_id, max(title) as title, max(snippet) as snippet, sum(score) as score
  from merged
  group by entity_type, entity_id
  order by score desc
  limit match_limit;
$$;
