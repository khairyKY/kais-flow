-- KAI-AUDIT-2026-07-18 F1: search "returns everything" feel — on a small personal corpus the
-- 0.6 cosine-distance gate let weakly-related items into the vector branch; tighten to 0.45.
-- Body copied verbatim from 0008_search.sql `search_hybrid`; only the two thresholds change.
create or replace function search_hybrid(query_text text, query_embedding vector(384), match_limit int default 20)
returns table (entity_type text, entity_id uuid, title text, snippet text, score double precision)
language sql
stable
security invoker
as $$
  with fts_raw as (
    select 'task'::text as entity_type, id as entity_id, title as title,
           left(coalesce(notes, ''), 200) as snippet,
           ts_rank(search_tsv, websearch_to_tsquery('english', query_text)) as rank_val
    from tasks
    where search_tsv @@ websearch_to_tsquery('english', query_text)
    union all
    select 'inbox_item', id, left(raw_text, 80),
           left(raw_text, 200),
           ts_rank(search_tsv, websearch_to_tsquery('english', query_text))
    from inbox_items
    where search_tsv @@ websearch_to_tsquery('english', query_text)
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
    where embedding is not null and (embedding <=> query_embedding) < 0.45
    union all
    select 'inbox_item', id, left(raw_text, 80),
           left(raw_text, 200),
           embedding <=> query_embedding
    from inbox_items
    where embedding is not null and (embedding <=> query_embedding) < 0.45
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
