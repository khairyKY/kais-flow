// 0067 check without Docker (the fix-backend 0062 recipe): `npm i @electric-sql/pglite@0.2` in a scratch
// dir, copy this file there, then `node 0067-pglite-check.mjs <repo root>`. A `routines` table as it
// stands after 0005 + 0019 + 0028 + 0046, two rows planted before 0067, then 0067 twice.
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

const col = await rows(`select column_default, is_nullable, data_type from information_schema.columns where table_name = 'routines' and column_name = 'plant'`)
ok('routines.plant text not null default vine', col[0]?.data_type === 'text' && col[0]?.is_nullable === 'NO' && /'vine'/.test(col[0]?.column_default ?? ''), JSON.stringify(col[0]))
const old = await rows(`select name, plant, steps from routines order by name`)
ok('routines planted before 0067 grow the vine', old.every((r) => r.plant === 'vine'), JSON.stringify(old.map((r) => r.plant)))
ok('their steps are untouched', JSON.stringify(old.find((r) => r.name === 'Stretch').steps) === '["Neck rolls","Hamstrings"]')
for (const p of ['vine', 'cherry', 'fern', 'clover', 'daisy']) {
  const err = await fails(`insert into routines (name, plant) values ('${p} routine', '${p}')`)
  ok(`accepts ${p}`, err === false, err || '')
}
const bad = await fails(`insert into routines (name, plant) values ('Rose', 'rose')`)
ok('rejects a species the picker does not list', /routines_plant_check/.test(bad || ''), bad || 'inserted')
const nul = await fails(`update routines set plant = null where name = 'Read'`)
ok('rejects null', !!nul, nul || 'updated')
// The client's new step shape rides the same jsonb column: bare strings and { text, minutes } mixed.
const mixed = `[{"text": "Neck rolls", "minutes": 2}, "Hamstrings", {"text": "Breathe", "minutes": 5}]`
await db.exec(`update routines set steps = '${mixed}', plant = 'fern' where name = 'Stretch'`)
const back = (await rows(`select steps, plant from routines where name = 'Stretch'`))[0]
ok('mixed steps (strings + {text, minutes}) store and read back in order', JSON.stringify(back.steps) === JSON.stringify(JSON.parse(mixed)) && back.plant === 'fern', JSON.stringify(back))
const constraints = await rows(`select conname from pg_constraint where conrelid = 'routines'::regclass and conname = 'routines_plant_check'`)
ok('one named check after running twice', constraints.length === 1)
