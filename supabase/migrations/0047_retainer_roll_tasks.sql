-- Migration: 0047_retainer_roll_tasks.sql
-- The retainer's monthly reload (0020, repaired in 0038) only cleared the checklist ticks. It now
-- also rolls the retainer's unfinished work into the new month: every open task of an active
-- retainer still due before this month becomes due on the 1st, at its own Cairo time of day. The
-- same rows move — nothing is copied, nothing is closed. A reminder moves with its task (and may
-- fire again for the new date). Left alone: done/cancelled, trashed, someday, undated, recurring
-- tasks (their rule already moves them) and anything due this month or later.
--
-- Same pg_cron job as before (`retainer-reload-monthly`, '0 0 1 * *' UTC = 02:00/03:00 Cairo on
-- the 1st), so "this month" read on Cairo's clock (the app's one day boundary, B2) is the month that
-- just began. A trashed retainer (0044) no longer reloads. Hardening as in 0034/0038: pinned
-- search_path, cron-only. Run by hand to check: supabase/tests/retainer-reload.sql.
create or replace function reload_retainers()
returns void as $$
declare
  proj record;
  item jsonb;
  new_checklist jsonb;
  month_start_local timestamp := date_trunc('month', now() at time zone 'Africa/Cairo');
  month_start timestamptz := month_start_local at time zone 'Africa/Cairo';
  rolled int;
begin
  for proj in select * from projects where type = 'retainer' and status = 'active' and deleted_at is null loop
    new_checklist := '[]'::jsonb;
    if proj.checklist is not null and jsonb_array_length(proj.checklist) > 0 then
      for item in select * from jsonb_array_elements(proj.checklist) loop
        item := jsonb_set(item, '{completed}', 'false'::jsonb);
        new_checklist := new_checklist || item;
      end loop;
    end if;

    update projects set checklist = new_checklist, updated_at = now() where id = proj.id;

    update tasks t
    set due_at = r.new_due,
        reminder_at = t.reminder_at + (r.new_due - t.due_at),
        reminder_sent = case when t.reminder_at is null then t.reminder_sent else false end,
        updated_at = now()
    from (
      select id,
             (month_start_local::date + (due_at at time zone 'Africa/Cairo')::time) at time zone 'Africa/Cairo' as new_due
      from tasks
      where project_id = proj.id
        and status = 'todo'
        and deleted_at is null
        and not someday
        and recurrence_rule is null
        and due_at < month_start
    ) r
    where t.id = r.id;
    get diagnostics rolled = row_count;

    insert into activity_log (id, user_id, event_type, entity_type, entity_id, payload, created_at)
    values (gen_random_uuid(), proj.user_id, 'retainer.reloaded', 'project', proj.id,
            jsonb_build_object('name', proj.name, 'tasks_rolled', rolled), now());
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function reload_retainers() from public, anon, authenticated;
