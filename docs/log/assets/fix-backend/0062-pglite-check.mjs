// 0062 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there,
// then `node 0062-pglite-check.mjs <repo root>`. Minimal tables + pg_cron stand-ins, then 0062 twice.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key, created_at timestamptz default now());
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create schema cron; create table cron.job (jobid serial, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language plpgsql as $$
begin insert into cron.job (jobname, schedule, command) values (n, s, c)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; return 1; end $$;
create function cron.unschedule(n text) returns boolean language plpgsql as $$ begin delete from cron.job where jobname = n; return true; end $$;
create table app_settings (user_id uuid primary key, timezone text not null default 'Africa/Cairo');
create table tasks (id uuid primary key, user_id uuid, status text default 'todo', someday bool default false, deleted_at timestamptz,
  due_at timestamptz, scheduled_start timestamptz, top3 bool default false, top3_rank smallint, created_at timestamptz default now(), updated_at timestamptz default now());
create table inbox_items (id uuid primary key, user_id uuid, status text default 'pending', deleted_at timestamptz, created_at timestamptz);
create table activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, entity_type text, entity_id uuid, created_at timestamptz default now());
create table resurfaced_log (id uuid primary key default gen_random_uuid(), user_id uuid not null, entity_type text not null, entity_id uuid not null,
  shown_on date not null, action text not null default 'pending', snoozed_until timestamptz, created_at timestamptz not null default now(), unique (user_id, shown_on));
create table areas (id uuid primary key, user_id uuid);
create table time_entries (id uuid primary key, user_id uuid);
create publication supabase_realtime for table areas;
insert into cron.job (jobname, schedule, command) values ('overdue-sweep', '0 * * * *', 'kind overdue'), ('task-reminder-sweep', '*/5 * * * *', 'kind task_reminder');
`)
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const cairo = (expr) => `(${expr}) at time zone 'Africa/Cairo'`
const cairoToday = `date_trunc('day', now() at time zone 'Africa/Cairo')`
const laToday = `date_trunc('day', now() at time zone 'America/Los_Angeles')`
const cairoTomorrow1am = cairo(`${cairoToday} + interval '1 day 1 hour'`)
const cairoToday9 = cairo(`${cairoToday} + interval '9 hours'`)
const cairoYesterday = cairo(`${cairoToday} - interval '15 hours'`)
const laTonight = `(${laToday} + interval '23 hours 59 minutes') at time zone 'America/Los_Angeles'`
await db.exec(`
insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}'), ('${U(5)}'), ('${U(6)}');
insert into app_settings (user_id, timezone) values ('${U(1)}', 'Africa/Cairo'), ('${U(2)}', 'America/Los_Angeles'), ('${U(4)}', 'Mars/Base');
-- user 1, Cairo
insert into tasks (id, user_id, top3, top3_rank, due_at) values ('${T(1)}', '${U(1)}', true, 1, null);              -- undated pick: kept
insert into tasks (id, user_id, top3, due_at) values ('${T(2)}', '${U(1)}', true, ${cairoToday9});                     -- today: kept
insert into tasks (id, user_id, top3, due_at) values ('${T(3)}', '${U(1)}', true, ${cairoYesterday});                  -- yesterday's: kept
insert into tasks (id, user_id, top3, top3_rank, due_at) values ('${T(4)}', '${U(1)}', true, 2, ${cairoTomorrow1am}); -- moved to tomorrow: cleared
insert into tasks (id, user_id, top3, scheduled_start) values ('${T(5)}', '${U(1)}', true, ${cairoTomorrow1am});      -- a block tomorrow, no due: cleared
insert into tasks (id, user_id, top3, someday) values ('${T(6)}', '${U(1)}', true, true);                              -- someday: cleared
insert into tasks (id, user_id, top3, deleted_at) values ('${T(7)}', '${U(1)}', true, now());                          -- Trash: cleared
insert into tasks (id, user_id, top3, status) values ('${T(8)}', '${U(1)}', true, 'cancelled');                        -- cancelled: cleared
insert into tasks (id, user_id, top3, top3_rank, status) values ('${T(9)}', '${U(1)}', false, 1, 'done');             -- a finished goal: rank kept
insert into tasks (id, user_id, top3, due_at, scheduled_start) values ('${T(10)}', '${U(1)}', true, ${cairoToday9}, ${cairoTomorrow1am}); -- due wins: kept
-- user 2, Los Angeles: the same Cairo-tomorrow instant is still today there
insert into tasks (id, user_id, top3, due_at) values ('${T(11)}', '${U(2)}', true, ${cairoTomorrow1am});              -- kept
insert into tasks (id, user_id, top3, due_at) values ('${T(12)}', '${U(2)}', true, ${laTonight});                     -- kept
insert into tasks (id, user_id, top3, due_at) values ('${T(13)}', '${U(2)}', true, ${laTonight} + interval '2 minutes'); -- LA tomorrow: cleared
-- user 3 (no settings row) and user 4 (a zone Postgres doesn't know) read Cairo
insert into tasks (id, user_id, top3, due_at) values ('${T(14)}', '${U(3)}', true, ${cairoTomorrow1am});              -- cleared
insert into tasks (id, user_id, top3, due_at) values ('${T(15)}', '${U(4)}', true, ${cairoTomorrow1am});              -- cleared
insert into tasks (id, user_id, top3, due_at) values ('${T(16)}', '${U(4)}', true, ${cairoToday9});                   -- kept
-- resurfacing: user 5 has only an old cancelled task; user 6 an old open one
insert into tasks (id, user_id, status, created_at) values ('${T(20)}', '${U(5)}', 'cancelled', now() - interval '30 days');
insert into tasks (id, user_id, status, created_at) values ('${T(21)}', '${U(6)}', 'todo', now() - interval '30 days');
`)
const sql = readFileSync(`${root}/supabase/migrations/0062_notify_drift.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent
const ok = (name, cond, d = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
  if (!cond) process.exitCode = 1
}
const rows = async (q) => (await db.query(q)).rows
const jobs = await rows(`select jobname, schedule, command from cron.job order by jobname`)
ok('overdue-sweep unscheduled', !jobs.some((j) => j.jobname === 'overdue-sweep'))
const rj = jobs.find((j) => j.jobname === 'routine-reminder-sweep')
ok('routine-reminder-sweep every 5 minutes, kind routine', rj?.schedule === '*/5 * * * *' && /'kind', 'routine'/.test(rj.command))
ok('task-reminder-sweep untouched', jobs.some((j) => j.jobname === 'task-reminder-sweep'))
const col = await rows(`select column_default, is_nullable from information_schema.columns where table_name = 'app_settings' and column_name = 'routine_on'`)
ok('app_settings.routine_on boolean not null default true', col[0]?.column_default === 'true' && col[0]?.is_nullable === 'NO')
const flags = Object.fromEntries((await rows(`select id, top3, top3_rank from tasks`)).map((r) => [r.id, [r.top3, r.top3_rank]]))
const kept = [1, 2, 3, 10, 11, 12, 16]
const cleared = [4, 5, 6, 7, 8, 13, 14, 15]
ok('picks still today\'s keep their star', kept.every((n) => flags[T(n)][0] === true), JSON.stringify(kept.map((n) => flags[T(n)])))
ok('moved / someday / Trash / cancelled / later-in-their-zone picks lose star and rank', cleared.every((n) => flags[T(n)][0] === false && flags[T(n)][1] === null), JSON.stringify(cleared.map((n) => flags[T(n)])))
ok('the undated goal keeps its rank', flags[T(1)][1] === 1)
ok('a finished goal keeps its rank (top3 already false)', flags[T(9)][0] === false && flags[T(9)][1] === 1)
await db.exec(`select do_resurface()`)
const picks = await rows(`select user_id, entity_id from resurfaced_log`)
ok('resurfacing never picks a cancelled task', !picks.some((p) => p.user_id === U(5)))
ok('resurfacing still picks an open one', picks.some((p) => p.user_id === U(6) && p.entity_id === T(21)))
const pub = (await rows(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).map((r) => r.tablename)
ok('areas + time_entries in supabase_realtime', JSON.stringify(pub) === JSON.stringify(['areas', 'time_entries']), JSON.stringify(pub))
