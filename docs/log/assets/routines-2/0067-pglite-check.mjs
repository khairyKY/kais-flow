// 0067 check without Docker (the fix-backend 0062 recipe): `npm i @electric-sql/pglite@0.2` in a scratch
// dir, copy this file there, then `node 0067-pglite-check.mjs <repo root>`. A `routines` table as it
// stands after 0005 + 0019 + 0028 + 0046, two rows planted before 0067, then 0067 twice. The "old
// build" writes are what an installed app from before 0067 sends: PostgREST's upsert
// (insert … on conflict do update) with only the columns it knows — never plant or step_minutes.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create table routines (
  id uuid primary key default gen_random_uuid(), user_id uuid, name text not null, time_of_day text, clock_time text,
  cadence jsonb not null default '{"weekdays":[0,1,2,3,4,5,6]}', challenge_start date, challenge_end date,
  active boolean not null default true, steps jsonb not null default '[]'::jsonb, domain_id uuid,
  goal_days integer check (goal_days is null or goal_days between 1 and 3650),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
insert into routines (id, name, steps) values
  ('00000000-0000-4000-8000-000000000001', 'Stretch', '["Neck rolls", "Hamstrings"]'),
  ('00000000-0000-4000-8000-000000000002', 'Read', '[]');
`)
const sql = readFileSync(`${root}/supabase/migrations/0067_routine_plant.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent
const ok = (name, cond, d = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
  if (!cond) process.exitCode = 1
}
const rows = async (q) => (await db.query(q)).rows
const fails = async (q) => db.query(q).then(() => false, (e) => e.message)
const one = async (name) => (await rows(`select name, plant, steps, step_minutes from routines where name = '${name}'`))[0]

// ── plant ──
const col = await rows(`select column_default, is_nullable, data_type from information_schema.columns where table_name = 'routines' and column_name = 'plant'`)
ok('routines.plant text not null default vine', col[0]?.data_type === 'text' && col[0]?.is_nullable === 'NO' && /'vine'/.test(col[0]?.column_default ?? ''), JSON.stringify(col[0]))
const old = await rows(`select name, plant, steps, step_minutes from routines order by name`)
ok('routines planted before 0067 grow the vine', old.every((r) => r.plant === 'vine'), JSON.stringify(old.map((r) => r.plant)))
for (const p of ['vine', 'cherry', 'fern', 'clover', 'daisy']) {
  const err = await fails(`insert into routines (name, plant) values ('${p} routine', '${p}')`)
  ok(`accepts ${p}`, err === false, err || '')
}
const bad = await fails(`insert into routines (name, plant) values ('Rose', 'rose')`)
ok('rejects a species the picker does not list', /routines_plant_check/.test(bad || ''), bad || 'inserted')
const nul = await fails(`update routines set plant = null where name = 'Read'`)
ok('rejects a null plant', !!nul, nul || 'updated')

// ── step_minutes, beside plain-string steps ──
const sm = await rows(`select column_default, is_nullable, data_type from information_schema.columns where table_name = 'routines' and column_name = 'step_minutes'`)
ok('routines.step_minutes jsonb not null default []', sm[0]?.data_type === 'jsonb' && sm[0]?.is_nullable === 'NO' && /'\[\]'/.test(sm[0]?.column_default ?? ''), JSON.stringify(sm[0]))
ok('rows from before 0067: steps untouched (plain strings), step_minutes []', JSON.stringify(old.find((r) => r.name === 'Stretch').steps) === '["Neck rolls","Hamstrings"]' && old.every((r) => JSON.stringify(r.step_minutes) === '[]'), JSON.stringify(old.map((r) => [r.steps, r.step_minutes])))
const notArray = await fails(`update routines set step_minutes = '{"0": 2}' where name = 'Read'`)
ok('rejects a step_minutes that is not an array', /routines_step_minutes_array/.test(notArray || ''), notArray || 'updated')
const nullMin = await fails(`update routines set step_minutes = null where name = 'Read'`)
ok('rejects a null step_minutes', !!nullMin, nullMin || 'updated')

// The new client's save: strings in steps, aligned minutes (numbers or null) beside them.
await db.exec(`update routines set steps = '["Neck rolls", "Hamstrings", "Breathe"]', step_minutes = '[2, null, 5]', plant = 'fern' where name = 'Stretch'`)
let s = await one('Stretch')
ok('new client: string steps + aligned [2, null, 5] store and read back in order', JSON.stringify(s.steps) === '["Neck rolls","Hamstrings","Breathe"]' && JSON.stringify(s.step_minutes) === '[2,null,5]' && s.plant === 'fern', JSON.stringify(s))

// An old build edits that row (its cached copy, without the new columns): upsert of the columns it knows.
await db.exec(`insert into routines (id, name, steps, active) values ('00000000-0000-4000-8000-000000000001', 'Long stretch', '["Neck rolls", "Hamstrings", "Breathe"]', true)
  on conflict (id) do update set name = excluded.name, steps = excluded.steps, active = excluded.active`)
s = await one('Long stretch')
ok('old build: its upsert keeps step_minutes and plant as they were', JSON.stringify(s.step_minutes) === '[2,null,5]' && s.plant === 'fern', JSON.stringify(s))
// An old build reorders (Breathe to the top): the minutes stay by position — misaligned, accepted.
await db.exec(`update routines set steps = '["Breathe", "Neck rolls", "Hamstrings"]' where name = 'Long stretch'`)
s = await one('Long stretch')
ok('old build reorder: steps move, step_minutes stay by position (the accepted misalignment)', JSON.stringify(s.steps) === '["Breathe","Neck rolls","Hamstrings"]' && JSON.stringify(s.step_minutes) === '[2,null,5]', JSON.stringify(s))
// An old build plants a new routine: it never sends the new columns.
await db.exec(`insert into routines (name, steps) values ('Walk', '["Shoes on"]')`)
s = await one('Walk')
ok('old build: a new routine gets plant vine and step_minutes []', s.plant === 'vine' && JSON.stringify(s.step_minutes) === '[]' && JSON.stringify(s.steps) === '["Shoes on"]', JSON.stringify(s))

const constraints = await rows(`select conname from pg_constraint where conrelid = 'routines'::regclass and conname in ('routines_plant_check', 'routines_step_minutes_array') order by conname`)
ok('one of each named check after running twice', constraints.length === 2, JSON.stringify(constraints))
