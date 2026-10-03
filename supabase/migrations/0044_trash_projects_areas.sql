-- Kai 2026-10-03: projects and areas can be deleted (right-click / ⋯ on the Projects page). Same
-- shape as 0023's soft delete: `deleted_at` set = in Trash ("Moved to Trash · Undo", no confirm),
-- restorable from Trash, composted 30 days later by compost_expired().
-- Their tasks are never touched by the delete: a task keeps its project_id / area_id while the
-- container rests in Trash (so a restore puts everything back as it was), and when the container
-- is composted the FK lets go (`on delete set null`) — the task keeps living, just without it.

alter table projects add column if not exists deleted_at timestamptz;
alter table areas add column if not exists deleted_at timestamptz;
create index if not exists projects_deleted_at_idx on projects (deleted_at) where deleted_at is not null;
create index if not exists areas_deleted_at_idx on areas (deleted_at) where deleted_at is not null;

-- tasks.area_id (0010) had no ON DELETE action, so composting an area that still has tasks would
-- fail the whole compost transaction. Match tasks.project_id (0002): set null.
alter table tasks drop constraint if exists tasks_area_id_fkey;
alter table tasks add constraint tasks_area_id_fkey foreign key (area_id) references areas (id) on delete set null;

-- 0032's sweep, plus the two new Trash tables. Body otherwise unchanged.
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

-- `create or replace` keeps 0032's grants, but restate the lock so this file stands on its own.
revoke execute on function compost_expired() from public, anon, authenticated;

-- slipping: 0036's definition, with trashed projects and areas left out (a container in Trash
-- shouldn't nag from Today's Slipping stack). Same columns, still security_invoker.
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
