// 0072 check without Docker (the fix-backend 0062 recipe): `npm i @electric-sql/pglite@0.2` in a scratch
// dir, copy this file there, then `node 0072-pglite-check.mjs <repo root>`. The tables 0072 reads, as
// they stand after 0053; the view as 0053 left it (the "before"), then 0072 twice.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
const ok = (name, cond, d = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
  if (!cond) process.exitCode = 1
}
const rows = async (q) => (await db.query(q)).rows

const U = '00000000-0000-4000-8000-0000000000a1'
await db.exec(`
create table domains (id uuid primary key, user_id uuid, name text, created_at timestamptz not null default now(), deleted_at timestamptz);
create table projects (id uuid primary key, user_id uuid, domain_id uuid, name text, status text not null default 'active', created_at timestamptz not null default now(), deleted_at timestamptz);
create table areas (id uuid primary key, user_id uuid, domain_id uuid, name text, created_at timestamptz not null default now(), deleted_at timestamptz);
create table tasks (id uuid primary key, user_id uuid, project_id uuid, domain_id uuid, area_id uuid);
create table activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, event_type text, entity_type text, entity_id uuid, created_at timestamptz not null default now());
create table routines (id uuid primary key default gen_random_uuid(), user_id uuid, name text not null, active boolean not null default true,
  steps jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- three projects, none touched for 20 days: one active, one archived (Archive / Finish), one in Trash
insert into projects (id, user_id, name, status, created_at, deleted_at) values
  ('00000000-0000-4000-8000-0000000000b1', '${U}', 'Garden club', 'active', now() - interval '20 days', null),
  ('00000000-0000-4000-8000-0000000000b2', '${U}', 'Old site', 'archived', now() - interval '30 days', null),
  ('00000000-0000-4000-8000-0000000000b3', '${U}', 'Binned', 'active', now() - interval '30 days', now() - interval '1 day');
-- the archive itself logged project.archived 20 days ago
insert into activity_log (user_id, event_type, entity_type, entity_id, created_at) values
  ('${U}', 'project.archived', 'project', '00000000-0000-4000-8000-0000000000b2', now() - interval '20 days');
insert into routines (id, name, steps) values ('00000000-0000-4000-8000-0000000000c1', 'Stretch', '["Neck rolls"]');
`)
const before = readFileSync(`${root}/supabase/migrations/0053_trash_domains.sql`, 'utf8')
await db.exec(before.slice(before.indexOf('create or replace view slipping')))
const names = async () => (await rows(`select entity_name, round(days_since) as d from slipping where entity_type = 'project' order by entity_name`)).map((r) => `${r.entity_name} ${r.d}d`)
const was = await names()
ok('before 0072 (0053): the archived project is slipping', was.includes('Old site 20d'), JSON.stringify(was))

const sql = readFileSync(`${root}/supabase/migrations/0072_day_truth.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent

// ── A23: slipping ──
const now = await names()
ok('after 0072: the archived project is not slipping', !now.some((n) => n.startsWith('Old site')), JSON.stringify(now))
ok('after 0072: the active one still is, the trashed one still is not', now.includes('Garden club 20d') && !now.some((n) => n.startsWith('Binned')), JSON.stringify(now))
await db.exec(`update projects set status = 'active' where name = 'Old site'`)
const back = await names()
ok('restored from the archive: slipping again', back.includes('Old site 20d'), JSON.stringify(back))
const cols = await rows(`select column_name from information_schema.columns where table_name = 'slipping' order by ordinal_position`)
ok('same columns as 0053', cols.map((c) => c.column_name).join() === 'entity_type,entity_id,entity_name,last_touch,days_since', cols.map((c) => c.column_name).join())
