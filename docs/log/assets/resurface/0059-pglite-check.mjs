// 0059 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there,
// then `node 0059-pglite-check.mjs <repo root>`. Minimal tables as 0008 created them, then 0059 twice (idempotent).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key, created_at timestamptz default now());
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table tasks (id uuid primary key, user_id uuid, status text default 'todo', deleted_at timestamptz, created_at timestamptz);
create table inbox_items (id uuid primary key, user_id uuid, status text default 'pending', deleted_at timestamptz, created_at timestamptz);
create table activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, entity_type text, entity_id uuid, created_at timestamptz default now());
create table resurfaced_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('task', 'inbox_item')),
  entity_id uuid not null,
  shown_on date not null,
  action text not null default 'pending' check (action in ('pending', 'converted', 'review_later', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, shown_on)
);`)
const sql = readFileSync(`${root}/supabase/migrations/0059_resurface_settles.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql)
const U = '00000000-0000-4000-8000-000000000001'
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const old = `now() - interval '30 days'`
await db.exec(`insert into auth.users values ('${U}');
insert into tasks values ('${id(1)}','${U}','done',null,${old}), ('${id(2)}','${U}','todo',now(),${old}), ('${id(3)}','${U}','todo',null,${old}),
  ('${id(4)}','${U}','todo',null,${old}), ('${id(5)}','${U}','todo',null,${old}), ('${id(6)}','${U}','todo',null,now());
insert into inbox_items values ('${id(7)}','${U}','dismissed',null,${old}), ('${id(8)}','${U}','pending',now(),${old}), ('${id(9)}','${U}','filed',null,${old});
-- 3: let go long ago; 4: snoozed for 30 more days (shown 20 days ago); 9: filed note, eligible
insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('${U}','task','${id(3)}', current_date - 40, 'dismissed');
insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action, snoozed_until) values ('${U}','task','${id(4)}', current_date - 20, 'review_later', now() + interval '30 days');
`)
const ok = (name, cond, d = '') => console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
// 'done' is accepted now; a bogus action still is not
await db.exec(`insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('${U}','task','${id(5)}', current_date - 100, 'done')`)
ok('action check accepts done', true)
let bad = false
try { await db.exec(`insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('${U}','task','${id(5)}', current_date - 101, 'later')`) } catch { bad = true }
ok('action check still rejects unknown', bad)
const picks = new Map()
for (let i = 0; i < 400; i++) {
  await db.exec(`delete from resurfaced_log where shown_on = current_date; select do_resurface();`)
  const r = await db.query(`select entity_id from resurfaced_log where shown_on = current_date`)
  const e = r.rows[0]?.entity_id ?? 'none'
  picks.set(e, (picks.get(e) ?? 0) + 1)
}
console.log(Object.fromEntries(picks))
const never = [1, 2, 3, 4, 6, 7, 8].map(id)
ok('never picks done/trashed/let-go/snoozed/too-new tasks or dismissed/trashed notes', never.every((e) => !picks.has(e)))
ok('picks the eligible task and the filed note', picks.has(id(5)) && picks.has(id(9)))
// The +20 boost is gone: a review_later history no longer changes the weight.
const src = (await db.query(`select prosrc from pg_proc where proname = 'do_resurface'`)).rows[0].prosrc
ok('no +20 review_later boost in the body', !/then 20/.test(src) && !/'review_later'/.test(src))
const g = await db.query(`select has_function_privilege('authenticated', 'do_resurface()', 'execute') as a`)
ok('execute still revoked from authenticated', g.rows[0].a === false)
