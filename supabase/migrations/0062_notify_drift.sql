-- Migration: 0062_notify_drift.sql
-- The 2026-10-12 whole-app review: server and notification drift. Idempotent — every step can re-run.
--
-- 1. The hourly "Overdue" push is gone. 0006 scheduled `overdue-sweep` every hour; it counted trashed
--    and someday tasks, compared instants (a task due 09:00 was "overdue" at 10:00) and had no switch
--    in Settings → Notifications, so nobody could turn it off. Kai's notification design (Tray and
--    Notifications.dc.html 12k) has no overdue kind: the morning digest now says "N overdue" (open,
--    not someday, dated before the user's today), and notify no longer knows the kind.
select cron.unschedule('overdue-sweep') where exists (select 1 from cron.job where jobname = 'overdue-sweep');

-- 2. Routine reminders. The New Routine form's "Reminder — a gentle push notification" saved
--    routines.clock_time (0019) and nothing read it. notify's new kind 'routine' sends it at that time
--    on the user's clock, on the days the routine's cadence has, unless it's already checked off that
--    day (notify/routine.ts); quiet hours, pause and lock-screen privacy apply as for every kind, and
--    this is its switch (Settings → Notifications → Routine reminder; the 0048 pattern).
alter table app_settings add column if not exists routine_on boolean not null default true;

-- Every 5 minutes, like `task-reminder-sweep` (0016). cron.schedule with an existing name replaces
-- that job, so a re-run is harmless.
select cron.schedule(
  'routine-reminder-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'routine')
  );
  $$
);

-- 3. Resurfacing never picks a cancelled task: 0059's body with `status = 'todo'` (was `<> 'done'`).
--    Everything else is unchanged (per-user loop, 14-day exclusion, snoozes, let-go, weights).
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
  for v_user_id in select id from auth.users order by created_at loop
    if exists (select 1 from resurfaced_log where user_id = v_user_id and shown_on = current_date) then
      continue;
    end if;

    v_entity_type := null;
    v_entity_id := null;

    select entity_type, entity_id into v_entity_type, v_entity_id
    from (
      select
        raw.entity_type,
        raw.entity_id,
        greatest(
          extract(epoch from (now() - coalesce(
            (select max(al.created_at) from activity_log al
             where al.user_id = v_user_id
               and al.entity_type = raw.entity_type and al.entity_id = raw.entity_id),
            raw.created_at
          ))) / 86400,
          1
        ) as weight
      from (
        select 'task'::text as entity_type, id as entity_id, created_at from tasks
        where user_id = v_user_id and created_at < now() - interval '3 days'
          and status = 'todo' and deleted_at is null
        union all
        select 'inbox_item', id, created_at from inbox_items
        where user_id = v_user_id and created_at < now() - interval '3 days'
          and status <> 'dismissed' and deleted_at is null
      ) raw
      where not exists (
        select 1 from resurfaced_log rl
        where rl.user_id = v_user_id
          and rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id
          and (rl.shown_on > current_date - 14 or rl.action = 'dismissed' or rl.snoozed_until > now())
      )
    ) candidates
    order by power(random(), 1.0 / weight) desc
    limit 1;

    if v_entity_type is not null then
      insert into resurfaced_log (user_id, entity_type, entity_id, shown_on)
      values (v_user_id, v_entity_type, v_entity_id, current_date)
      on conflict (user_id, shown_on) do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function do_resurface() from public, anon, authenticated;

-- 4. Stale Top 3 flags. Before the Top 3 rule (app/src/features/tasks/top3Rule.ts, 2026-10-12) no
--    date-changing write cleared `tasks.top3`, so a pick moved to Thursday, parked as someday, sent to
--    Trash or cancelled still wore its star — and the cap of 3 counted it. The app releases a pick on
--    every such write now (lib/outbox writeRow → releaseTop3) and every reader applies the same rule
--    (notify, chat and mcp through _shared/today.ts); this clears the flags written before it.
--    Only the flags: no date, status or row is touched, so nothing is lost — the task is still there,
--    just not starred (star it again in one tap). Kept: picks that are undated or dated today or
--    earlier (yesterday's unfinished pick stays for the morning ritual to offer again). A task's day is
--    its due date, else its calendar block, on its owner's clock (app_settings.timezone; Cairo when
--    unset or unknown to Postgres, as 0050 reads it). Finished picks already have top3 = false (the
--    app clears it on completion) and keep their top3_rank — a finished goal stays the goal.
with zone as (
  select u.id as user_id,
         coalesce(
           (select s.timezone from app_settings s
             where s.user_id = u.id
               and exists (select 1 from pg_timezone_names n where n.name = s.timezone)),
           'Africa/Cairo'
         ) as tz
    from auth.users u
)
update tasks t
   set top3 = false,
       top3_rank = null
  from zone z
 where z.user_id = t.user_id
   and t.top3
   and (
     t.someday
     or t.deleted_at is not null
     or t.status <> 'todo'
     or (coalesce(t.due_at, t.scheduled_start) at time zone z.tz)::date > (now() at time zone z.tz)::date
   );

-- 5. Realtime for areas and time_entries (the app now subscribes to both, lib/realtime.ts). 0010 and
--    0020 added them to the publication, but production once ran an older 0020 (0038's drift note), so
--    add whichever is missing.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'areas') then
    alter publication supabase_realtime add table areas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'time_entries') then
    alter publication supabase_realtime add table time_entries;
  end if;
end $$;
