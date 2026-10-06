-- Migration: 0050_user_timezones.sql
-- User time zones (2026-10-04): app_settings.timezone (0003, default 'Africa/Cairo') is now each
-- user's real clock — the app, notify (digest/nudge times, quiet hours, the nudge's "today"), chat's
-- snapshot and the AI parse all read it. The one SQL job that decides a user's "this month" is the
-- retainer reload (0047), which read Cairo's month for everyone: at its old slot ('0 0 1 * *' UTC) a
-- user in Los Angeles is still on the 31st, so it would have rolled their retainer into the month
-- that was ending. Now each retainer reloads once per month of its OWNER's zone:
--   · the job runs hourly through the 1st and 2nd (UTC) — every zone's 1st begins inside that
--     window (UTC+14 starts it at 10:00 UTC on the previous day; the job then catches it at 00:00);
--   · a retainer already reloaded since its owner's month began (its `retainer.reloaded` activity
--     row) is skipped, so the 48 runs reload each one exactly once;
--   · the roll keeps each task's own time of day on the owner's clock.
-- An owner with no settings row, or a zone Postgres doesn't know, gets Africa/Cairo.
--
-- Left Cairo-global on purpose: ai_usage / ai_usage_global's day (0036, 0040) — one shared Groq
-- budget, so its day has to be one day for everyone. Resurfacing's once-a-day gate (0035) reads
-- `current_date` (UTC), as before — not Cairo, and not a per-user promise anywhere in the UI.
-- Hand check: supabase/tests/retainer-reload.sql.
create or replace function reload_retainers()
returns void as $$
declare
  proj record;
  item jsonb;
  new_checklist jsonb;
  tz text;
  month_start_local timestamp;
  month_start timestamptz;
  rolled int;
begin
  for proj in select * from projects where type = 'retainer' and status = 'active' and deleted_at is null loop
    select s.timezone into tz from app_settings s where s.user_id = proj.user_id;
    if tz is null or not exists (select 1 from pg_timezone_names where name = tz) then
      tz := 'Africa/Cairo';
    end if;
    month_start_local := date_trunc('month', now() at time zone tz);
    month_start := month_start_local at time zone tz;

    -- Already reloaded this month (owner's clock): an earlier run of the same window did it.
    continue when exists (
      select 1 from activity_log
      where user_id = proj.user_id and event_type = 'retainer.reloaded'
        and entity_type = 'project' and entity_id = proj.id and created_at >= month_start
    );

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
             (month_start_local::date + (due_at at time zone tz)::time) at time zone tz as new_due
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

-- Hourly through the 1st and 2nd of the month (UTC). cron.schedule with an existing name replaces
-- that job, so a re-run is harmless.
select cron.schedule('retainer-reload-monthly', '0 * 1,2 * *', $$select reload_retainers()$$);
