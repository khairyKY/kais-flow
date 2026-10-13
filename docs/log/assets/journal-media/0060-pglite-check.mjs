// 0060 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there,
// then `node 0060-pglite-check.mjs <repo root>`. A stand-in for Supabase's storage schema (buckets,
// objects with RLS, storage.foldername as Supabase defines it), auth.uid() from the JWT claim GUC,
// then 0060 twice (idempotent) and the owner-folder policies exercised as `authenticated`.
// Not Supabase itself: the real Storage API sits in front of these tables, so this proves the SQL and
// the policy shape, not the bucket limits (size / mime are enforced by the Storage server).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const root = process.argv[2]
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
insert into storage.buckets (id, name, public) values ('captures', 'captures', false);
`)
const sql = readFileSync(`${root}/supabase/migrations/0060_journal_media.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql)
const ok = (name, cond, d = '') => console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${d}`)
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'

const bucket = (await db.query(`select * from storage.buckets where id = 'journal'`)).rows[0]
ok('bucket journal exists, private', bucket && bucket.public === false)
ok('bucket limit 1 MB', Number(bucket?.file_size_limit) === 1048576, bucket?.file_size_limit)
ok('bucket images only', JSON.stringify(bucket?.allowed_mime_types) === JSON.stringify(['image/jpeg', 'image/webp', 'image/png']), JSON.stringify(bucket?.allowed_mime_types))
const pols = (await db.query(`select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`)).rows
ok('four journal policies', pols.map((p) => `${p.policyname}:${p.cmd}`).join(',') === 'journal_objects_delete:DELETE,journal_objects_insert:INSERT,journal_objects_select:SELECT,journal_objects_update:UPDATE', JSON.stringify(pols))

async function as(uid, q) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try {
    return { rows: (await db.query(q)).rows }
  } catch (e) {
    return { error: e.message }
  } finally {
    await db.exec(`reset role;`)
  }
}
const ins = (uid, bucketId, name) => as(uid, `insert into storage.objects (bucket_id, name, owner) values ('${bucketId}', '${name}', '${uid}') returning id`)

ok('A uploads into A/', !(await ins(A, 'journal', `${A}/e1/p1.jpg`)).error)
ok('A cannot upload into B/', !!(await ins(A, 'journal', `${B}/e1/p2.jpg`)).error)
ok('A cannot upload at the bucket root', !!(await ins(A, 'journal', `p3.jpg`)).error)
ok('journal policies do not open captures', !!(await ins(A, 'captures', `${A}/c1/0.jpg`)).error)
await db.exec(`insert into storage.objects (bucket_id, name, owner) values ('journal', '${B}/e9/p9.jpg', '${B}')`)
const seenA = (await as(A, `select name from storage.objects where bucket_id = 'journal'`)).rows.map((r) => r.name)
ok('A sees only A/', JSON.stringify(seenA) === JSON.stringify([`${A}/e1/p1.jpg`]), JSON.stringify(seenA))
const delB = await as(A, `delete from storage.objects where name = '${B}/e9/p9.jpg' returning id`)
ok("A cannot delete B's photo", !delB.error && delB.rows.length === 0)
const delA = await as(A, `delete from storage.objects where name = '${A}/e1/p1.jpg' returning id`)
ok('A deletes own photo', !delA.error && delA.rows.length === 1)
const anon = await as('', `select name from storage.objects`)
ok('signed out sees nothing', !anon.error && anon.rows.length === 0, JSON.stringify(anon))
