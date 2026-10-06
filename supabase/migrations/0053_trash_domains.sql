-- Kai 2026-10-06: "we can't create domains easily … you can't delete them, rename, no nothing".
-- Domains join projects and areas (0044) in the Trash: Delete = `deleted_at` set ("Moved to Trash ·
-- Undo", no confirm), restorable from Trash, composted 30 days later by compost_expired().
-- What's in a trashed domain is never touched by the delete: its projects, areas, tasks, people,
-- routines and notes keep their domain_id while it rests in Trash (every list shows only live
-- domains, so they simply read as "no domain"), Undo / Restore puts everything back, and
-- composting it lets the set-null FKs (0002 / 0010 / 0021 / 0022 / 0028) release them for good.
-- Merge (the app's mergeDomain) moves everything into the other domain first, then trashes the
-- emptied one the same way, so a merge also has its Undo.

alter table domains add column if not exists deleted_at timestamptz;
create index if not exists domains_deleted_at_idx on domains (deleted_at) where deleted_at is not null;

-- 0044's sweep, plus domains. Body otherwise unchanged.
create or replace function compost_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
  removed integer := 0;
  n integer;
begin
  -- Trash (soft-deleted rows) — the tables the Trash page lists.
  delete from tasks where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  delete from calendar_events where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  delete from journal_entries where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  -- After tasks, so a container composting on the same night as its own trashed tasks loses them
  -- first; the rest are released by the set-null FKs.
  delete from projects where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  delete from areas where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  -- After projects/areas (0053): what still points at the domain is released by its set-null FKs.
  delete from domains where deleted_at < cutoff;
  get diagnostics n = row_count; removed := removed + n;

  -- Inbox: soft-deleted rows ("Clear now"), plus dismissed captures that were simply
  -- left to compost. `updated_at` is the dismissal stamp — it is what the Dismissed
  -- tab itself renders as "dismissed 3d ago".
  delete from inbox_items
   where deleted_at < cutoff
      or (status = 'dismissed' and updated_at < cutoff);
  get diagnostics n = row_count; removed := removed + n;

  return removed;
end;
$$;

-- `create or replace` keeps the grants, but restate the lock so this file stands on its own.
revoke execute on function compost_expired() from public, anon, authenticated;

-- slipping: 0044's definition, with trashed domains left out too. Same columns, still security_invoker.
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
  where d.deleted_at is null
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
  where p.deleted_at is null
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
  where a.deleted_at is null
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
