-- FIX-5 · J-7 (design-integration/JUDGING-SESSION-2.md): "search returns everything — the semantic
-- half drowns the literal one". Kai searched `judge` and got loose neighbours ("rigorous ejection
-- modal…") instead of the task he had captured seconds earlier.
--
-- Mechanism: search_hybrid fuses an FTS arm and a vector arm with reciprocal-rank fusion at EQUAL
-- weight. A short query's gte-small embedding sits close to much of a small corpus, so the vector
-- arm filled all 40 of its slots and those loose neighbours scored exactly like real FTS hits
-- (vector rank 1 = FTS rank 1 = 1/61). A just-captured row has no embedding yet (embed_queue
-- drains every 5 min), so it could only ever win on FTS, and a half-typed word ("jud") matched
-- nothing lexically at all.
--
-- Same signature, still SECURITY INVOKER, and still `user_id = auth.uid()` on every branch
-- (0035's defence in depth, now on the new branch too). The FTS arm is 0035's verbatim. Only
-- these change:
--
-- 1 · Vector threshold: cosine distance < 0.45 → < 0.35. pgvector's `<=>` is cosine DISTANCE
--     = 1 − cosine similarity. 0008 admitted distance < 0.6 (similarity > 0.40); 0026 tightened
--     that to < 0.45 (similarity > 0.55). J-7 / FIX-PLAN say "tighten ... 0.6 → ~0.35", written
--     against 0008's `< 0.6`, i.e. in the same distance units. So: distance < 0.35, which is
--     similarity > 0.65. (Reading 0.35 as a similarity would mean distance < 0.65, looser than
--     the 0.6 J-7 names as the cause.)
-- 2 · Vector arm capped at 12 candidates (was 40).
-- 3 · FTS weighted above vector in the RRF merge: FTS 1.0/(60+rank), vector 0.5/(60+rank). The
--     FTS arm keeps its cap of 40, so its weakest hit scores 1/100 = 0.0100, and the best
--     vector-only hit scores 0.5/61 ≈ 0.0082. Every FTS hit therefore outranks every
--     vector-only hit. A row found by both still gets both, so the vector arm still reorders
--     FTS hits and still finds things with no shared words.
-- 4 · Lexical guarantee for short queries (1–2 words). Every row whose title contains each query
--     word (ILIKE, with the query's \ % _ escaped so they match literally) gets a tier on top of
--     its RRF score:
--       3 · the title IS the query (case-insensitive, trimmed)
--       2 · the query phrase starts the title or a word in it ("jud" → "Judge", "Call the judge")
--       1 · every word appears somewhere ("prejudged"; two words out of order)
--     RRF sums stay below 0.03, so the tiers decide the order and RRF orders rows within a tier.
--     "Title" is the title search_hybrid returns: task title, person name, event title, project
--     name, and the first 80 characters of an inbox item's raw_text or a journal entry's body.
--     Three or more words switch the arm off; those queries are FTS + vector as before, so chat's
--     full-sentence retrieval is unaffected by it.
--     Ties (mostly lexical rows found by nothing else) go to the shorter title, then entity_id.
--
-- Cost: the lexical arm is an ILIKE seq scan over one user's rows in six tables. That is the same
-- trade 0031 made for its to_tsvector-per-row branches: fine for a one-person corpus. If it ever
-- gets slow, a pg_trgm GIN index on each title column serves `ilike '%…%'`.

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
