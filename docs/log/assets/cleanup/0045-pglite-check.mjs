// 0045 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there,
// then `node 0045-pglite-check.mjs <repo root>`. Same stubs as ../github/0042-pglite-check.mjs (cron job
// table + schedule/unschedule, net.http_post records its arguments, vault.decrypted_secrets) plus a
// minimal app_settings with one existing row. Runs 0045 twice (idempotent), runs both jobs' commands.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2] ?? 'D:/Coding/kais-flow'
const db = new PGlite()
await db.exec(`
create schema cron;
create table cron.job (jobid serial, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns int language sql as $f$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid $f$;
create function cron.unschedule(n text) returns bool language sql as $f$ delete from cron.job where jobname=n returning true $f$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('service_role_key', 'SRK-test');
create schema net;
create table net.calls (url text, headers jsonb, body jsonb, timeout_ms int);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $f$ insert into net.calls values (url, headers, body, timeout_milliseconds) returning 1::bigint $f$;
-- 0007's fixed-time jobs, and one unrelated job that must survive
select cron.schedule('morning-digest', '0 5 * * *', 'select 1');
select cron.schedule('evening-nudge', '0 18 * * *', 'select 1');
select cron.schedule('task-reminder-sweep', '*/5 * * * *', 'select 1');
create table app_settings (user_id uuid primary key, timezone text not null default 'Africa/Cairo', digest_hour int not null default 8);
insert into app_settings (user_id) values ('00000000-0000-0000-0000-000000000001');`)
const sql = readFileSync(`${root}/supabase/migrations/0045_ritual_reminders.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent: runs twice

const q = async (s) => (await db.query(s)).rows
const existing = (await q(`select morning_digest_on, morning_digest_at::text as m, evening_nudge_on, evening_nudge_at::text as e from app_settings`))[0]
// The client writes 'HH:MM' (TimeField's contract); Postgres hands it back as 'HH:MM:SS'.
await db.exec(`insert into app_settings (user_id, morning_digest_on, morning_digest_at, evening_nudge_at) values ('00000000-0000-0000-0000-000000000002', false, '07:45', '22:30')`)
const written = (await q(`select morning_digest_on, morning_digest_at::text as m, evening_nudge_at::text as e from app_settings where user_id = '00000000-0000-0000-0000-000000000002'`))[0]
let badTime = false
try { await db.exec(`update app_settings set morning_digest_at = '25:00'`) } catch { badTime = true }

const jobs = await q(`select jobname, schedule, command from cron.job order by jobname`)
for (const j of jobs.filter((j) => j.jobname === 'morning-digest' || j.jobname === 'evening-nudge')) await db.exec(j.command)
const calls = await q(`select * from net.calls`)
console.log(JSON.stringify({ existing, written, jobs: jobs.map((j) => [j.jobname, j.schedule]), calls }, null, 1))

const call = (kind) => calls.find((c) => c.body?.kind === kind)
const checks = {
  existingRowGetsDefaults: existing.morning_digest_on === true && existing.m === '08:00:00' && existing.evening_nudge_on === true && existing.e === '21:00:00',
  clientWriteReadsBack: written.morning_digest_on === false && written.m === '07:45:00' && written.e === '22:30:00',
  notATimeRejected: badTime,
  oneJobEach: ['morning-digest', 'evening-nudge'].every((n) => jobs.filter((j) => j.jobname === n).length === 1),
  everyQuarterHour: jobs.filter((j) => j.jobname !== 'task-reminder-sweep').every((j) => j.schedule === '*/15 * * * *'),
  otherJobKept: jobs.some((j) => j.jobname === 'task-reminder-sweep' && j.schedule === '*/5 * * * *'),
  twoCalls: calls.length === 2,
  url: calls.every((c) => c.url === 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify'),
  auth: calls.every((c) => c.headers?.Authorization === 'Bearer SRK-test'),
  bodies: JSON.stringify(call('morning_digest')?.body) === JSON.stringify({ kind: 'morning_digest', scheduled: true }) &&
    JSON.stringify(call('evening_nudge')?.body) === JSON.stringify({ kind: 'evening_nudge', scheduled: true }),
}
console.log(checks)
const ok = Object.values(checks).every(Boolean)
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
