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
import { RRule } from 'npm:rrule@2'
import { isAllowedOrigin } from '../_shared/cors.ts'
import { embedText } from '../_shared/retrieval.ts'
import { handleMcp, type KeyScope, type Session, type SessionResult } from './server.ts'
import type { EventRow, ProjectRow, SearchHit, Store, TaskFilter, TaskRow } from './tools.ts'

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

// A task row as JSON (timestamps come back as ISO strings), minus the search columns and the import
// key, plus its project's name.
function store(tx: Tx): Store {
  const tasks = (rows: readonly Record<string, unknown>[]) => rows.map((x) => x.r as TaskRow)
  return {
    async timezone() {
      const [row] = await tx`select timezone from app_settings limit 1`
      return (row?.timezone as string | undefined) ?? null
    },
    async dayTasks(start, end) {
      return tasks(await tx`
        select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' || jsonb_build_object('project_name', p.name) as r
        from tasks t left join projects p on p.id = t.project_id
        where t.status = 'todo' and t.deleted_at is null
          and (t.top3 or (not t.someday and (
            coalesce(t.due_at, t.scheduled_start) < ${end}::timestamptz
            or (t.scheduled_start >= ${start}::timestamptz and t.scheduled_start < ${end}::timestamptz))))
        order by coalesce(t.due_at, t.scheduled_start) nulls last, t.id
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
          and (${f.dueFrom}::timestamptz is null or t.due_at >= ${f.dueFrom}::timestamptz)
          and (${f.dueTo}::timestamptz is null or t.due_at < ${f.dueTo}::timestamptz)
        order by case when ${f.status}::text = 'done' then t.completed_at end desc nulls last, t.due_at nulls last, t.created_at
        limit ${f.limit}::int`)
    },
    async getTask(id) {
      const [row] = tasks(await tx`
        select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' || jsonb_build_object('project_name', p.name) as r
        from tasks t left join projects p on p.id = t.project_id
        where t.id = ${id}::uuid and t.deleted_at is null`)
      return row ?? null
    },
    async projects() {
      const rows = await tx`select id, name, status, type, domain_id, target_date from projects where deleted_at is null order by name, id`
      return rows.map((p) => ({ ...p, target_date: iso(p.target_date) }) as ProjectRow)
    },
    async events(from, to) {
      const rows = await tx`
        select id, title, starts_at, ends_at, all_day, task_id from calendar_events
        where deleted_at is null and starts_at < ${to}::timestamptz and ends_at > ${from}::timestamptz
        order by starts_at, id
        limit 300`
      return rows.map((e) => ({ ...e, starts_at: iso(e.starts_at), ends_at: iso(e.ends_at) }) as EventRow)
    },
    async search(query, limit) {
      // _shared/retrieval.ts's embedding (the runtime's gte-small) + the same search_hybrid the app's
      // search and chat use; security invoker, so RLS scopes it to this user.
      const embedding = JSON.stringify(await embedText(query))
      const rows = await tx`select entity_type, entity_id, title, snippet, score from search_hybrid(${query}, ${embedding}, ${limit})`
      return rows as unknown as SearchHit[]
    },
    async top3Count() {
      const [row] = await tx`select count(*)::int as n from tasks where top3 and status = 'todo' and deleted_at is null`
      return row.n as number
    },
    async openOccurrence(title, rule, due, exceptId) {
      const [row] = await tx`
        select exists(select 1 from tasks where id <> ${exceptId}::uuid and deleted_at is null and status = 'todo'
          and title = ${title}::text and recurrence_rule = ${rule}::text and due_at = ${due}::timestamptz) as e`
      return row.e as boolean
    },
    async insertTask(t) {
      await tx`
        insert into tasks (id, title, notes, status, due_at, scheduled_start, scheduled_end, top3, someday, paused, labels,
          priority, duration_min, project_id, domain_id, area_id, milestone_id, parent_task_id, recurrence_rule,
          reminder_at, reminder_sent, snoozed_until, completed_at, created_at, updated_at)
        values (${t.id}::uuid, ${t.title}::text, ${t.notes}::text, ${t.status}::text, ${t.due_at}::timestamptz,
          ${t.scheduled_start}::timestamptz, ${t.scheduled_end}::timestamptz, ${t.top3}::boolean, ${t.someday}::boolean,
          ${t.paused}::boolean, array(select jsonb_array_elements_text(${JSON.stringify(t.labels ?? [])}::jsonb)),
          ${t.priority}::int, ${t.duration_min}::int, ${t.project_id}::uuid, ${t.domain_id}::uuid, ${t.area_id}::uuid,
          ${t.milestone_id}::uuid, ${t.parent_task_id}::uuid, ${t.recurrence_rule}::text, ${t.reminder_at}::timestamptz,
          ${t.reminder_sent}::boolean, ${t.snoozed_until}::timestamptz, ${t.completed_at}::timestamptz,
          ${t.created_at}::timestamptz, ${t.updated_at}::timestamptz)`
    },
    async markDone(id, at) {
      const rows = await tx`
        update tasks set status = 'done', completed_at = ${at}::timestamptz, top3 = false
        where id = ${id}::uuid and status = 'todo' and deleted_at is null
        returning id`
      return rows.length > 0
    },
    async setDue(id, due) {
      await tx`update tasks set due_at = ${due}::timestamptz, someday = false where id = ${id}::uuid`
    },
    async insertInbox(row) {
      await tx`
        insert into inbox_items (id, kind, raw_text, status, payload)
        values (${row.id}::uuid, 'text', ${row.raw_text}::text, 'pending', ${JSON.stringify(row.payload)}::jsonb)`
    },
    async log(eventType, entityType, entityId, payload) {
      await tx`
        insert into activity_log (event_type, entity_type, entity_id, payload)
        values (${eventType}::text, ${entityType}::text, ${entityId}::uuid, ${JSON.stringify(payload)}::jsonb)`
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
          returning user_id, scope, calls`
      : await tx`select user_id, scope, 0 as calls from mcp_keys where key_hash = ${hash}::text`
    if (!k) return { ok: false, reason: 'invalid' }
    if ((k.calls as number) > DAILY_LIMIT) return { ok: false, reason: 'limit' } // the count still commits

    const claims = JSON.stringify({ sub: k.user_id, role: 'authenticated', aud: 'authenticated', is_anonymous: false })
    await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}::text, true)`
    // Belt and braces: never run a tool unless the switch took — as the owner, RLS wouldn't apply.
    const [who] = await tx`select current_user::text as role, auth.uid()::text as uid`
    if (who.role !== 'authenticated' || who.uid !== k.user_id) throw new Error('mcp: role switch did not take')
    return { ok: true, value: await fn({ scope: k.scope as KeyScope, store: store(tx) }) }
  })) as SessionResult<T>
}

/** features/tasks/recurrence.ts nextOccurrence, on the same rrule. */
function nextOccurrence(rule: string, from: Date): Date | null {
  return new RRule({ ...RRule.parseString(rule), dtstart: from }).after(from, false)
}

Deno.serve((req) =>
  handleMcp(req, { withSession, originAllowed: isAllowedOrigin, nextOccurrence, now: () => new Date(), dailyLimit: DAILY_LIMIT }),
)
