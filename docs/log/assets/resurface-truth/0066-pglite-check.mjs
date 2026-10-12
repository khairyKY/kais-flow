// Run: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there, `node 0066-pglite-check.mjs <repo root>` (4/4 on 2026-10-12).
// 0066: a snoozed resurfaced item comes back after its snooze, not after 14 days.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key, created_at timestamptz default now());
create table tasks (id uuid primary key, user_id uuid, status text default 'todo', deleted_at timestamptz, created_at timestamptz default now());
create table inbox_items (id uuid primary key, user_id uuid, status text default 'pending', deleted_at timestamptz, created_at timestamptz);
create table activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, entity_type text, entity_id uuid, created_at timestamptz default now());
create table resurfaced_log (id uuid primary key default gen_random_uuid(), user_id uuid not null, entity_type text not null, entity_id uuid not null,
  shown_on date not null, action text not null default 'pending', snoozed_until timestamptz, created_at timestamptz not null default now(), unique (user_id, shown_on));
`)
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
await db.exec(`
insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}');
-- 1: shown 3 days ago, snoozed 2 days (expired) -> comes back
insert into tasks (id, user_id, created_at) values ('${T(1)}', '${U(1)}', now() - interval '30 days');
insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action, snoozed_until) values ('${U(1)}', 'task', '${T(1)}', current_date - 3, 'review_later', now() - interval '1 day');
-- 2: shown 3 days ago, snoozed 10 days (still snoozed) -> held
insert into tasks (id, user_id, created_at) values ('${T(2)}', '${U(2)}', now() - interval '30 days');
insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action, snoozed_until) values ('${U(2)}', 'task', '${T(2)}', current_date - 3, 'review_later', now() + interval '7 days');
-- 3: shown 3 days ago, no action -> 14-day rest holds it
insert into tasks (id, user_id, created_at) values ('${T(3)}', '${U(3)}', now() - interval '30 days');
insert into resurfaced_log (user_id, entity_type, entity_id, shown_on) values ('${U(3)}', 'task', '${T(3)}', current_date - 3);
-- 4: dismissed long ago -> never again
insert into tasks (id, user_id, created_at) values ('${T(4)}', '${U(4)}', now() - interval '30 days');
insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('${U(4)}', 'task', '${T(4)}', current_date - 40, 'dismissed');
`)
await db.exec(readFileSync(`${root}/supabase/migrations/0066_resurface_snooze_truth.sql`, 'utf8'))
await db.exec('select do_resurface()')
const shown = async (u) => (await db.query(`select count(*)::int n from resurfaced_log where user_id = '${u}' and shown_on = current_date`)).rows[0].n
const checks = [['expired 2-day snooze comes back', await shown(U(1)), 1], ['10-day snooze still held', await shown(U(2)), 0], ['unacted row rests 14 days', await shown(U(3)), 0], ['dismissed never returns', await shown(U(4)), 0]]
let ok = 0
for (const [name, got, want] of checks) { const pass = got === want; ok += pass; console.log(`${pass ? 'PASS' : 'FAIL'} ${name} (got ${got}, want ${want})`) }
await db.exec(readFileSync(`${root}/supabase/migrations/0066_resurface_snooze_truth.sql`, 'utf8')) // idempotent re-run
console.log(`${ok}/${checks.length}`)
process.exit(ok === checks.length ? 0 : 1)
