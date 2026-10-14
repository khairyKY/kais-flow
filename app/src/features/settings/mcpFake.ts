// The MCP tests' in-memory database (mcp.test.ts, mcpFull.test.ts): a Store whose filters mirror
// supabase/functions/mcp/index.ts's SQL, and the HTTP helpers that drive handleMcp end to end. Test
// code only — no app module imports it. The importing test file mocks lib/supabase (mcpKey.ts needs it).
import { handleMcp, type Deps, type KeyScope, type Session } from '../../../../supabase/functions/mcp/server.ts'
import type { ActivityRow, BlockRow, EventRow, ProjectRow, Row, Scope, SearchHit, Store, Table, TaskFilter, TaskRow, TrashedRow } from '../../../../supabase/functions/mcp/tools.ts'
import { nextOccurrence } from '../tasks/recurrence'
import { ruleBetween } from '../calendar/series'
import { newMcpKey } from './mcpKey'

// "Now" is Sun 4 Oct 2026 11:00 UTC: 14:00 in Cairo (UTC+3), 04:00 in Los Angeles.
export const NOW = new Date('2026-10-04T11:00:00Z')
export const P1 = '00000000-0000-4000-8000-0000000000a1'
export const D1 = '00000000-0000-4000-8000-0000000000d1'
export const tid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function task(n: number, title: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: tid(n), title, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, someday: false,
    paused: false, labels: [], priority: null, duration_min: null, project_id: null, domain_id: null, area_id: null, milestone_id: null,
    parent_task_id: null, recurrence_rule: null, reminder_at: null, reminder_sent: false, snoozed_until: null, completed_at: null,
    created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z', ...over,
  }
}

export type CalRow = EventRow & { deleted_at?: string | null; source?: string }
export interface Fake extends Store {
  tasks: (TaskRow & { deleted_at?: string | null })[]
  inbox: Row[]
  logs: { eventType: string; entityType: string; entityId: string; payload: Record<string, unknown> }[]
  filters: TaskFilter[]
  /** calendar_events: the events below, then the tasks' blocks. */
  cal: CalRow[]
  /** Every other table, by name (projects, areas, domains, routines, journal_entries, people…). */
  db: Record<string, Row[]>
}

/** jsonb containment (`@>`) as index.ts's `where` reads it: a missing column is null; an array
 * holds every element asked for; an object holds every key asked for. */
export function contains(row: Row, match: Row): boolean {
  return Object.entries(match).every(([k, v]) => {
    const r = row[k] ?? null
    if (v === null) return r === null
    if (Array.isArray(v)) return Array.isArray(r) && v.every((x) => (r as unknown[]).includes(x))
    if (typeof v === 'object') return !!r && typeof r === 'object' && contains(r as Row, v as Row)
    return r === v
  })
}

const PERSONAL: Partial<Record<Table, Scope>> = { journal_entries: 'journal', people: 'people', interactions: 'people' }

export function fakeStore(zone: string | null = 'Africa/Cairo', seed: TaskRow[] = [], blocks: (BlockRow & { task_id: string; deleted_at?: string | null })[] = []): Fake {
  const projects: ProjectRow[] = [{ id: P1, name: 'Shaheen Website', status: 'active', type: 'standard', domain_id: D1, target_date: '2026-12-01T00:00:00Z' }]
  const events: EventRow[] = [
    { id: tid(900), title: 'Standup', starts_at: '2026-10-04T07:00:00Z', ends_at: '2026-10-04T07:15:00Z', all_day: false, task_id: null },
    { id: tid(901), title: 'Next week', starts_at: '2026-10-20T07:00:00Z', ends_at: '2026-10-20T08:00:00Z', all_day: false, task_id: null },
    // Repeating (0061): weekly from Thu 1 Oct, 18:00 Cairo — one row, its 15th skipped.
    { id: tid(902), title: 'Choir', starts_at: '2026-10-01T15:00:00Z', ends_at: '2026-10-01T16:30:00Z', all_day: false, task_id: null, recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-15T15:00:00.000Z'] },
  ]
  const hits: SearchHit[] = [
    { entity_type: 'journal_entry', entity_id: tid(800), title: 'Dear diary', snippet: 'private', score: 9 },
    { entity_type: 'task', entity_id: tid(1), title: 'Call the tyre supplier', snippet: null, score: 5 },
    { entity_type: 'person', entity_id: tid(801), title: 'Mona', snippet: 'birthday', score: 4 },
    { entity_type: 'inbox_item', entity_id: tid(802), title: 'tyre prices link', snippet: 'https://…', score: 3 },
  ]
  const rowsOf = (t: Table): Row[] =>
    t === 'tasks' ? (s.tasks as unknown as Row[]) : t === 'calendar_events' ? (s.cal as unknown as Row[]) : t === 'inbox_items' ? s.inbox : (s.db[t] ??= [])
  const defined = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  const clone = <T,>(r: T): T => JSON.parse(JSON.stringify(r)) as T
  const s: Fake = {
    tasks: seed.map((t) => ({ ...t })),
    inbox: [],
    logs: [],
    filters: [],
    // source 'native': the column's default (Google rows are 'gcal').
    cal: [...events, ...blocks.map((b): CalRow => ({ title: 'block', type: 'task', ...b }))].map((e) => ({ source: 'native', ...e })),
    db: {
      projects: projects.map((p) => ({ ...p, deleted_at: null, milestones: [], checklist: [] })),
      domains: [{ id: D1, name: 'Work', color: null, sort_order: 0, deleted_at: null }],
      app_settings: [{ timezone: zone, weekend_days: [0, 6], slipping_default_days: 7, label_meta: null, checklist_templates: null, morning_digest_on: true, morning_digest_at: '08:00:00' }],
    },
    timezone: async () => zone,
    find: async (t, match = {}, o = {}) => {
      let rows = rowsOf(t).filter((r) => contains(r, match))
      if (o.order) {
        const k = o.order
        const key = (r: Row) => (r[k] ?? null) as string | number | null
        rows = [...rows].sort((x, y) => {
          const [a, b] = [key(x), key(y)]
          if (a === b) return 0
          if (a === null) return 1
          if (b === null) return -1
          return (a < b ? -1 : 1) * (o.desc ? -1 : 1)
        })
      }
      return rows.slice(0, o.limit ?? 5000).map(clone)
    },
    insert: async (t, row) => {
      const r = defined(row)
      if (t === 'tasks') return void s.tasks.push(r as unknown as TaskRow)
      rowsOf(t).push({ deleted_at: null, created_at: NOW.toISOString(), ...r })
    },
    patch: async (t, match, values) => {
      const hit = rowsOf(t).filter((r) => contains(r, match))
      for (const r of hit) Object.assign(r, defined(values))
      return hit.map(clone)
    },
    remove: async (t, match) => {
      const all = rowsOf(t)
      const gone = all.filter((r) => contains(r, match))
      const keep = all.filter((r) => !gone.includes(r))
      all.splice(0, all.length, ...keep)
      // interactions go with their person (on delete cascade).
      if (t === 'people') for (const p of gone) s.db.interactions = (s.db.interactions ?? []).filter((i) => i.person_id !== p.id)
      return gone.map(clone)
    },
    inboxItems: async (show, limit) =>
      s.inbox
        .filter((i) => !i.deleted_at)
        .filter((i) => {
          const snoozed = !!i.snoozed_until && Date.parse(i.snoozed_until as string) > NOW.getTime()
          return show === 'all' || (show === 'pending' ? i.status === 'pending' && !snoozed : show === 'snoozed' ? i.status === 'pending' && snoozed : i.status === show)
        })
        .slice(0, limit)
        .map(clone),
    trashed: async (limit) => {
      const out: TrashedRow[] = []
      const add = (type: string, rows: Row[], title: (r: Row) => unknown) => rows.filter((r) => r.deleted_at).forEach((r) => out.push({ type, id: r.id as string, title: title(r) as string, deleted_at: r.deleted_at as string }))
      add('task', s.tasks as unknown as Row[], (r) => r.title)
      add('inbox_item', s.inbox, (r) => r.raw_text)
      add('calendar_event', (s.cal as unknown as Row[]).filter((e) => e.source !== 'gcal'), (r) => r.title)
      for (const t of ['project', 'area', 'domain'] as const) add(t, s.db[`${t}s`] ?? [], (r) => r.name)
      add('journal_entry', s.db.journal_entries ?? [], (r) => String(r.body).slice(0, 80))
      return out.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)).slice(0, limit)
    },
    activity: async (f) => {
      const rows: ActivityRow[] = [...(s.db.activity_seed ?? []).map((r) => r as unknown as ActivityRow), ...s.logs.map((l) => ({ event_type: l.eventType, entity_type: l.entityType, entity_id: l.entityId, payload: l.payload, created_at: NOW.toISOString() }))]
      const hit = rows.filter((r) => (!f.types || f.types.includes(r.event_type)) && (!f.prefix || r.event_type.startsWith(f.prefix)) && (!f.since || r.created_at >= f.since))
      return (f.asc ? hit : [...hit].reverse()).slice(0, f.limit)
    },
    weekStats: async (from, to, fromDay, toDay) => {
      const inSpan = (iso: unknown) => typeof iso === 'string' && Date.parse(iso) >= Date.parse(from) && Date.parse(iso) < Date.parse(to)
      const done = s.tasks.filter((t) => t.status === 'done' && !t.deleted_at && inSpan(t.completed_at))
      return {
        done: done.length,
        done_titles: done.map((t) => t.title).slice(0, 20),
        added: s.tasks.filter((t) => !t.deleted_at && inSpan(t.created_at)).length,
        focus_min: (s.db.time_entries ?? []).filter((e) => inSpan(e.started_at)).reduce((n, e) => n + Number(e.duration_min), 0),
        routine_checks: (s.db.routine_completions ?? []).filter((c) => (c.completed_on as string) >= fromDay && (c.completed_on as string) <= toDay).length,
        captured: s.inbox.filter((i) => !i.deleted_at && inSpan(i.created_at)).length,
      }
    },
    // index.ts's SQL: open, not in Trash, not someday or paused — dated before `end`, scheduled today, or an undated pick.
    dayTasks: async (start, end) =>
      s.tasks.filter((t) => {
        if (t.status !== 'todo' || t.someday || t.paused || t.deleted_at) return false
        const dated = t.due_at ?? t.scheduled_start
        const sched = t.scheduled_start ? Date.parse(t.scheduled_start) : NaN
        return (!!dated && Date.parse(dated) < Date.parse(end)) || (sched >= Date.parse(start) && sched < Date.parse(end)) || (t.top3 && !dated)
      }).map((t) => ({ ...t })),
    listTasks: async (f) => {
      s.filters.push(f)
      return s.tasks
        .filter((t) => !t.deleted_at)
        .filter((t) => f.status === 'all' || (f.status === 'open' ? t.status === 'todo' : t.status === 'done'))
        .filter((t) => (!f.projectId || t.project_id === f.projectId) && (!f.areaId || t.area_id === f.areaId) && (f.someday == null || t.someday === f.someday) && (!f.label || t.labels.includes(f.label)))
        .slice(0, f.limit)
        .map((t) => ({ ...t }))
    },
    // A fresh row per read, as the database gives one.
    getTask: async (id) => {
      const t = s.tasks.find((x) => x.id === id && !x.deleted_at)
      return t ? { ...t } : null
    },
    projects: async () => (s.db.projects as unknown as (ProjectRow & { deleted_at?: string | null })[]).filter((p) => !p.deleted_at).map((p) => ({ id: p.id, name: p.name, status: p.status, type: p.type, domain_id: p.domain_id, target_date: p.target_date })),
    events: async (from, to) => s.cal.filter((e) => !e.deleted_at && e.source !== 'gcal' && Date.parse(e.starts_at) < Date.parse(to) && (Date.parse(e.ends_at) > Date.parse(from) || !!e.recurrence_rule)),
    search: async (_q, limit) => hits.slice(0, limit),
    top3Count: async (end) =>
      s.tasks.filter((t) => {
        const dated = t.due_at ?? t.scheduled_start
        return t.top3 && t.status === 'todo' && !t.someday && !t.paused && !t.deleted_at && (!dated || Date.parse(dated) < Date.parse(end))
      }).length,
    openOccurrence: async (title, rule, due, except) =>
      s.tasks.some((t) => t.id !== except && t.status === 'todo' && t.title === title && t.recurrence_rule === rule && t.due_at === due),
    insertTask: async (t) => {
      const { project_name: _p, link: _l, ...row } = t
      s.tasks.push(row)
    },
    // index.ts's UPDATE: the editable columns only (TASK_EDITABLE), on a live row.
    updateTask: async (t) => {
      const row = s.tasks.find((x) => x.id === t.id && !x.deleted_at)
      if (!row) return
      const { title, notes, due_at, scheduled_start, scheduled_end, someday, paused, top3, labels, priority, duration_min, project_id, area_id, domain_id, milestone_id, parent_task_id, recurrence_rule, reminder_at, reminder_sent, snoozed_until } = t
      Object.assign(row, {
        title, notes, due_at, scheduled_start, scheduled_end, someday, paused, top3, top3_rank: t.top3_rank ?? null, labels, priority, duration_min, project_id, area_id, domain_id, milestone_id,
        parent_task_id, recurrence_rule, reminder_at, reminder_sent, snoozed_until, slot_id: t.slot_id ?? null, slot_date: t.slot_date ?? null, sort_order: t.sort_order ?? null,
      })
    },
    markDone: async (id, at) => {
      const t = s.tasks.find((x) => x.id === id && x.status === 'todo' && !x.deleted_at)
      if (!t) return false
      Object.assign(t, { status: 'done', completed_at: at, top3: false })
      return true
    },
    slotTasks: async (ids) => s.tasks.filter((t) => !t.deleted_at && !!t.slot_id && ids.includes(t.slot_id)).map((t) => ({ ...t })),
    taskBlocks: async (taskId) => s.cal.filter((e) => e.task_id === taskId && !e.deleted_at).map((e) => ({ ...e })),
    getEvent: async (id) => {
      const e = s.cal.find((x) => x.id === id && !x.deleted_at && x.source !== 'gcal')
      return e ? { ...e } : null
    },
    insertEvent: async (e) => void s.cal.push({ ...e, source: 'native', deleted_at: null }),
    updateEvent: async (e) => {
      const { title, starts_at, ends_at, all_day } = e
      const row = s.cal.find((x) => x.id === e.id && !x.deleted_at)
      if (row) Object.assign(row, { title, starts_at, ends_at, all_day, type: e.type ?? 'event', recurrence_rule: e.recurrence_rule ?? null, recurrence_exdates: e.recurrence_exdates ?? [], remind_min: e.remind_min ?? null })
    },
    deleteEvents: async (ids) => {
      const gone = s.cal.filter((e) => !e.deleted_at && (ids.includes(e.id) || (!!e.series_id && ids.includes(e.series_id))))
      for (const e of gone) e.deleted_at = NOW.toISOString()
      return gone.map((e) => e.id)
    },
    insertInbox: async (row) => void s.inbox.push(row),
    log: async (eventType, entityType, entityId, payload) => void s.logs.push({ eventType, entityType, entityId, payload }),
  }
  return s
}

/** A store as one key reaches it: the personal tables refused without their scope (index.ts `table`). */
function guarded(store: Store, scopes: ReadonlySet<Scope>): Store {
  const check = (t: Table) => {
    const need = PERSONAL[t]
    if (need && !scopes.has(need)) throw new Error(`mcp: ${t} needs the ${need} scope`)
  }
  return {
    ...store,
    find: (t, m, o) => (check(t), store.find(t, m, o)),
    insert: (t, r) => (check(t), store.insert(t, r)),
    patch: (t, m, v) => (check(t), store.patch(t, m, v)),
    remove: (t, m) => (check(t), store.remove(t, m)),
  }
}

export const KEY = newMcpKey()
export const READ_KEY = newMcpKey()
/** A read & write key its owner allowed the journal and people (0080). */
export const PERSONAL_KEY = newMcpKey()
export const JOURNAL_KEY = newMcpKey()

export function deps(store: Store, over: Partial<Deps> = {}): Deps & { counted: boolean[] } {
  const keys: Record<string, { scope: KeyScope; scopes: Scope[] }> = {
    [KEY]: { scope: 'read_write', scopes: [] },
    [READ_KEY]: { scope: 'read', scopes: [] },
    [PERSONAL_KEY]: { scope: 'read_write', scopes: ['journal', 'people'] },
    [JOURNAL_KEY]: { scope: 'read_write', scopes: ['journal'] },
  }
  const counted: boolean[] = []
  return {
    counted,
    async withSession<T>(key: string, count: boolean, fn: (s: Session) => Promise<T>) {
      counted.push(count)
      const k = keys[key]
      return k ? { ok: true as const, value: await fn({ scope: k.scope, scopes: k.scopes, store: guarded(store, new Set(k.scopes)) }) } : { ok: false as const, reason: 'invalid' as const }
    },
    originAllowed: (o) => o === 'http://localhost:5173',
    nextOccurrence,
    ruleBetween,
    now: () => NOW,
    dailyLimit: 500,
    ...over,
  }
}

let nextId = 1
export function post(body: unknown, { key = KEY, headers = {} }: { key?: string | null; headers?: Record<string, string> } = {}): Request {
  return new Request('http://localhost/functions/v1/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
export const rpc = (method: string, params?: unknown) => ({ jsonrpc: '2.0', id: nextId++, method, ...(params === undefined ? {} : { params }) })

/** A legacy (2025-11-25) client's request after initialize. */
export async function legacy(d: Deps, method: string, params?: unknown, key = KEY) {
  const res = await handleMcp(post(rpc(method, params), { key, headers: { 'MCP-Protocol-Version': '2025-11-25' } }), d)
  return { status: res.status, body: (await res.json()) as { result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } } }
}

/** tools/call → the parsed JSON a tool returned (or its error text). */
export async function call(d: Deps, name: string, args: unknown = {}, key = KEY) {
  const { body } = await legacy(d, 'tools/call', { name, arguments: args }, key)
  const result = body.result as { content: { text: string }[]; isError?: boolean }
  return { isError: !!result.isError, text: result.content[0].text, data: result.isError ? null : (JSON.parse(result.content[0].text) as Record<string, any>) }
}
