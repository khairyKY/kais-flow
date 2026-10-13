// 0070 check without Docker (the 0062/0067 recipe): `npm i @electric-sql/pglite@0.2` in a scratch dir, copy
// this file there, then `node 0070-pglite-check.mjs <repo root>`. A `captures` table as 0049 makes it, a
// row read before 0070, then 0070 twice; what capture-image writes after it, and what it must refuse.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create table captures (
  id uuid primary key default gen_random_uuid(), user_id uuid, storage_paths text[] not null default '{}',
  pages integer not null check (pages between 1 and 5), pages_read integer not null default 0, status text not null default 'queued',
  error text, title text, items jsonb not null default '[]', reviewed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days', photos_deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
insert into captures (id, pages, pages_read, status, items) values ('00000000-0000-4000-8000-000000000001', 1, 1, 'done', '[{"text":"a"}]');
`)
const sql = readFileSync(`${root}/supabase/migrations/0070_capture_drawings.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent
const ok = (name, cond, d = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
  if (!cond) process.exitCode = 1
}
const rows = async (q) => (await db.query(q)).rows
const fails = async (q) => db.query(q).then(() => false, (e) => e.message)
ok('a capture read before 0070 has no drawings ([])', JSON.stringify((await rows(`select drawings from captures`))[0].drawings) === '[]')
await db.exec(`update captures set drawings = '[{"what":"CPU → ready → run","box":[0.1,0.4,0.5,0.3],"page":0}]' where id = '00000000-0000-4000-8000-000000000001'`)
ok('capture-image writes the page’s drawings', (await rows(`select drawings->0->>'what' as w from captures`))[0].w === 'CPU → ready → run')
ok('an object (not a list) is refused', !!(await fails(`update captures set drawings = '{"what":"x"}'`)))
ok('null is refused', !!(await fails(`update captures set drawings = null`)))
ok('a new capture starts with []', JSON.stringify((await rows(`insert into captures (pages) values (1) returning drawings`))[0].drawings) === '[]')
