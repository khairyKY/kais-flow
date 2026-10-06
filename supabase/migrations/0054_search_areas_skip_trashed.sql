-- Kai 2026-10-06: "I type 'remanage' and it brought an entry, but when I clicked it, it wasn't there
-- or it didn't take me to it." Two of the causes were here (the rest were the app's result → page
-- mapping, fixed in app/src/features/search/api.ts searchDestination):
--
-- 1 · Trashed projects were still found. 0044 gave projects a deleted_at after 0037 was written,
--     so a project in Trash came back as a hit and opened /projects/<id> — a page that, rightly,
--     doesn't show trashed projects ("Entity not found"). Both arms that read projects now skip
--     trashed rows, as every other arm already did for its own table.
-- 2 · Areas weren't searched at all — an area named like the query never came up, only things
--     filed in it. They now join the FTS and lexical arms as entity_type 'area' (title = name,
--     snippet = description; trashed ones skipped), opening their page (/projects/<id>, which
--     draws an area from the same id).
--
-- Otherwise 0037's body verbatim: same signature, SECURITY INVOKER, `user_id = auth.uid()` on
-- every branch, same RRF weights and lexical tiers. `create or replace` keeps the grants.
-- The chat function reads the same RPC; its citations open through the same mapping.

create or replace function search_hybrid(query_text text, query_embedding vector(384), match_limit int default 20)
returns table (entity_type text, entity_id uuid, title text, snippet text, score double precision)
language sql
stable
security invoker
as $$
  with q as (
    select websearch_to_tsquery('english', query_text) as tsq
  ),
  -- One row for a query of one or two words, none otherwise (which empties lex_hits). Whitespace
  -- is collapsed, then LIKE's \ % _ are escaped (E'' strings: independent of
  -- standard_conforming_strings).
  lq as (
    select n.phrase,
           replace(replace(replace(n.phrase, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') as phrase_pat,
           array(select replace(replace(replace(w, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
                 from unnest(string_to_array(n.phrase, ' ')) as w) as word_pats
    from (select btrim(regexp_replace(lower(query_text), '[[:space:]]+', ' ', 'g')) as phrase) n
    where n.phrase <> ''
      and cardinality(string_to_array(n.phrase, ' ')) <= 2
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
      and pr.deleted_at is null
    union all
    select 'area', ar.id, ar.name,
           left(coalesce(ar.description, ''), 200),
           ts_rank(to_tsvector('english', ar.name || ' ' || coalesce(ar.description, '')), q.tsq)
    from areas ar, q
    where to_tsvector('english', ar.name || ' ' || coalesce(ar.description, '')) @@ q.tsq
      and ar.user_id = auth.uid()
      and ar.deleted_at is null
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
    where deleted_at is null and embedding is not null and (embedding <=> query_embedding) < 0.35
      and user_id = auth.uid()
    union all
    select 'inbox_item', id, left(raw_text, 80),
           left(raw_text, 200),
           embedding <=> query_embedding
    from inbox_items
    where deleted_at is null and embedding is not null and (embedding <=> query_embedding) < 0.35
      and user_id = auth.uid()
  ),
  vec_ranked as (
    select entity_type, entity_id, title, snippet,
           row_number() over (order by dist asc) as rnk
    from vec_raw
    order by dist asc
    limit 12
  ),
  -- Same entity_type / title / snippet expressions as fts_raw, so a row found by both arms merges.
  lex_raw as (
    select 'task'::text as entity_type, t.id as entity_id, t.title as title,
           left(coalesce(t.notes, ''), 200) as snippet
    from tasks t, lq
    where t.deleted_at is null
      and t.user_id = auth.uid()
    union all
    select 'inbox_item', i.id, left(i.raw_text, 80),
           left(i.raw_text, 200)
    from inbox_items i, lq
    where i.deleted_at is null
      and i.user_id = auth.uid()
    union all
    select 'person', p.id, p.name,
           left(coalesce(fx.txt, ''), 200)
    from people p, lq,
         lateral (
           select string_agg(coalesce(f ->> 'label', '') || ' ' || coalesce(f ->> 'value', ''), ' · ') as txt
           from jsonb_array_elements(case when jsonb_typeof(p.facts) = 'array' then p.facts else '[]'::jsonb end) f
         ) fx
    where p.user_id = auth.uid()
    union all
    select 'calendar_event', e.id, e.title,
           null::text
    from calendar_events e, lq
    where e.deleted_at is null
      and e.user_id = auth.uid()
    union all
    select 'project', pr.id, pr.name,
           left(coalesce(pr.completion_summary, ''), 200)
    from projects pr, lq
    where pr.user_id = auth.uid()
      and pr.deleted_at is null
    union all
    select 'area', ar.id, ar.name,
           left(coalesce(ar.description, ''), 200)
    from areas ar, lq
    where ar.user_id = auth.uid()
      and ar.deleted_at is null
    union all
    select 'journal_entry', j.id, left(j.body, 80),
           left(j.body, 200)
    from journal_entries j, lq
    where j.deleted_at is null
      and j.user_id = auth.uid()
  ),
  lex_hits as (
    select r.entity_type, r.entity_id, r.title, r.snippet,
           case
             when lower(btrim(r.title)) = lq.phrase then 3
             when r.title ilike lq.phrase_pat || '%' or r.title ilike '% ' || lq.phrase_pat || '%' then 2
             else 1
           end as tier
    from lex_raw r, lq
    where (select bool_and(r.title ilike '%' || wp || '%') from unnest(lq.word_pats) as wp)
  ),
  merged as (
    select entity_type, entity_id, title, snippet, 1.0 / (60 + rnk) as score, 0 as tier from fts_ranked
    union all
    select entity_type, entity_id, title, snippet, 0.5 / (60 + rnk) as score, 0 as tier from vec_ranked
    union all
    select entity_type, entity_id, title, snippet, 0 as score, tier from lex_hits
  )
  select entity_type, entity_id, max(title) as title, max(snippet) as snippet, max(tier) + sum(score) as score
  from merged
  group by entity_type, entity_id
  order by score desc, char_length(max(title)), entity_id
  limit match_limit;
$$;
