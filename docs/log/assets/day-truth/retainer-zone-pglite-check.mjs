// A30 "the retainer reload uses each user's zone" — already true since 0050 (the audit cited 0047's
// superseded body). This runs 0050's reload_retainers() as written, without Docker: `npm i
// @electric-sql/pglite@0.2` in a scratch dir, copy this file there, `node retainer-zone-pglite-check.mjs
// <repo root>`. now() is the real clock, so the instants below are built from each zone's own month start
// (valid any day except within a day of a month's turn).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
const ok = (name, cond, d = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
  if (!cond) process.exitCode = 1
}
const rows = async (q) => (await db.query(q)).rows

await db.exec(`
create table projects (id uuid primary key, user_id uuid, name text, type text, status text not null default 'active', checklist jsonb default '[]',
  updated_at timestamptz default now(), deleted_at timestamptz);
create table tasks (id uuid primary key, user_id uuid, project_id uuid, title text, status text not null default 'todo', due_at timestamptz,
  reminder_at timestamptz, reminder_sent boolean not null default false, someday boolean not null default false, recurrence_rule text,
  deleted_at timestamptz, updated_at timestamptz default now());
create table app_settings (user_id uuid primary key, timezone text);
create table activity_log (id uuid primary key, user_id uuid, event_type text, entity_type text, entity_id uuid, payload jsonb, created_at timestamptz default now());
`)
const sql = readFileSync(`${root}/supabase/migrations/0050_user_timezones.sql`, 'utf8')
const fn = sql.slice(sql.indexOf('create or replace function reload_retainers()'), sql.indexOf('$$ language plpgsql security definer set search_path = public;') + 64)
await db.exec(fn)

// Three owners: far east (UTC+14), far west (UTC-11), and one with no settings row (Africa/Cairo).
const users = { east: ['0a', 'Pacific/Kiritimati'], west: ['0b', 'Pacific/Pago_Pago'], none: ['0c', null] }
const uid = (k) => `00000000-0000-4000-8000-0000000000${users[k][0]}`
for (const k of Object.keys(users)) {
  if (users[k][1]) await db.exec(`insert into app_settings values ('${uid(k)}', '${users[k][1]}')`)
  await db.exec(`insert into projects (id, user_id, name, type) values ('${uid(k).replace('0000000000', '1111111111')}', '${uid(k)}', 'Retainer ${k}', 'retainer')`)
}
// One task each, due at the same instant: midnight UTC on the 1st of this month. That is after the
// month began in Kiritimati (its 1st started 14h earlier) and in Cairo, but before it began in Pago Pago
// (its 1st starts at 11:00 UTC) — so only the west owner's task is "last month's" and rolls.
const [{ m }] = await rows(`select to_char(date_trunc('month', now() at time zone 'UTC'), 'YYYY-MM-DD') as m`)
const due = `${m}T00:00:00Z`
for (const k of Object.keys(users)) {
  await db.exec(`insert into tasks (id, user_id, project_id, title, due_at) values ('${uid(k).replace('0000000000', '2222222222')}', '${uid(k)}', '${uid(k).replace('0000000000', '1111111111')}', 'Monthly report', '${due}')`)
}
await db.exec(`select reload_retainers()`)
const after = Object.fromEntries((await rows(`select user_id, to_char(due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as d from tasks`)).map((r) => [r.user_id, r.d]))
ok('east (UTC+14): due after its month began → not rolled', after[uid('east')] === `${m}T00:00`, after[uid('east')])
ok('no settings row (Cairo): due after its month began → not rolled', after[uid('none')] === `${m}T00:00`, after[uid('none')])
// Pago Pago: 13:00 on the 31st/30th of last month, local → 13:00 on this 1st, local = 00:00 UTC on the 2nd.
const second = m.slice(0, 8) + '02'
ok("west (UTC-11): due before ITS month began → rolled to the 1st at the same wall time, on its owner's clock", after[uid('west')] === `${second}T00:00`, after[uid('west')])
const logged = await rows(`select user_id from activity_log where event_type = 'retainer.reloaded' order by user_id`)
ok('each retainer reloaded once (its retainer.reloaded row)', logged.length === 3, JSON.stringify(logged))
await db.exec(`select reload_retainers()`) // the hourly window runs it again
ok('a second run in the same month changes nothing', (await rows(`select count(*)::int as n from activity_log`))[0].n === 3)
