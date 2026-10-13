// 0078 check without Docker (the 0066/0070 recipe): `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this
// file there, then `node 0078-pglite-check.mjs <repo root>`. Tables as 0008/0021/0023/0059 make them (the
// 0008 inline entity_type check included, so 0078 must replace it by its real name). One user per scene,
// so each scene's only candidate decides what do_resurface() may pick.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key, created_at timestamptz default now());
create table tasks (id uuid primary key, user_id uuid, status text default 'todo', deleted_at timestamptz, created_at timestamptz default now());
create table inbox_items (id uuid primary key, user_id uuid, status text default 'pending', deleted_at timestamptz, created_at timestamptz);
create table journal_entries (id uuid primary key, user_id uuid, body text not null, entry_date date not null, deleted_at timestamptz, created_at timestamptz default now());
create table quotes (id uuid primary key, user_id uuid, text text not null, created_at timestamptz default now());
create table notes (id uuid primary key, user_id uuid, title text, body text not null, created_at timestamptz default now());
create table activity_log (id uuid primary key default gen_random_uuid(), user_id uuid, entity_type text, entity_id uuid, created_at timestamptz default now());
create table resurfaced_log (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  entity_type text not null check (entity_type in ('task', 'inbox_item')), entity_id uuid not null,
  shown_on date not null, action text not null default 'pending', snoozed_until timestamptz, created_at timestamptz not null default now(), unique (user_id, shown_on));
`)
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const E = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const users = []
const scene = async (sql) => {
  const u = U(users.length + 1)
  users.push(u)
  await db.exec(`insert into auth.users (id) values ('${u}'); ${sql.replaceAll('$U', u).replaceAll('$E', E(users.length))}`)
  return u
}

const ok = (name, cond, d = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${d === '' ? '' : ` (${d})`}`)
  if (!cond) process.exitCode = 1
}
const fails = (q) => db.query(q).then(() => false, (e) => e.message)
ok('before 0078 the log refuses a journal entry', !!(await fails(`insert into resurfaced_log (user_id, entity_type, entity_id, shown_on) values ('${U(1)}', 'journal_entry', '${E(1)}', current_date - 500)`)))

const sql = readFileSync(`${root}/supabase/migrations/0078_resurface_memories.sql`, 'utf8')
await db.exec(sql)

// ── 0066's rules, still holding (a task each) ──
const snoozeOver = await scene(`insert into tasks (id, user_id, created_at) values ('$E', '$U', now() - interval '30 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action, snoozed_until) values ('$U', 'task', '$E', current_date - 3, 'review_later', now() - interval '1 day');`)
const snoozeOn = await scene(`insert into tasks (id, user_id, created_at) values ('$E', '$U', now() - interval '30 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action, snoozed_until) values ('$U', 'task', '$E', current_date - 3, 'review_later', now() + interval '7 days');`)
const resting = await scene(`insert into tasks (id, user_id, created_at) values ('$E', '$U', now() - interval '30 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on) values ('$U', 'task', '$E', current_date - 3);`)
const letGo = await scene(`insert into tasks (id, user_id, created_at) values ('$E', '$U', now() - interval '30 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('$U', 'task', '$E', current_date - 40, 'dismissed');`)
const youngTask = await scene(`insert into tasks (id, user_id, created_at) values ('$E', '$U', now() - interval '1 day');`)
const doneTask = await scene(`insert into tasks (id, user_id, status, created_at) values ('$E', '$U', 'done', now() - interval '30 days');`)
const pickedToday = await scene(`insert into tasks (id, user_id, created_at) values ('$E', '$U', now() - interval '30 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on) values ('$U', 'task', '${E(99)}', current_date);`)

// ── the new kinds ──
const oldPage = await scene(`insert into journal_entries (id, user_id, body, entry_date, created_at) values ('$E', '$U', 'Walked by the river', current_date - 45, now() - interval '45 days');`)
const recentPage = await scene(`insert into journal_entries (id, user_id, body, entry_date, created_at) values ('$E', '$U', 'Yesterday-ish', current_date - 10, now() - interval '10 days');`)
const photoOnlyPage = await scene(`insert into journal_entries (id, user_id, body, entry_date, created_at) values ('$E', '$U', '   ', current_date - 90, now() - interval '90 days');`)
const trashedPage = await scene(`insert into journal_entries (id, user_id, body, entry_date, deleted_at, created_at) values ('$E', '$U', 'Gone', current_date - 90, now(), now() - interval '90 days');`)
const snoozedPage = await scene(`insert into journal_entries (id, user_id, body, entry_date, created_at) values ('$E', '$U', 'Held', current_date - 90, now() - interval '90 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action, snoozed_until) values ('$U', 'journal_entry', '$E', current_date - 2, 'review_later', now() + interval '3 days');`)
const keptPage = await scene(`insert into journal_entries (id, user_id, body, entry_date, created_at) values ('$E', '$U', 'Kept a while', current_date - 90, now() - interval '90 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('$U', 'journal_entry', '$E', current_date - 20, 'converted');`)
const oldQuote = await scene(`insert into quotes (id, user_id, text, created_at) values ('$E', '$U', 'The best time to plant a tree…', now() - interval '20 days');`)
const newQuote = await scene(`insert into quotes (id, user_id, text, created_at) values ('$E', '$U', 'Fresh', now() - interval '5 days');`)
const letGoQuote = await scene(`insert into quotes (id, user_id, text, created_at) values ('$E', '$U', 'Let go', now() - interval '200 days');
  insert into resurfaced_log (user_id, entity_type, entity_id, shown_on, action) values ('$U', 'quote', '$E', current_date - 60, 'dismissed');`)
const oldNote = await scene(`insert into notes (id, user_id, title, body, created_at) values ('$E', '$U', null, 'Ideas for the garden', now() - interval '20 days');`)
const titleNote = await scene(`insert into notes (id, user_id, title, body, created_at) values ('$E', '$U', 'Only a title', '', now() - interval '20 days');`)
const emptyNote = await scene(`insert into notes (id, user_id, title, body, created_at) values ('$E', '$U', ' ', '', now() - interval '20 days');`)
// Someone else's old page: this user has nothing of their own, so nothing comes up — the owner gets it.
const OWNER = U(999)
const stranger = await scene(`insert into auth.users (id) values ('${OWNER}');
  insert into journal_entries (id, user_id, body, entry_date, created_at) values ('$E', '${OWNER}', 'Not yours', current_date - 90, now() - interval '90 days');`)

await db.exec(sql) // idempotent: a second run over seeded rows
await db.exec('select do_resurface()')
await db.exec('select do_resurface()') // a second run the same day adds nothing

const today = async (u) => (await db.query(`select entity_type, entity_id from resurfaced_log where user_id = '${u}' and shown_on = current_date`)).rows
const picks = async (u, type) => {
  const r = await today(u)
  return r.length === 1 && r[0].entity_type === type ? r[0].entity_id : null
}
const none = async (u) => (await today(u)).length === 0

ok('0066: an expired 2-day snooze comes back', (await picks(snoozeOver, 'task')) === E(1))
ok('0066: a 10-day snooze is still held', await none(snoozeOn))
ok('0066: a pick nobody acted on rests 14 days', await none(resting))
ok('0066: a let-go task never returns', await none(letGo))
ok('a task younger than 3 days waits', await none(youngTask))
ok('a done task is never picked', await none(doneTask))
ok('one pick per day: a user already picked today gets nothing more', (await today(pickedToday)).length === 1 && (await today(pickedToday))[0].entity_id === E(99))
ok('a journal entry from 45 days back comes up', (await picks(oldPage, 'journal_entry')) === E(8))
ok('a journal entry from 10 days back waits (30-day window)', await none(recentPage))
ok('a journal entry with no words (photo / mood only) is never picked', await none(photoOnlyPage))
ok('a journal entry in Trash is never picked', await none(trashedPage))
ok('0066 holds for journal entries: a snooze holds it', await none(snoozedPage))
ok('a kept (acted-on) journal entry may come round again after its rest', (await picks(keptPage, 'journal_entry')) === E(13))
ok('a quote saved 20 days ago comes up', (await picks(oldQuote, 'quote')) === E(14))
ok('a quote saved 5 days ago waits (14-day window)', await none(newQuote))
ok('a let-go quote never returns', await none(letGoQuote))
ok('a library note saved 20 days ago comes up', (await picks(oldNote, 'note')) === E(17))
ok('a note with only a title comes up', (await picks(titleNote, 'note')) === E(18))
ok('a note with no words is never picked', await none(emptyNote))
ok('another user’s journal is never this user’s pick', await none(stranger))
ok('…it is its owner’s', (await picks(OWNER, 'journal_entry')) === E(20))
ok('the log now takes journal_entry / quote / note', !(await fails(`insert into resurfaced_log (user_id, entity_type, entity_id, shown_on) values ('${U(2)}', 'note', '${E(1)}', current_date - 400)`)))
ok('…and still refuses anything else (a book)', !!(await fails(`insert into resurfaced_log (user_id, entity_type, entity_id, shown_on) values ('${U(2)}', 'book', '${E(1)}', current_date - 401)`)))
ok('do_resurface stays out of reach of anon / authenticated', !(await db.query(`select has_function_privilege('authenticated', 'do_resurface()', 'execute') as x`)).rows[0].x)
console.log(process.exitCode ? 'FAILED' : 'all passed')
