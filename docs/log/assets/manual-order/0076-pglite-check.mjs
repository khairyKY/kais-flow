// 0076 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there,
// then `node 0076-pglite-check.mjs <repo root>`. A minimal tasks table, then 0076 twice (idempotent).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
await db.exec(`create table tasks (id uuid primary key, title text, due_at timestamptz, top3_rank smallint);
insert into tasks values ('10000000-0000-4000-8000-000000000001', 'old row', now(), null);`)
const sql = readFileSync(`${root}/supabase/migrations/0076_task_sort_order.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql)
check('0076 runs twice', true)
const col = (await db.query(`select data_type, is_nullable, column_default from information_schema.columns where table_name = 'tasks' and column_name = 'sort_order'`)).rows[0]
check('sort_order is a nullable double with no default', col?.data_type === 'double precision' && col.is_nullable === 'YES' && col.column_default == null, JSON.stringify(col))
check('an existing row reads null (sorts by its date)', (await db.query(`select sort_order from tasks`)).rows[0].sort_order === null)
// The outbox's upsert with the new key, then an old build's upsert without it: the order survives.
await db.exec(`insert into tasks (id, title, sort_order) values ('10000000-0000-4000-8000-000000000001', 'moved', 1760425200000.5)
  on conflict (id) do update set title = excluded.title, sort_order = excluded.sort_order`)
await db.exec(`insert into tasks (id, title) values ('10000000-0000-4000-8000-000000000001', 'old build edit')
  on conflict (id) do update set title = excluded.title`)
const r = (await db.query(`select title, sort_order from tasks`)).rows[0]
check('a fractional key round-trips; an old build\'s upsert leaves it', r.title === 'old build edit' && r.sort_order === 1760425200000.5, JSON.stringify(r))
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
