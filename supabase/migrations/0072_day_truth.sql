-- Migration: 0072_day_truth.sql
-- P7e parity audit (2026-10-13), list A. Additive and idempotent: run it twice, nothing changes.
--
-- A23. Slipping skips archived projects. An archived project is put away on purpose (Projects ⋯ →
--      Archive, or Finish), but the view only left out trashed ones, so it came back as "slipping"
--      once its last touch was a week old. 0053's definition, with `status <> 'archived'` on projects;
--      same columns, still security_invoker.

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
  where p.deleted_at is null and p.status <> 'archived'
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
