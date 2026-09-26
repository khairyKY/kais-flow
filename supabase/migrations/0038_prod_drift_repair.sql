-- Repairs the production drift found during the v1.0.0 deploy (docs/log/2026-09-26-1900-bohr-release-v1.0.0.md).
-- Production ran earlier copies of two migrations than the files in git:
--   0020 → no reload_retainers() and no `retainer-reload-monthly` job, so retainer checklists
--          have never reset on the 1st of the month in production.
--   0022 → no indexes on people/interactions (performance only).
-- Everything here is idempotent: on a database that ran the current 0020/0022 files (every fresh
-- or local database) it changes nothing.

-- 0020's function, with 0034's hardening folded in (pinned search_path, cron-only).
create or replace function reload_retainers()
returns void as $$
declare
  proj record;
  item jsonb;
  new_checklist jsonb;
begin
  for proj in select * from projects where type = 'retainer' and status = 'active' loop
    new_checklist := '[]'::jsonb;
    if proj.checklist is not null and jsonb_array_length(proj.checklist) > 0 then
      for item in select * from jsonb_array_elements(proj.checklist) loop
        item := jsonb_set(item, '{completed}', 'false'::jsonb);
        new_checklist := new_checklist || item;
      end loop;
    end if;

    update projects set checklist = new_checklist, updated_at = now() where id = proj.id;

    insert into activity_log (id, user_id, event_type, entity_type, entity_id, payload, created_at)
    values (gen_random_uuid(), proj.user_id, 'retainer.reloaded', 'project', proj.id,
            jsonb_build_object('name', proj.name), now());
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function reload_retainers() from public, anon, authenticated;

select cron.unschedule('retainer-reload-monthly')
  where exists (select 1 from cron.job where jobname = 'retainer-reload-monthly');
select cron.schedule('retainer-reload-monthly', '0 0 1 * *', $$select reload_retainers()$$);

-- 0022's indexes.
create index if not exists people_domain_id_idx on people(domain_id);
create index if not exists interactions_person_id_idx on interactions(person_id);
create index if not exists interactions_occurred_at_idx on interactions(occurred_at);
