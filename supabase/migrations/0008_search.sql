-- P5 AI Chat + Resurfacing: FTS + embeddings infrastructure, embed_queue, search_hybrid (RRF),
-- resurfacing (weighted-random pick over tasks + inbox_items).

create extension if not exists vector; -- already enabled in 0001, no-op guard

-- ── FTS + embedding columns ────────────────────────────────────────────────
alter table tasks add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(notes, ''))) stored;
alter table tasks add column if not exists embedding vector(384);
create index if not exists tasks_search_tsv_idx on tasks using gin (search_tsv);
create index if not exists tasks_embedding_hnsw_idx on tasks using hnsw (embedding vector_cosine_ops);

alter table inbox_items add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', raw_text)) stored;
alter table inbox_items add column if not exists embedding vector(384);
create index if not exists inbox_items_search_tsv_idx on inbox_items using gin (search_tsv);
create index if not exists inbox_items_embedding_hnsw_idx on inbox_items using hnsw (embedding vector_cosine_ops);

-- ── embed_queue: filled by triggers below, drained by the `embed` edge function ────────────
create table embed_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('task', 'inbox_item')),
  entity_id uuid not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);
alter table embed_queue enable row level security;
create policy "embed_queue_all" on embed_queue for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index embed_queue_status_idx on embed_queue(status);

-- Re-enqueuing (on conflict) resets status to 'pending' so an edit gets re-embedded.
create or replace function enqueue_embed_task() returns trigger as $$
begin
  insert into embed_queue (entity_type, entity_id, content, user_id)
  values ('task', new.id, coalesce(new.title, '') || ' ' || coalesce(new.notes, ''), new.user_id)
  on conflict (entity_type, entity_id) do update set content = excluded.content, status = 'pending';
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- WHEN guards against the embed edge function's own `update tasks set embedding = ...` writes
-- (which never touch title/notes) — without this the trigger would re-enqueue itself forever.
-- Split insert/update: Postgres rejects a WHEN clause referencing OLD on a trigger whose event
-- set includes INSERT (OLD doesn't exist for that event), so INSERT always fires unconditionally
-- and only the UPDATE trigger is WHEN-guarded against embedding-only writes.
create trigger tasks_enqueue_embed_insert
  after insert on tasks
  for each row
  execute function enqueue_embed_task();

create trigger tasks_enqueue_embed_update
  after update on tasks
  for each row
  when (old.title is distinct from new.title or old.notes is distinct from new.notes)
  execute function enqueue_embed_task();

create or replace function enqueue_embed_inbox_item() returns trigger as $$
begin
  insert into embed_queue (entity_type, entity_id, content, user_id)
  values ('inbox_item', new.id, new.raw_text, new.user_id)
  on conflict (entity_type, entity_id) do update set content = excluded.content, status = 'pending';
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger inbox_items_enqueue_embed_insert
  after insert on inbox_items
  for each row
  execute function enqueue_embed_inbox_item();

create trigger inbox_items_enqueue_embed_update
  after update on inbox_items
  for each row
  when (old.raw_text is distinct from new.raw_text)
  execute function enqueue_embed_inbox_item();

-- ── Hybrid retrieval: FTS rank + vector cosine rank, merged via Reciprocal Rank Fusion ──────
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
    where embedding is not null and (embedding <=> query_embedding) < 0.6
    union all
    select 'inbox_item', id, left(raw_text, 80),
           left(raw_text, 200),
           embedding <=> query_embedding
    from inbox_items
    where embedding is not null and (embedding <=> query_embedding) < 0.6
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

-- ── Resurfacing ──────────────────────────────────────────────────────────
create table resurfaced_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('task', 'inbox_item')),
  entity_id uuid not null,
  shown_on date not null,
  action text not null default 'pending' check (action in ('pending', 'converted', 'review_later', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, shown_on)
);
alter table resurfaced_log enable row level security;
create policy "resurfaced_log_all" on resurfaced_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Weighted-random daily pick: weight = days since the entity's last activity_log touch
-- (older/more-untouched = more likely), +20 flat boost if previously marked 'review_later'.
-- Excludes anything shown in the last 14 days. SECURITY DEFINER because pg_cron has no JWT/
-- auth.uid() context — same reason cron work elsewhere in this app goes through a service-role
-- edge function; this one stays a plain SQL function since it's pure DB work with no HTTP call.
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
  select id into v_user_id from auth.users order by created_at limit 1;
  if v_user_id is null then
    return;
  end if;

  if exists (select 1 from resurfaced_log where user_id = v_user_id and shown_on = current_date) then
    return;
  end if;

  select entity_type, entity_id into v_entity_type, v_entity_id
  from (
    select
      raw.entity_type,
      raw.entity_id,
      greatest(
        extract(epoch from (now() - coalesce(
          (select max(al.created_at) from activity_log al
           where al.entity_type = raw.entity_type and al.entity_id = raw.entity_id),
          raw.created_at
        ))) / 86400,
        1
      )
      + case when exists (
          select 1 from resurfaced_log rl
          where rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id and rl.action = 'review_later'
        ) then 20 else 0 end as weight
    from (
      select 'task'::text as entity_type, id as entity_id, created_at from tasks where created_at < now() - interval '3 days'
      union all
      select 'inbox_item', id, created_at from inbox_items where created_at < now() - interval '3 days'
    ) raw
    where not exists (
      select 1 from resurfaced_log rl
      where rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id and rl.shown_on > current_date - 14
    )
  ) candidates
  order by power(random(), 1.0 / weight) desc
  limit 1;

  if v_entity_type is not null then
    insert into resurfaced_log (user_id, entity_type, entity_id, shown_on)
    values (v_user_id, v_entity_type, v_entity_id, current_date);
  end if;
end;
$$;

alter publication supabase_realtime add table resurfaced_log;
