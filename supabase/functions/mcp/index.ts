// AI assistants over MCP (docs/MCP.md): Claude Desktop, Claude Code or any MCP client reads and adds
// to one user's Kai's Flow over Streamable HTTP. The protocol and the tools are ./server.ts and
// ./tools.ts — pure, tested from the app's vitest (app/src/features/settings/mcp.test.ts). This file
// is the database half.
//
// Auth: `Authorization: Bearer kf_ai_…`, the user's AI access key (mcp_keys, migration 0051; only its
// SHA-256 is stored). Deployed with verify_jwt = false (config.toml): the key is not a JWT, the key IS
// the auth.
//
// Every query for user data runs AS THAT USER. Each request is one transaction on the database
// connection (SUPABASE_DB_URL): it looks the key up — and counts a tool call — as the table owner,
// then sets role `authenticated` and request.jwt.claims {sub: <user>} for the rest of the
// transaction, which is what PostgREST does for a signed-in request. RLS and auth.uid() then scope
// every row; nothing runs as the service role. (A user JWT can't be minted here: functions get no
// signing secret, and the key holder has no Supabase session.)
//
//   curl -X POST <project>/functions/v1/mcp -H "Authorization: Bearer kf_ai_…" \
//        -H "Content-Type: application/json" -H "MCP-Protocol-Version: 2025-11-25" \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"today","arguments":{}}}'
import postgres from 'npm:postgres@3'
// rrule is CommonJS: Deno can't take a named export from it (the function crashed on boot, 503 —
// found on the first live MCP call, 2026-10-07). Vite tolerates the named import; Deno doesn't.
import rrulePkg from 'npm:rrule@2'
const { RRule } = rrulePkg
import { isAllowedOrigin } from '../_shared/cors.ts'
import { embedText } from '../_shared/retrieval.ts'
import { fromWall, toWall } from '../_shared/repeat.ts'
import { handleMcp, type KeyScope, type Session, type SessionResult } from './server.ts'
import { TASK_EDITABLE, taskRecord, type ActivityRow, type EventRow, type ProjectRow, type Row, type Scope, type SearchHit, type Store, type Table, type TaskFilter, type TaskRow, type TrashedRow } from './tools.ts'
import type { RuleBetween } from '../_shared/series.ts'

// Tool calls per key per UTC day. A runaway agent loop stops here; reads of the tool list don't count.
const DAILY_LIMIT = 500

// prepare: false — the URL may be the transaction-mode pooler, which can't keep prepared statements.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 })
type Tx = postgres.TransactionSql

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : (v as string | null))
const eventRow = (e: Record<string, unknown>) => ({ ...e, starts_at: iso(e.starts_at), ends_at: iso(e.ends_at) }) as EventRow
// A text[] column written from a JS array (the labels pattern): one jsonb parameter, no array literal.
// Every JSON parameter is cast `::text::jsonb`, never `::jsonb` alone: postgres.js asks the server for
// each parameter's type and JSON.stringify's a jsonb one AGAIN, so a pre-stringified value landed as
// a jsonb string — labels/exdates then failed ("cannot extract elements from a scalar", every
// add_task → 500) and activity payloads lost their keys (found by supabase/tests/mcp-week.sh).
const textArray = (xs: readonly string[] | null | undefined) => JSON.stringify(xs ?? [])

// The tables the generic methods reach, and the personal ones a key reaches only with its scope (0080):
// the registry (server.ts toolsFor) never lists or runs a journal / people tool for a key without it,
// and this refuses the tables too, so no tool can reach them by mistake.
const TABLES: ReadonlySet<string> = new Set<Table>([
  'tasks', 'inbox_items', 'calendar_events', 'projects', 'areas', 'domains', 'routines', 'routine_completions', 'time_entries',
  'books', 'notes', 'quotes', 'app_settings', 'slipping', 'journal_entries', 'people', 'interactions', 'smart_lists',
])
const PERSONAL: Partial<Record<Table, Scope>> = { journal_entries: 'journal', people: 'people', interactions: 'people' }
const PERSONAL_HITS: Record<string, Scope> = { journal_entry: 'journal', person: 'people' }
/** Table and column names come from the tools' own code, never from an argument; checked anyway. */
function ident(s: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`mcp: not an identifier: ${s}`)
  return `"${s}"`
}
/** A row as JSON for the tools (timestamps as ISO strings): never its owner, embedding or search vector. */
const ROW = `to_jsonb(t) - 'user_id' - 'embedding' - 'search_tsv'`

// A task row as JSON (timestamps come back as ISO strings), minus the search columns and the import
// key, plus its project's name.
function store(tx: Tx, scopes: ReadonlySet<Scope>): Store {
  const tasks = (rows: readonly Record<string, unknown>[]) => rows.map((x) => x.r as TaskRow)
  const table = (name: Table): string => {
    if (!TABLES.has(name)) throw new Error(`mcp: ${name} is not reachable`)
    const need = PERSONAL[name]
    if (need && !scopes.has(need)) throw new Error(`mcp: ${name} needs the ${need} scope`)
    return ident(name)
  }
  // Containment on the row (`{deleted_at: null}` = live), plus `t.id = …` when the match names an id
  // (the primary key, not a scan of to_jsonb).
  const where = (match: Row) => tx`to_jsonb(t) @> ${JSON.stringify(match)}::text::jsonb ${typeof match.id === 'string' ? tx`and t.id = ${match.id}::uuid` : tx``}`
  const defined = (o: Row) => Object.keys(o).filter((k) => o[k] !== undefined)
  // Every generic write goes through jsonb_populate_record: Postgres turns each JSON value into its
  // column's type (text[], jsonb, timestamptz, date…), so nothing is cast by hand.
  const find: Store['find'] = async (name, match = {}, o = {}) => {
    const order = o.order ? `order by t.${ident(o.order)} ${o.desc ? 'desc' : 'asc'} nulls last` : ''
    const rows = await tx`select ${tx.unsafe(ROW)} as r from ${tx.unsafe(table(name))} t where ${where(match)} ${tx.unsafe(order)} limit ${o.limit ?? 5000}::int`
    return rows.map((x) => x.r as Row)
  }
  const insert: Store['insert'] = async (name, row) => {
    const t = table(name)
    const cols = defined(row).map(ident).join(', ')
    await tx`insert into ${tx.unsafe(t)} (${tx.unsafe(cols)}) select ${tx.unsafe(cols)} from jsonb_populate_record(null::${tx.unsafe(t)}, ${JSON.stringify(row)}::text::jsonb)`
  }
  const patch: Store['patch'] = async (name, match, values) => {
    const t = table(name)
    if (!Object.keys(match).length && name !== 'app_settings') throw new Error('mcp: a patch needs a match')
    const keys = defined(values)
    if (!keys.length) return []
    const sets = keys.map((k) => `${ident(k)} = p.${ident(k)}`).join(', ')
    const rows = await tx`
      update ${tx.unsafe(t)} t set ${tx.unsafe(sets)}
      from jsonb_populate_record(null::${tx.unsafe(t)}, ${JSON.stringify(values)}::text::jsonb) p
      where ${where(match)}
      returning ${tx.unsafe(ROW)} as r`
    return rows.map((x) => x.r as Row)
  }
  const remove: Store['remove'] = async (name, match) => {
    if (!Object.keys(match).length) throw new Error('mcp: a delete needs a match')
    const rows = await tx`delete from ${tx.unsafe(table(name))} t where ${where(match)} returning ${tx.unsafe(ROW)} as r`
    return rows.map((x) => x.r as Row)
  }
  const EVENT_COLS = tx.unsafe('id, title, starts_at, ends_at, all_day, task_id, type, recurrence_rule, recurrence_exdates, series_id, remind_min')
  return {
    find,
    insert,
    patch,
    remove,
    async inboxItems(show, limit) {
      const rows = await tx`
        select ${tx.unsafe(ROW)} as r from inbox_items t
        where t.deleted_at is null and (
          (${show}::text = 'pending' and t.status = 'pending' and (t.snoozed_until is null or t.snoozed_until <= now()))
          or (${show}::text = 'snoozed' and t.status = 'pending' and t.snoozed_until > now())
          or (${show}::text in ('dismissed', 'filed') and t.status = ${show}::text)
          or ${show}::text = 'all')
        order by t.created_at desc, t.id
        limit ${limit}::int`
      return rows.map((x) => x.r as Row)
    },
    async trashed(limit) {
      // Google-synced events are never in an assistant's view (0074); the journal only with its scope.
      const rows = await tx`
        select type, id::text as id, title, deleted_at from (
          select 'task' as type, id, title, deleted_at from tasks where deleted_at is not null
          union all select 'inbox_item', id, raw_text, deleted_at from inbox_items where deleted_at is not null
          union all select 'calendar_event', id, title, deleted_at from calendar_events where deleted_at is not null and source = 'native'
          union all select 'project', id, name, deleted_at from projects where deleted_at is not null
          union all select 'area', id, name, deleted_at from areas where deleted_at is not null
          union all select 'domain', id, name, deleted_at from domains where deleted_at is not null
          union all select 'journal_entry', id, left(body, 80), deleted_at from journal_entries where deleted_at is not null and ${scopes.has('journal')}::boolean
        ) x
        order by deleted_at desc, id
        limit ${limit}::int`
      return rows.map((r) => ({ ...r, deleted_at: iso(r.deleted_at) }) as TrashedRow)
    },
    async activity(f) {
      const types = f.types ? JSON.stringify(f.types) : null
      const rows = await tx`
        select event_type, entity_type, entity_id::text as entity_id, payload, created_at from activity_log
        where (${types}::text is null or event_type in (select jsonb_array_elements_text(${types}::text::jsonb)))
          and (${f.prefix ?? null}::text is null or starts_with(event_type, ${f.prefix ?? null}::text))
          and (${f.since ?? null}::timestamptz is null or created_at >= ${f.since ?? null}::timestamptz)
        order by case when ${!!f.asc}::boolean then created_at end asc, created_at desc, id
        limit ${f.limit}::int`
      return rows.map((r) => ({ ...r, created_at: iso(r.created_at) }) as ActivityRow)
    },
    async weekStats(fromIso, toIso, fromDay, toDay) {
      const [r] = await tx`
        select
          (select count(*)::int from tasks where status = 'done' and deleted_at is null and completed_at >= ${fromIso}::timestamptz and completed_at < ${toIso}::timestamptz) as done,
          (select coalesce(jsonb_agg(title order by completed_at desc), '[]'::jsonb) from (
            select title, completed_at from tasks where status = 'done' and deleted_at is null and completed_at >= ${fromIso}::timestamptz and completed_at < ${toIso}::timestamptz
            order by completed_at desc limit 20) d) as done_titles,
          (select count(*)::int from tasks where deleted_at is null and created_at >= ${fromIso}::timestamptz and created_at < ${toIso}::timestamptz) as added,
          (select coalesce(sum(duration_min), 0)::int from time_entries where started_at >= ${fromIso}::timestamptz and started_at < ${toIso}::timestamptz) as focus_min,
          (select count(*)::int from routine_completions where completed_on >= ${fromDay}::date and completed_on <= ${toDay}::date) as routine_checks,
          (select count(*)::int from inbox_items where deleted_at is null and created_at >= ${fromIso}::timestamptz and created_at < ${toIso}::timestamptz) as captured`
      return r as unknown as Awaited<ReturnType<Store['weekStats']>>
    },
    async timezone() {
      const [row] = await tx`select timezone from app_settings limit 1`
      return (row?.timezone as string | undefined) ?? null
    },
    async dayTasks(start, end) {
      return tasks(await tx`
        select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' || jsonb_build_object('project_name', p.name) as r
        from tasks t left join projects p on p.id = t.project_id
        where t.status = 'todo' and t.deleted_at is null and not t.someday and not t.paused
          and (coalesce(t.due_at, t.scheduled_start) < ${end}::timestamptz
            or (t.scheduled_start >= ${start}::timestamptz and t.scheduled_start < ${end}::timestamptz)
            or (t.top3 and t.due_at is null and t.scheduled_start is null))
        -- Picks first, so a long overdue pile can't push them past the limit.
        order by t.top3 desc, coalesce(t.due_at, t.scheduled_start) nulls last, t.id
        limit 500`)
    },
    async listTasks(f: TaskFilter) {
      return tasks(await tx`
        select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' || jsonb_build_object('project_name', p.name) as r
        from tasks t left join projects p on p.id = t.project_id
        where t.deleted_at is null
          and (${f.status}::text = 'all' or (${f.status}::text = 'open' and t.status = 'todo') or (${f.status}::text = 'done' and t.status = 'done'))
          and (${f.projectId}::uuid is null or t.project_id = ${f.projectId}::uuid)
          and (${f.label}::text is null or ${f.label}::text = any(t.labels))
          and (${f.areaId ?? null}::uuid is null or t.area_id = ${f.areaId ?? null}::uuid)
          and (${f.someday ?? null}::boolean is null or t.someday = ${f.someday ?? null}::boolean)
          and (${f.dueFrom}::timestamptz is null or t.due_at >= ${f.dueFrom}::timestamptz)
          and (${f.dueTo}::timestamptz is null or t.due_at < ${f.dueTo}::timestamptz)
        order by case when ${f.status}::text = 'done' then t.completed_at end desc nulls last, t.due_at nulls last, t.created_at
        limit ${f.limit}::int`)
    },
    async getTask(id) {
      const [row] = tasks(await tx`
        select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' || jsonb_build_object('project_name', p.name, 'link', t.external_ref->>'url') as r
        from tasks t left join projects p on p.id = t.project_id
        where t.id = ${id}::uuid and t.deleted_at is null`)
      return row ?? null
    },
    async projects() {
      const rows = await tx`select id, name, status, type, domain_id, target_date from projects where deleted_at is null order by name, id`
      return rows.map((p) => ({ ...p, target_date: iso(p.target_date) }) as ProjectRow)
    },
    async events(from, to) {
      // A repeating event (0061) is one row anchored at its first occurrence: it comes along whenever it
      // started before `to`, and tools.ts expands it.
      // source = 'native': Google-synced events (0074) are never sent to an AI (privacy promise, site info §3).
      const rows = await tx`
        select id, title, starts_at, ends_at, all_day, task_id, type, recurrence_rule, recurrence_exdates, remind_min from calendar_events
        where deleted_at is null and source = 'native' and starts_at < ${to}::timestamptz and (ends_at > ${from}::timestamptz or recurrence_rule is not null)
        order by starts_at, id
        limit 300`
      return rows.map(eventRow)
    },
    async slotTasks(ids) {
      return tasks(await tx`
        select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' || jsonb_build_object('project_name', p.name) as r
        from tasks t left join projects p on p.id = t.project_id
        where t.deleted_at is null and t.slot_id in (select jsonb_array_elements_text(${textArray(ids)}::text::jsonb)::uuid)
        order by t.scheduled_start nulls last, t.id
        limit 500`)
    },
    async search(query, limit) {
      // _shared/retrieval.ts's embedding (the runtime's gte-small) + the same search_hybrid the app's
      // search and chat use; security invoker, so RLS scopes it to this user.
      const embedding = JSON.stringify(await embedText(query))
      // …minus Google-synced events (0074): never sent to an AI (privacy promise, site info §3).
      const rows = await tx`
        select s.entity_type, s.entity_id, s.title, s.snippet, s.score from search_hybrid(${query}, ${embedding}, ${limit}) s
        where not (s.entity_type = 'calendar_event'
          and exists (select 1 from calendar_events e where e.id::text = s.entity_id::text and e.source = 'gcal'))`
      // Journal entries and people only for a key granted them (0080); tools.ts filters again.
      return (rows as unknown as SearchHit[]).filter((h) => !(h.entity_type in PERSONAL_HITS) || scopes.has(PERSONAL_HITS[h.entity_type]))
    },
    async top3Count(end) {
      // The Top 3 rule (_shared/today.ts): a pick dated after today isn't one of today's.
      const [row] = await tx`
        select count(*)::int as n from tasks
        where top3 and status = 'todo' and deleted_at is null and not someday and not paused
          and (coalesce(due_at, scheduled_start) is null or coalesce(due_at, scheduled_start) < ${end}::timestamptz)`
      return row.n as number
    },
    async openOccurrence(title, rule, due, exceptId) {
      const [row] = await tx`
        select exists(select 1 from tasks where id <> ${exceptId}::uuid and deleted_at is null and status = 'todo'
          and title = ${title}::text and recurrence_rule = ${rule}::text and due_at = ${due}::timestamptz) as e`
      return row.e as boolean
    },
    async insertTask(t) {
      await insert('tasks', taskRecord(t))
    },
    async updateTask(t) {
      // Every editable field as the tool settled it (tools.ts settle: the reminder's lead, the Top 3).
      await patch('tasks', { id: t.id, deleted_at: null }, taskRecord(t, TASK_EDITABLE))
    },
    async markDone(id, at) {
      const rows = await tx`
        update tasks set status = 'done', completed_at = ${at}::timestamptz, top3 = false
        where id = ${id}::uuid and status = 'todo' and deleted_at is null
        returning id`
      return rows.length > 0
    },
    async taskBlocks(taskId) {
      const rows = await tx`
        select ${EVENT_COLS} from calendar_events
        where task_id = ${taskId}::uuid and deleted_at is null`
      return rows.map(eventRow)
    },
    async getEvent(id) {
      const [e] = await tx`
        select ${EVENT_COLS} from calendar_events
        where id = ${id}::uuid and deleted_at is null and source = 'native'` // a Google event (0074) is read-only
      return e ? eventRow(e) : null
    },
    async insertEvent(e) {
      // source 'native', busy true, colour and project none: the column defaults, as calendar/api createEvent writes them.
      await insert('calendar_events', {
        id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day, task_id: e.task_id, type: e.type ?? 'event',
        recurrence_rule: e.recurrence_rule ?? null, recurrence_exdates: e.recurrence_exdates ?? [], series_id: e.series_id ?? null, remind_min: e.remind_min ?? null,
      })
    },
    async updateEvent(e) {
      // A Google event (0074) is read-only: only a live native row matches.
      await patch('calendar_events', { id: e.id, deleted_at: null, source: 'native' }, {
        title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day, type: e.type ?? 'event',
        recurrence_rule: e.recurrence_rule ?? null, recurrence_exdates: e.recurrence_exdates ?? [], remind_min: e.remind_min ?? null,
      })
    },
    async deleteEvents(ids) {
      // Soft: Trash brings them back. A series takes the one-offs moved out of it (series_id) along.
      const rows = await tx`
        update calendar_events set deleted_at = now()
        where deleted_at is null and source = 'native'
          and (id in (select jsonb_array_elements_text(${textArray(ids)}::text::jsonb)::uuid)
            or series_id in (select jsonb_array_elements_text(${textArray(ids)}::text::jsonb)::uuid))
        returning id`
      return rows.map((r) => r.id as string)
    },
    async insertInbox(row) {
      await tx`
        insert into inbox_items (id, kind, raw_text, status, payload)
        values (${row.id}::uuid, 'text', ${row.raw_text}::text, 'pending', ${JSON.stringify(row.payload)}::text::jsonb)`
    },
    async log(eventType, entityType, entityId, payload) {
      await tx`
        insert into activity_log (event_type, entity_type, entity_id, payload)
        values (${eventType}::text, ${entityType}::text, ${entityId}::uuid, ${JSON.stringify(payload)}::text::jsonb)`
    },
  }
}

async function withSession<T>(key: string, count: boolean, fn: (s: Session) => Promise<T>): Promise<SessionResult<T>> {
  const hash = await sha256Hex(key)
  return (await sql.begin(async (tx) => {
    // As the table owner, before the switch: the key (and, for a tool call, its count for today).
    const [k] = count
      ? await tx`
          update mcp_keys set calls = case when calls_day = current_date then calls + 1 else 1 end,
            calls_day = current_date, last_used_at = now()
          where key_hash = ${hash}::text
          returning user_id, scope, calls, coalesce(to_jsonb(mcp_keys)->'scopes', '[]'::jsonb) as scopes`
      : await tx`select user_id, scope, 0 as calls, coalesce(to_jsonb(k)->'scopes', '[]'::jsonb) as scopes from mcp_keys k where key_hash = ${hash}::text`
    if (!k) return { ok: false, reason: 'invalid' }
    if ((k.calls as number) > DAILY_LIMIT) return { ok: false, reason: 'limit' } // the count still commits

    const claims = JSON.stringify({ sub: k.user_id, role: 'authenticated', aud: 'authenticated', is_anonymous: false })
    await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}::text, true)`
    // Belt and braces: never run a tool unless the switch took — as the owner, RLS wouldn't apply.
    const [who] = await tx`select current_user::text as role, auth.uid()::text as uid`
    if (who.role !== 'authenticated' || who.uid !== k.user_id) throw new Error('mcp: role switch did not take')
    // scopes (0080) read through to_jsonb, so a database without the column yet reads as none.
    const scopes = (Array.isArray(k.scopes) ? k.scopes : []) as Scope[]
    return { ok: true, value: await fn({ scope: k.scope as KeyScope, scopes, store: store(tx, new Set(scopes)) }) }
  })) as SessionResult<T>
}

/** features/tasks/recurrence.ts nextOccurrence, on the same rrule: the rule runs on the user's wall
 * clock (a daily 09:00 stays 09:00 across DST; BYDAY reads the user's weekday). */
function nextOccurrence(rule: string, from: Date, zone: string, after: Date): Date | null {
  const { until, ...options } = RRule.parseString(rule.replace(/^RRULE:/, ''))
  const r = new RRule({ ...options, ...(until ? { until: toWall(until, zone) } : null), dtstart: toWall(from, zone) })
  const next = r.after(toWall(after, zone), false)
  return next ? fromWall(next, zone) : null
}

/** features/calendar/series.ts's rrule half, on the same rrule. */
const ruleBetween: RuleBetween = (rule, dtstart, after, before) => new RRule({ ...RRule.parseString(rule), dtstart }).between(after, before, true)

Deno.serve((req) =>
  handleMcp(req, { withSession, originAllowed: isAllowedOrigin, nextOccurrence, ruleBetween, now: () => new Date(), dailyLimit: DAILY_LIMIT }),
)
