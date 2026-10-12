// 0064 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, copy this file there,
// then `node 0064-pglite-check.mjs <repo root>`. Stand-in tables carry exactly the columns
// search_hybrid reads (the real generated search_tsv on tasks / inbox_items, pgvector embeddings),
// owner RLS on each as in the real migrations, auth.uid() from the JWT claim GUC. Then 0054 (the
// definition 0064 replaces) and 0064 twice, called as `authenticated` for two users.
// Not Supabase itself: proves the SQL, the user scoping and the score bands the app relies on
// (features/search/searchState.ts LITERAL_FLOOR), not ranking quality on real data.
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { readFileSync } from 'fs'

const root = process.argv[2]
const db = new PGlite({ extensions: { vector } })
const tables = ['tasks', 'inbox_items', 'people', 'calendar_events', 'projects', 'areas', 'journal_entries', 'books', 'notes', 'quotes']
await db.exec(`
create extension vector;
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create table tasks (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, notes text, deleted_at timestamptz, embedding vector(384),
  search_tsv tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(notes, ''))) stored);
create table inbox_items (id uuid primary key default gen_random_uuid(), user_id uuid not null, raw_text text not null, deleted_at timestamptz, embedding vector(384),
  search_tsv tsvector generated always as (to_tsvector('english', raw_text)) stored);
create table people (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, facts jsonb not null default '[]');
create table calendar_events (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, deleted_at timestamptz);
create table projects (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, completion_summary text, deleted_at timestamptz);
create table areas (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, description text, deleted_at timestamptz);
create table journal_entries (id uuid primary key default gen_random_uuid(), user_id uuid not null, body text not null, transcript text, deleted_at timestamptz);
create table books (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, author text);
create table notes (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text, body text not null, tags text[] not null default '{}');
create table quotes (id uuid primary key default gen_random_uuid(), user_id uuid not null, text text not null, author text, source text);
${tables.map((t) => `alter table ${t} enable row level security; create policy ${t}_owner on ${t} for all using (user_id = auth.uid()) with check (user_id = auth.uid()); grant all on ${t} to authenticated;`).join('\n')}
`)
await db.exec(readFileSync(`${root}/supabase/migrations/0054_search_areas_skip_trashed.sql`, 'utf8'))
const sql = readFileSync(`${root}/supabase/migrations/0064_search_library.sql`, 'utf8')
await db.exec(sql)
await db.exec(sql)

let failed = 0
const ok = (name, cond, d = '') => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${d !== '' ? ' — ' + d : ''}`)
}
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
// A unit-ish vector along `axis`, tilted toward axis+1 by `tilt` — cosine distance grows with tilt.
const vec = (axis, tilt = 0) => `[${Array.from({ length: 384 }, (_, i) => (i === axis ? 1 : i === axis + 1 ? tilt : 0)).join(',')}]`

await db.exec(`
insert into books (user_id, title, author) values
  ('${A}', 'Four Thousand Weeks', 'Oliver Burkeman'), ('${B}', 'Four Thousand Weeks', 'Oliver Burkeman (B copy)');
insert into notes (user_id, title, body, tags) values
  ('${A}', 'Pricing model ideas', 'Flat monthly fee, all features included.', '{business}'),
  ('${A}', null, 'Efficiency trap maps onto the inbox — clearing it faster refills it faster.', '{productivity}'),
  ('${A}', '', 'Untitled note about the herbarium', '{}'),
  ('${B}', 'Pricing model ideas', 'B''s private note', '{}');
insert into quotes (user_id, text, author, source) values
  ('${A}', 'Attention is the beginning of devotion.', 'Mary Oliver', 'Devotions'),
  ('${A}', 'The garden does not hurry.', null, null),
  ('${B}', 'Attention is the beginning of devotion.', 'Mary Oliver', 'B copy');
insert into tasks (user_id, title, notes, embedding) values
  ('${A}', 'Pay the electricity bill', null, '${vec(0)}'),
  ('${A}', 'Water the basil', 'and the mint', null);
insert into tasks (user_id, title) select '${A}', 'basil pot soil ' || g from generate_series(1, 45) g;
`)

async function search(uid, q, emb = vec(300), limit = 50) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try {
    return (await db.query(`select entity_type, entity_id, title, snippet, score from search_hybrid($1, $2::vector, $3)`, [q, emb, limit])).rows
  } finally {
    await db.exec('reset role;')
  }
}
const types = (rows) => rows.map((r) => `${r.entity_type}:${r.title}`)

// 1 · Library arms
let r = await search(A, 'Burkeman')
ok('book found by author', r.some((x) => x.entity_type === 'book' && x.title === 'Four Thousand Weeks' && x.snippet === 'Oliver Burkeman'), JSON.stringify(types(r)))
r = await search(A, 'four thousand weeks')
ok('book found by its title (FTS, 3 words)', r.length === 1 && r[0].entity_type === 'book', JSON.stringify(types(r)))
r = await search(A, 'four thou')
ok('a half-typed title finds the book (lexical tier 2)', r[0]?.entity_type === 'book' && r[0].score >= 2, JSON.stringify(r.map((x) => [x.entity_type, x.score])))
r = await search(A, 'monthly fee')
ok('note found by its body, titled by its title', r.some((x) => x.entity_type === 'note' && x.title === 'Pricing model ideas'), JSON.stringify(types(r)))
r = await search(A, 'business')
ok('note found by a tag', r.some((x) => x.entity_type === 'note' && x.title === 'Pricing model ideas'), JSON.stringify(types(r)))
r = await search(A, 'efficiency trap')
ok('an untitled note is titled by its body', r.some((x) => x.entity_type === 'note' && x.title.startsWith('Efficiency trap maps')), JSON.stringify(types(r)))
r = await search(A, 'herbarium')
ok('an empty-string title also falls back to the body', r.some((x) => x.entity_type === 'note' && x.title === 'Untitled note about the herbarium'), JSON.stringify(types(r)))
r = await search(A, 'devotion')
ok('quote found by its text, snippet "author · source"', r.some((x) => x.entity_type === 'quote' && x.snippet === 'Mary Oliver · Devotions'), JSON.stringify(r.map((x) => [x.entity_type, x.snippet])))
r = await search(A, 'Devotions Oliver')
ok('quote found by author + source', r.some((x) => x.entity_type === 'quote'), JSON.stringify(types(r)))
r = await search(A, 'garden hurry')
ok('a quote without author/source has a null snippet', r.some((x) => x.entity_type === 'quote' && x.snippet === null), JSON.stringify(r.map((x) => [x.entity_type, x.snippet])))
const bookId = (await search(A, 'Burkeman')).find((x) => x.entity_type === 'book')?.entity_id
r = await search(A, 'four thousand')
ok('a row found by FTS and lexical merges into one hit', r.filter((x) => x.entity_id === bookId).length === 1, JSON.stringify(types(r)))

// 2 · User scoping — B's copies never reach A, and the other way round
r = await search(A, 'Burkeman')
ok("A never sees B's book", !r.some((x) => (x.snippet ?? '').includes('B copy')), JSON.stringify(r.map((x) => x.snippet)))
r = await search(A, 'pricing model')
ok("A never sees B's note", r.filter((x) => x.entity_type === 'note').length === 1, JSON.stringify(types(r)))
r = await search(B, 'devotion')
ok("B sees only B's quote", r.length === 1 && r[0].snippet === 'Mary Oliver · B copy', JSON.stringify(r.map((x) => x.snippet)))
r = await search('', 'devotion')
ok('signed out: nothing', r.length === 0, JSON.stringify(r))

// 3 · The other arms are untouched
r = await search(A, 'basil')
ok('tasks still found (lexical + FTS)', r.some((x) => x.title === 'Water the basil'), r.length)
r = await search(A, 'mint')
ok('task notes still searched', r.some((x) => x.title === 'Water the basil'), JSON.stringify(types(r)))

// 4 · The score bands the app reads (searchState.ts LITERAL_FLOOR = 0.009)
r = await search(A, 'basil pot soil', vec(300), 60)
const literalMin = Math.min(...r.map((x) => x.score))
ok('3+ words, 45 FTS matches: the 40th (weakest kept) scores 1/100', r.length === 40 && Math.abs(literalMin - 0.01) < 1e-12, `${r.length} rows, min ${literalMin}`)
r = await search(A, 'zzqx', vec(0, 0.1))
ok('no word in common: only the vector neighbour comes back', r.length === 1 && r[0].title === 'Pay the electricity bill', JSON.stringify(types(r)))
ok('… and it scores below the literal floor (0.5/61)', r[0] && r[0].score < 0.009 && Math.abs(r[0].score - 0.5 / 61) < 1e-12, r[0]?.score)
r = await search(A, 'electricity', vec(0, 0.1))
ok('found by both arms: above the floor', r[0]?.title === 'Pay the electricity bill' && r[0].score >= 0.009, r[0]?.score)
r = await search(A, 'zzqx', vec(0, 2)) // cos = 1/√5 → distance ≈ 0.55 (45°, tilt 1, is still only 0.29)
ok('a neighbour past distance 0.35 is not returned', r.length === 0, JSON.stringify(types(r)))

// 5 · Grants and security mode unchanged
const fn = (await db.query(`select prosecdef, provolatile from pg_proc where proname = 'search_hybrid'`)).rows
ok('one search_hybrid, SECURITY INVOKER, STABLE', fn.length === 1 && fn[0].prosecdef === false && fn[0].provolatile === 's', JSON.stringify(fn))

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
