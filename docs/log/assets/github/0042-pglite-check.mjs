// 0042 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, then `node 0042-pglite-check.mjs <repo root>`.
// Stubs cron (job table + schedule/unschedule), net.http_post (records its arguments) and vault.decrypted_secrets;
// runs 0042 twice (idempotent); runs the job's command; asserts one job, its schedule, and the POST it makes.
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
-- an unrelated job that must survive
select cron.schedule('morning-digest', '0 5 * * *', 'select 1');`)
const sql = readFileSync(`${root}/supabase/migrations/0042_github_sync_cron.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent: runs twice

const q = async (s) => (await db.query(s)).rows
const jobs = await q(`select jobname, schedule, command from cron.job order by jobname`)
const job = jobs.find((j) => j.jobname === 'github-sync')
await db.exec(job.command)
const calls = await q(`select * from net.calls`)
console.log(JSON.stringify({ jobs: jobs.map((j) => [j.jobname, j.schedule]), calls }, null, 1))

const checks = {
  oneJob: jobs.filter((j) => j.jobname === 'github-sync').length === 1,
  otherJobKept: jobs.some((j) => j.jobname === 'morning-digest'),
  schedule: job.schedule === '7,37 * * * *',
  oneCall: calls.length === 1,
  url: calls[0]?.url === 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/github-sync',
  auth: calls[0]?.headers?.Authorization === 'Bearer SRK-test',
  body: JSON.stringify(calls[0]?.body) === JSON.stringify({ action: 'sync' }),
  timeout: calls[0]?.timeout_ms === 150000,
}
console.log(checks)
const ok = Object.values(checks).every(Boolean)
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
