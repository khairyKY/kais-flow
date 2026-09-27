// 0040 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, then `node 0040-pglite-check.mjs <repo root>`.
// Stubs roles (with Supabase's default grants), auth, cron and the touched tables; loads 0036's ai_usage part;
// runs 0040 twice; runs the prune job's command; exercises ai_usage_take / ai_usage_bump; asserts.
// PGlite is one connection, so "atomic" here means the counters are single upserts that add up — true
// concurrency rides on Postgres's own `on conflict do update` row lock, as 0036 already does.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2] ?? 'D:/Coding/kais-flow'
const mig = (f) => readFileSync(`${root}/supabase/migrations/${f}`, 'utf8')
const db = new PGlite()
const userTables = ['tasks', 'inbox_items', 'routine_completions', 'domains', 'projects', 'areas', 'routines',
  'push_subscriptions', 'people', 'interactions', 'books', 'notes', 'quotes', 'commentary']
await db.exec(`
create role anon; create role authenticated; create role service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function set_updated_at() returns trigger language plpgsql as $f$ begin new.updated_at = now(); return new; end $f$;
create schema cron;
create table cron.job (jobid serial, jobname text unique, schedule text, command text);
create table cron.job_run_details (runid serial, jobid int, end_time timestamptz);
create function cron.schedule(n text, s text, c text) returns int language sql as $f$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid $f$;
create function cron.unschedule(n text) returns bool language sql as $f$ delete from cron.job where jobname=n returning true $f$;
${userTables.map((t) => `create table ${t} (id uuid primary key default gen_random_uuid(), user_id uuid);`).join('\n')}
create table activity_log (id uuid, user_id uuid, created_at timestamptz);
create table calendar_events (id uuid, user_id uuid, starts_at timestamptz);
create table embed_queue (id serial, status text, created_at timestamptz);
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into cron.job_run_details (end_time) values (now() - interval '8 days'), (now() - interval '6 days'), (null);
insert into embed_queue (status, created_at) values ('done', now() - interval '2 days'), ('done', now() - interval '1 hour'),
  ('pending', now() - interval '9 days'), ('error', now() - interval '9 days');`)
// 0036 part 1 only (ai_usage + ai_usage_bump); parts 2–3 need push_subscriptions/slipping.
const m36 = mig('0036_ai_quota_and_slipping.sql')
await db.exec(m36.slice(m36.indexOf('create table ai_usage'), m36.indexOf('-- 2 · push_subscriptions.endpoint:')))
const sql = mig('0040_scale_indexes_and_hygiene.sql')
await db.exec(sql); await db.exec(sql) // idempotent: runs twice

const q = async (s) => (await db.query(s)).rows
const idx = (await q(`select indexname from pg_indexes where schemaname='public' and indexname like '%user_id%'`)).map((r) => r.indexname)
const wantIdx = [...userTables.map((t) => `${t}_user_id_idx`), 'activity_log_user_id_created_at_idx', 'calendar_events_user_id_starts_at_idx']
const jobs = await q(`select jobname, schedule, command from cron.job`)
await db.exec(jobs.find((j) => j.jobname === 'cron-history-prune').command)
const runsLeft = (await q(`select count(*)::int n from cron.job_run_details`))[0].n
const embedLeft = (await q(`select status, created_at > now() - interval '1 day' fresh from embed_queue order by id`))

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
const take = async (u, lim = 2, kind = 'chat') => (await q(`select * from ai_usage_take('${u}', '${kind}', ${lim})`))[0]
const takes = [await take(A), await take(A), await take(A), await take(B), await take(A, 2, 'stt')]
const burst = await Promise.all(Array.from({ length: 20 }, () => take(B, 1000, 'parse')))
const parseGlobal = Math.max(...burst.map((r) => r.global_count))
const bumpAfter = (await q(`select ai_usage_bump('${A}', 'chat') n`))[0].n // per-user counter: 3 takes → next is 4
const global = await q(`select kind, count from ai_usage_global order by kind`)
const priv = (await q(`select has_function_privilege('anon','ai_usage_take(uuid,text,integer)','execute') anon,
  has_function_privilege('authenticated','ai_usage_take(uuid,text,integer)','execute') auth,
  has_function_privilege('service_role','ai_usage_take(uuid,text,integer)','execute') svc,
  has_function_privilege('authenticated','ai_usage_bump(uuid,text)','execute') bump_auth,
  has_table_privilege('authenticated','ai_usage_global','select') tbl_auth,
  has_table_privilege('anon','ai_usage_global','insert') tbl_anon,
  (select relrowsecurity from pg_class where relname='ai_usage_global') rls,
  (select prosecdef from pg_proc where proname='ai_usage_take') definer,
  (select proconfig from pg_proc where proname='ai_usage_take') cfg`))[0]

console.log(JSON.stringify({ idx: idx.length, jobs: jobs.map((j) => [j.jobname, j.schedule]), runsLeft, embedLeft, takes, parseGlobal, bumpAfter, global, priv }, null, 1))
const checks = {
  indexes: wantIdx.every((i) => idx.includes(i)),
  cronOnce: jobs.length === 1 && jobs[0].schedule === '15 3 * * *',
  pruneRuns: runsLeft === 2, // the 8-day-old run goes; 6-day-old and still-running (null end_time) stay
  pruneEmbed: JSON.stringify(embedLeft) === JSON.stringify([{ status: 'done', fresh: true }, { status: 'pending', fresh: false }, { status: 'error', fresh: false }]),
  userCounts: takes.map((t) => t.user_count).join() === '1,2,3,1,1',
  globalCounts: takes.map((t) => t.global_count).join() === '1,2,,3,1', // over-own-limit call (3rd) not counted globally
  burst: parseGlobal === 20 && new Set(burst.map((r) => r.global_count)).size === 20,
  bumpUnchanged: bumpAfter === 4,
  globalRows: JSON.stringify(global) === JSON.stringify([{ kind: 'chat', count: 3 }, { kind: 'parse', count: 20 }, { kind: 'stt', count: 1 }]),
  grants: !priv.anon && !priv.auth && priv.svc && !priv.bump_auth && !priv.tbl_auth && !priv.tbl_anon && priv.rls && priv.definer && String(priv.cfg).includes('search_path=public, pg_temp'),
}
console.log(checks)
const ok = Object.values(checks).every(Boolean)
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
