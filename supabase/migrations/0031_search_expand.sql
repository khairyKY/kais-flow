-- Punch 49: search only ever indexed tasks + inbox_items, so the things people actually lose —
-- a person, an event, a project, a journal line — were unfindable. Widens `search_hybrid`'s FTS
-- branch to people / calendar_events / projects / journal_entries. Body is 0026's verbatim,
-- plus the four new unions and a `deleted_at is null` guard (trashed rows were still matching).
--
-- No new `search_tsv` generated columns / GIN indexes for the four new tables: `to_tsvector` is
-- computed per row inside the query instead. ponytail: one person's corpus is a few thousand
-- rows — a seq scan is sub-millisecond, and this avoids four ALTER TABLEs plus the immutability
-- footguns of a generated column over `facts jsonb`. Upgrade path if it ever gets slow: add
-- `search_tsv` generated columns + GIN indexes exactly as 0008 does for tasks, and swap the
-- inline `to_tsvector(...)` calls for the stored column.
--
-- The vector branch stays tasks + inbox_items: only those two tables have `embedding` columns
-- and embed_queue triggers (0008). The new types are keyword-only until/unless the embed
-- pipeline is widened — which is a separate, bigger change.
--
-- entity_type vocabulary: 'task', 'inbox_item' (unchanged) + 'person', 'calendar_event',
-- 'project', 'journal_entry'. Singular throughout; the client's SearchEntityType mirrors it.

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
    union all
    select 'inbox_item', i.id, left(i.raw_text, 80),
           left(i.raw_text, 200),
           ts_rank(i.search_tsv, q.tsq)
    from inbox_items i, q
    where i.deleted_at is null and i.search_tsv @@ q.tsq
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
    union all
    select 'calendar_event', e.id, e.title,
           null::text,
           ts_rank(to_tsvector('english', e.title), q.tsq)
    from calendar_events e, q
    where e.deleted_at is null and to_tsvector('english', e.title) @@ q.tsq
    union all
    select 'project', pr.id, pr.name,
           left(coalesce(pr.completion_summary, ''), 200),
           ts_rank(to_tsvector('english', pr.name || ' ' || coalesce(pr.completion_summary, '')), q.tsq)
    from projects pr, q
    where to_tsvector('english', pr.name || ' ' || coalesce(pr.completion_summary, '')) @@ q.tsq
    union all
    select 'journal_entry', j.id, left(j.body, 80),
           left(j.body, 200),
           ts_rank(to_tsvector('english', j.body || ' ' || coalesce(j.transcript, '')), q.tsq)
    from journal_entries j, q
    where j.deleted_at is null
      and to_tsvector('english', j.body || ' ' || coalesce(j.transcript, '')) @@ q.tsq
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
    union all
    select 'inbox_item', id, left(raw_text, 80),
           left(raw_text, 200),
           embedding <=> query_embedding
    from inbox_items
    where deleted_at is null and embedding is not null and (embedding <=> query_embedding) < 0.45
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
