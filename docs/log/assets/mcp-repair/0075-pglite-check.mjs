// 0075 on a real Postgres engine (PGlite; needs @electric-sql/pglite resolvable): double-encoded payloads become objects, everything else is
// untouched, and a second run changes nothing. Run from app/: node ../docs/log/assets/mcp-repair/0075-pglite-check.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const db = new PGlite()
await db.exec(`
  create table activity_log (id uuid primary key default gen_random_uuid(), event_type text, payload jsonb);
  create table inbox_items (id uuid primary key default gen_random_uuid(), raw_text text, payload jsonb);
  insert into activity_log (event_type, payload) values
    ('task.completed', to_jsonb('{"source":"mcp"}'::text)),      -- the bug: an object stored as a string
    ('task.created',   to_jsonb('[1,2]'::text)),                 -- an array stored as a string
    ('note',           to_jsonb('hello there'::text)),           -- a plain string: not JSON, stays
    ('num',            to_jsonb('42'::text)),                    -- JSON, but not an object/array: stays
    ('ok',             '{"source":"app"}'::jsonb),               -- already fine
    ('null',           null);
  insert into inbox_items (raw_text, payload) values
    ('from mcp', to_jsonb('{"source":"mcp","via":"add_to_inbox"}'::text)),
    ('fine',     '{"needs_parse":true}'::jsonb);
`)
const sql = readFileSync(new URL('../../../../supabase/migrations/0075_mcp_payload_repair.sql', import.meta.url), 'utf8')
const snap = async () => JSON.stringify((await db.query(`select event_type, payload, jsonb_typeof(payload) t from activity_log order by event_type`)).rows) + JSON.stringify((await db.query(`select raw_text, payload, jsonb_typeof(payload) t from inbox_items order by raw_text`)).rows)
await db.exec(sql)
const after = await snap()
const rows = Object.fromEntries((await db.query(`select event_type, payload, jsonb_typeof(payload) t from activity_log`)).rows.map((r) => [r.event_type, r]))
const inbox = Object.fromEntries((await db.query(`select raw_text, payload, jsonb_typeof(payload) t from inbox_items`)).rows.map((r) => [r.raw_text, r]))
const checks = [
  ['the double-encoded object is an object again', rows['task.completed'].t === 'object' && rows['task.completed'].payload.source === 'mcp'],
  ['an encoded array is an array again', rows['task.created'].t === 'array'],
  ['a plain string stays a string', rows.note.t === 'string' && rows.note.payload === 'hello there'],
  ['a JSON scalar inside a string stays a string', rows.num.t === 'string'],
  ['an object payload is untouched', rows.ok.payload.source === 'app'],
  ['a null payload is untouched', rows.null.payload === null],
  ['the Inbox row is repaired', inbox['from mcp'].t === 'object' && inbox['from mcp'].payload.via === 'add_to_inbox'],
  ['a fine Inbox row is untouched', inbox.fine.payload.needs_parse === true],
]
await db.exec(sql)
checks.push(['a second run changes nothing', (await snap()) === after])
let failed = 0
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++ }
console.log(`${checks.length - failed}/${checks.length} passed`)
process.exit(failed ? 1 : 0)
