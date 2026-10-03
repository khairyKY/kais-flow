-- reload_retainers() (0047): the monthly reload clears a retainer's checklist ticks and rolls its
-- unfinished tasks into the new month — the same rows, due on the 1st at their own Cairo time.
-- LOCAL stack only, as the postgres role; everything happens in one transaction and is rolled back
-- (the function touches every retainer in the database, which the rollback undoes too):
--
--   psql "$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/retainer-reload.sql
--
-- Prints "retainer-reload: all checks passed", or stops at the first failed check.
begin;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000a7a1e', 'retainer-reload@example.test');

-- The clock the function reads: now() is fixed for the transaction.
create temp table clock as
select date_trunc('month', now() at time zone 'Africa/Cairo') as m;      -- this month's 1st, Cairo wall
create function pg_temp.cairo(d int, hhmm text, mo int default -1) returns timestamptz
language sql as $$
  select (((select m from clock) + make_interval(months => mo, days => d - 1))::date + hhmm::time) at time zone 'Africa/Cairo'
$$;

insert into projects (id, user_id, name, type, status, checklist, deleted_at) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000a7a1e', 'Acme retainer', 'retainer', 'active',
   '[{"id":"c1","text":"Monthly report","completed":true},{"id":"c2","text":"Invoice","completed":false}]', null),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000a7a1e', 'Website', 'standard', 'active', '[]', null),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000a7a1e', 'Old retainer', 'retainer', 'active', '[]', now());

insert into tasks (id, user_id, project_id, title, status, due_at, reminder_at, reminder_sent, recurrence_rule, someday, deleted_at, completed_at) values
  -- rolls: open, due last month (15:00 Cairo), its reminder 10 min before already sent
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Draft the report', 'todo', pg_temp.cairo(20, '15:00'), pg_temp.cairo(20, '14:50'), true, null, false, null, null),
  -- rolls: late evening Cairo is the next UTC day's early hours — the Cairo time is what's kept
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Late call', 'todo', pg_temp.cairo(28, '23:30'), null, false, null, false, null, null),
  -- stays: done
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Sent the invoice', 'done', pg_temp.cairo(10, '09:00'), null, false, null, false, null, pg_temp.cairo(10, '10:00')),
  -- stays: due later this month
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Kick-off call', 'todo', pg_temp.cairo(5, '11:00', 0), null, false, null, false, null, null),
  -- stays: undated
  ('00000000-0000-4000-8000-00000000b005', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Ideas', 'todo', null, null, false, null, false, null, null),
  -- stays: recurring (its rule moves it), someday, trashed
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Weekly sync', 'todo', pg_temp.cairo(21, '10:00'), null, false, 'FREQ=WEEKLY', false, null, null),
  ('00000000-0000-4000-8000-00000000b008', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Maybe', 'todo', pg_temp.cairo(13, '10:00'), null, false, null, true, null, null),
  ('00000000-0000-4000-8000-00000000b009', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a001', 'Binned', 'todo', pg_temp.cairo(14, '10:00'), null, false, null, false, now(), null),
  -- stays: a standard project's overdue task, and a trashed retainer's
  ('00000000-0000-4000-8000-00000000b010', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a002', 'Fix the footer', 'todo', pg_temp.cairo(15, '10:00'), null, false, null, false, null, null),
  ('00000000-0000-4000-8000-00000000b011', '00000000-0000-4000-8000-0000000a7a1e', '00000000-0000-4000-8000-00000000a003', 'Old work', 'todo', pg_temp.cairo(16, '10:00'), null, false, null, false, null, null);

create temp table snapshot as select id, due_at from tasks where user_id = '00000000-0000-4000-8000-0000000a7a1e';

select reload_retainers();

do $$
declare
  n int;
  t record;
begin
  -- rolled, same rows (no copies), still open
  select * into t from tasks where id = '00000000-0000-4000-8000-00000000b001';
  if t.due_at is distinct from pg_temp.cairo(1, '15:00', 0) then raise exception 'b001 due % — want this month''s 1st at 15:00 Cairo', t.due_at; end if;
  if t.reminder_at is distinct from pg_temp.cairo(1, '14:50', 0) or t.reminder_sent then raise exception 'b001 reminder % (sent %) — want 14:50 on the 1st, not yet sent', t.reminder_at, t.reminder_sent; end if;
  if t.status <> 'todo' then raise exception 'b001 status % — want todo', t.status; end if;
  select due_at into t from tasks where id = '00000000-0000-4000-8000-00000000b002';
  if t.due_at is distinct from pg_temp.cairo(1, '23:30', 0) then raise exception 'b002 due % — want the 1st at 23:30 Cairo', t.due_at; end if;
  select count(*) into n from tasks where user_id = '00000000-0000-4000-8000-0000000a7a1e';
  if n <> 10 then raise exception '% tasks — want 10 (a roll moves rows, never copies them)', n; end if;

  -- untouched
  select count(*) into n from tasks t join snapshot b using (id)
  where t.id not in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002')
    and t.due_at is distinct from b.due_at;
  if n <> 0 then raise exception '% task(s) moved that should have stayed (done/later/undated/recurring/someday/trashed/other projects)', n; end if;

  -- the checklist ticks clear, as before; the activity row counts the roll
  select count(*) into n from projects, jsonb_array_elements(checklist) e
  where id = '00000000-0000-4000-8000-00000000a001' and (e ->> 'completed')::boolean;
  if n <> 0 then raise exception 'checklist still has % ticked item(s)', n; end if;
  select (payload ->> 'tasks_rolled')::int into n from activity_log
  where entity_id = '00000000-0000-4000-8000-00000000a001' and event_type = 'retainer.reloaded';
  if n is distinct from 2 then raise exception 'activity tasks_rolled % — want 2', n; end if;
  if exists (select 1 from activity_log where entity_id = '00000000-0000-4000-8000-00000000a003') then raise exception 'the trashed retainer reloaded'; end if;

  raise notice 'retainer-reload: all checks passed';
end $$;

rollback;
