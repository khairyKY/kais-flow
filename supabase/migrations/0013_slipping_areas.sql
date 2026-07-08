-- Issue #4: Extend slipping view to cover areas.

create or replace view slipping with (security_invoker = true) as
with domain_touch as (
  select
    d.id,
    d.name,
    greatest(
      d.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'domain' and al.entity_id = d.id), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'project' and al.entity_id in (select id from projects where domain_id = d.id)), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'task' and al.entity_id in (select id from tasks where domain_id = d.id)), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'area' and al.entity_id in (select id from areas where domain_id = d.id)), d.created_at)
    ) as last_touch
  from domains d
),
project_touch as (
  select
    p.id,
    p.name,
    greatest(
      p.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'project' and al.entity_id = p.id), p.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'task' and al.entity_id in (select id from tasks where project_id = p.id)), p.created_at)
    ) as last_touch
  from projects p
),
area_touch as (
  select
    a.id,
    a.name,
    greatest(
      a.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'area' and al.entity_id = a.id), a.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'task' and al.entity_id in (select id from tasks where area_id = a.id)), a.created_at)
    ) as last_touch
  from areas a
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
