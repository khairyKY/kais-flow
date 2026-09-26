// 0038 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, then `node 0038-pglite-check.mjs` (edit the migration path below).
// Stubs cron.job/schedule/unschedule + the touched tables, runs 0038 twice, calls reload_retainers(), asserts.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema cron; create table cron.job (jobid serial, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns int language sql as $f$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid $f$;
create function cron.unschedule(n text) returns bool language sql as $f$ delete from cron.job where jobname=n returning true $f$;
create table projects (id uuid primary key default gen_random_uuid(), user_id uuid, name text, type text, status text, checklist jsonb not null default '[]', updated_at timestamptz);
create table activity_log (id uuid, user_id uuid, event_type text, entity_type text, entity_id uuid, payload jsonb, created_at timestamptz);
create table people (id uuid, domain_id uuid); create table interactions (id uuid, person_id uuid, occurred_at timestamptz);
insert into projects (user_id,name,type,status,checklist) values
 (gen_random_uuid(),'R','retainer','active','[{"text":"a","completed":true},{"text":"b","completed":false}]'),
 (gen_random_uuid(),'S','standard','active','[{"text":"x","completed":true}]');`)
const sql = readFileSync('D:/Coding/kais-flow/supabase/migrations/0038_prod_drift_repair.sql','utf8')
await db.exec(sql); await db.exec(sql)  // idempotent: runs twice
await db.exec('select reload_retainers()')
const p = (await db.query("select name, checklist from projects order by name")).rows
const jobs = (await db.query("select jobname, schedule from cron.job")).rows
const idx = (await db.query("select count(*)::int n from pg_indexes where indexname in ('people_domain_id_idx','interactions_person_id_idx','interactions_occurred_at_idx')")).rows[0].n
const log = (await db.query("select count(*)::int n from activity_log where event_type='retainer.reloaded'")).rows[0].n
const grant = (await db.query("select has_function_privilege('authenticated','reload_retainers()','execute') g")).rows[0].g
const cfg = (await db.query("select proconfig from pg_proc where proname='reload_retainers'")).rows[0].proconfig
console.log(JSON.stringify({p, jobs, idx, log, grant, cfg}))
const ok = p[0].checklist.every(i => i.completed === false) && p[1].checklist[0].completed === true && jobs.length === 1 && idx === 3 && log === 1 && grant === false && String(cfg).includes('search_path=public')
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
