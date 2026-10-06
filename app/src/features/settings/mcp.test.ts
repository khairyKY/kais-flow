import { describe, expect, it, vi } from 'vitest'

// mcpKey.ts imports the Supabase client, which throws without VITE_ env (CI has none).
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import { handleMcp, KEY_PATTERN, type Deps, type KeyScope, type Session } from '../../../../supabase/functions/mcp/server.ts'
import {
  dayWindow,
  readWhen,
  splitToday,
  tomorrowAt9,
  userZone,
  wallTime,
  type EventRow,
  type ProjectRow,
  type SearchHit,
  type Store,
  type TaskFilter,
  type TaskRow,
} from '../../../../supabase/functions/mcp/tools.ts'
import { nextOccurrence } from '../tasks/recurrence'
import { claudeCodeCommand, claudeDesktopConfig, genericConfig, newMcpKey } from './mcpKey'

// The MCP endpoint end to end — HTTP in, HTTP out — against an in-memory Store whose filters mirror
// index.ts's SQL. "Now" is Sun 4 Oct 2026 11:00 UTC: 14:00 in Cairo (UTC+3), 04:00 in Los Angeles.
const NOW = new Date('2026-10-04T11:00:00Z')
const P1 = '00000000-0000-4000-8000-0000000000a1'
const D1 = '00000000-0000-4000-8000-0000000000d1'
const tid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function task(n: number, title: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: tid(n), title, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, someday: false,
    paused: false, labels: [], priority: null, duration_min: null, project_id: null, domain_id: null, area_id: null, milestone_id: null,
    parent_task_id: null, recurrence_rule: null, reminder_at: null, reminder_sent: false, snoozed_until: null, completed_at: null,
    created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z', ...over,
  }
}

interface Fake extends Store {
  tasks: TaskRow[]
  inbox: { id: string; raw_text: string; payload: Record<string, unknown> }[]
  logs: { eventType: string; entityType: string; entityId: string; payload: Record<string, unknown> }[]
  filters: TaskFilter[]
}

function fakeStore(zone: string | null = 'Africa/Cairo', seed: TaskRow[] = []): Fake {
  const projects: ProjectRow[] = [{ id: P1, name: 'Shaheen Website', status: 'active', type: 'standard', domain_id: D1, target_date: '2026-12-01T00:00:00Z' }]
  const events: EventRow[] = [
    { id: tid(900), title: 'Standup', starts_at: '2026-10-04T07:00:00Z', ends_at: '2026-10-04T07:15:00Z', all_day: false, task_id: null },
    { id: tid(901), title: 'Next week', starts_at: '2026-10-20T07:00:00Z', ends_at: '2026-10-20T08:00:00Z', all_day: false, task_id: null },
  ]
  const hits: SearchHit[] = [
    { entity_type: 'journal_entry', entity_id: tid(800), title: 'Dear diary', snippet: 'private', score: 9 },
    { entity_type: 'task', entity_id: tid(1), title: 'Call the tyre supplier', snippet: null, score: 5 },
    { entity_type: 'person', entity_id: tid(801), title: 'Mona', snippet: 'birthday', score: 4 },
    { entity_type: 'inbox_item', entity_id: tid(802), title: 'tyre prices link', snippet: 'https://…', score: 3 },
  ]
  const s: Fake = {
    tasks: seed.map((t) => ({ ...t })),
    inbox: [],
    logs: [],
    filters: [],
    timezone: async () => zone,
    dayTasks: async (start, end) =>
      s.tasks.filter((t) => {
        if (t.status !== 'todo') return false
        const dated = t.due_at ?? t.scheduled_start
        return t.top3 || (!t.someday && ((!!dated && dated < end) || (!!t.scheduled_start && t.scheduled_start >= start && t.scheduled_start < end)))
      }),
    listTasks: async (f) => {
      s.filters.push(f)
      return s.tasks.filter((t) => f.status === 'all' || (f.status === 'open' ? t.status === 'todo' : t.status === 'done')).slice(0, f.limit)
    },
    getTask: async (id) => s.tasks.find((t) => t.id === id) ?? null,
    projects: async () => projects,
    events: async (from, to) => events.filter((e) => e.starts_at < to && e.ends_at > from),
    search: async (_q, limit) => hits.slice(0, limit),
    top3Count: async () => s.tasks.filter((t) => t.top3 && t.status === 'todo').length,
    openOccurrence: async (title, rule, due, except) =>
      s.tasks.some((t) => t.id !== except && t.status === 'todo' && t.title === title && t.recurrence_rule === rule && t.due_at === due),
    insertTask: async (t) => void s.tasks.push(t),
    markDone: async (id, at) => {
      const t = s.tasks.find((x) => x.id === id && x.status === 'todo')
      if (!t) return false
      Object.assign(t, { status: 'done', completed_at: at, top3: false })
      return true
    },
    setDue: async (id, due) => void Object.assign(s.tasks.find((t) => t.id === id)!, { due_at: due, someday: false }),
    insertInbox: async (row) => void s.inbox.push(row),
    log: async (eventType, entityType, entityId, payload) => void s.logs.push({ eventType, entityType, entityId, payload }),
  }
  return s
}

const KEY = newMcpKey()
const READ_KEY = newMcpKey()

function deps(store: Store, over: Partial<Deps> = {}): Deps & { counted: boolean[] } {
  const keys: Record<string, KeyScope> = { [KEY]: 'read_write', [READ_KEY]: 'read' }
  const counted: boolean[] = []
  return {
    counted,
    async withSession<T>(key: string, count: boolean, fn: (s: Session) => Promise<T>) {
      counted.push(count)
      const scope = keys[key]
      return scope ? { ok: true as const, value: await fn({ scope, store }) } : { ok: false as const, reason: 'invalid' as const }
    },
    originAllowed: (o) => o === 'http://localhost:5173',
    nextOccurrence,
    now: () => NOW,
    dailyLimit: 500,
    ...over,
  }
}

let nextId = 1
function post(body: unknown, { key = KEY, headers = {} }: { key?: string | null; headers?: Record<string, string> } = {}): Request {
  return new Request('http://localhost/functions/v1/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const rpc = (method: string, params?: unknown) => ({ jsonrpc: '2.0', id: nextId++, method, ...(params === undefined ? {} : { params }) })

/** A legacy (2025-11-25) client's request after initialize. */
async function legacy(d: Deps, method: string, params?: unknown, key = KEY) {
  const res = await handleMcp(post(rpc(method, params), { key, headers: { 'MCP-Protocol-Version': '2025-11-25' } }), d)
  return { status: res.status, body: (await res.json()) as { result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } } }
}

/** tools/call → the parsed JSON a tool returned (or its error text). */
async function call(d: Deps, name: string, args: unknown = {}, key = KEY) {
  const { body } = await legacy(d, 'tools/call', { name, arguments: args }, key)
  const result = body.result as { content: { text: string }[]; isError?: boolean }
  return { isError: !!result.isError, text: result.content[0].text, data: result.isError ? null : (JSON.parse(result.content[0].text) as Record<string, any>) }
}

describe('MCP: the user clock', () => {
  it('falls back to Cairo for a missing or unknown zone', () => {
    expect(userZone(null)).toBe('Africa/Cairo')
    expect(userZone('Mars/Olympus')).toBe('Africa/Cairo')
    expect(userZone('Asia/Tokyo')).toBe('Asia/Tokyo')
  })

  it("today's window is the user's day, DST included", () => {
    expect(dayWindow(NOW, 'Africa/Cairo')).toEqual({ date: '2026-10-04', start: new Date('2026-10-03T21:00:00Z'), end: new Date('2026-10-04T21:00:00Z') })
    expect(dayWindow(NOW, 'America/Los_Angeles').date).toBe('2026-10-04')
    expect(dayWindow(new Date('2026-10-04T16:00:00Z'), 'Asia/Tokyo').date).toBe('2026-10-05') // 01:00 Monday in Tokyo
    // LA springs forward on 8 Mar 2026: that day is 23 hours long.
    const spring = dayWindow(new Date('2026-03-08T20:00:00Z'), 'America/Los_Angeles')
    expect([spring.start.toISOString(), spring.end.toISOString()]).toEqual(['2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z'])
  })

  it('"Tomorrow" is 09:00 tomorrow on the user\'s clock', () => {
    expect(tomorrowAt9(NOW, 'Africa/Cairo')).toBe('2026-10-05T06:00:00.000Z')
    expect(tomorrowAt9(NOW, 'America/Los_Angeles')).toBe('2026-10-05T16:00:00.000Z')
    expect(tomorrowAt9(new Date('2026-12-01T10:00:00Z'), 'Africa/Cairo')).toBe('2026-12-02T07:00:00.000Z') // winter: UTC+2
  })

  it('reads dates, local date-times and ISO instants; rejects the rest', () => {
    expect(readWhen('2026-10-05', 'Africa/Cairo')).toEqual({ day: '2026-10-05' })
    expect(readWhen('2026-10-05T15:30', 'Africa/Cairo')).toEqual({ at: new Date('2026-10-05T12:30:00Z') })
    expect(readWhen('2026-10-05T15:30:00Z', 'Africa/Cairo')).toEqual({ at: new Date('2026-10-05T15:30:00Z') })
    for (const bad of ['tomorrow', '2026-02-30', '2026-10-05T25:00', '05/10/2026']) expect(readWhen(bad, 'Africa/Cairo')).toBeNull()
  })

  it('sorts open tasks like the app: Top 3, due or scheduled today, overdue', () => {
    const rows = [
      task(1, 'starred someday', { top3: true, someday: true }),
      task(2, 'due today 23:30 Cairo', { due_at: '2026-10-04T20:30:00Z' }),
      task(3, 'block today, due next week', { due_at: '2026-10-11T06:00:00Z', scheduled_start: '2026-10-04T10:00:00Z' }),
      task(4, 'due yesterday', { due_at: '2026-10-03T06:00:00Z' }),
      task(5, 'someday, overdue', { due_at: '2026-10-01T06:00:00Z', someday: true }),
      task(6, 'due tomorrow 00:30 Cairo', { due_at: '2026-10-04T21:30:00Z' }),
    ]
    const split = splitToday(rows, NOW, 'Africa/Cairo')
    expect(split.top3.map((t) => t.title)).toEqual(['starred someday'])
    expect(split.today.map((t) => t.title)).toEqual(['due today 23:30 Cairo', 'block today, due next week'])
    expect(split.overdue.map((t) => t.title)).toEqual(['due yesterday'])
    // In Los Angeles the 23:30-Cairo task is due at 13:30 the same day; tomorrow-00:30-Cairo is today too.
    expect(splitToday(rows, NOW, 'America/Los_Angeles').today.map((t) => t.id)).toEqual([tid(2), tid(3), tid(6)])
  })
})

describe('MCP: transport and auth', () => {
  it('answers initialize with the asked version, tools capability and instructions — no session', async () => {
    const d = deps(fakeStore())
    const res = await handleMcp(post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })), d)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Mcp-Session-Id')).toBeNull()
    const body = await res.json()
    expect(body.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'kais-flow' } })
    expect(body.result.instructions).toContain("user's own clock")
    const old = await (await handleMcp(post(rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} })), d)).json()
    expect(old.result.protocolVersion).toBe('2025-11-25')
    expect(d.counted).toEqual([false, false]) // only tool calls count against the daily limit
  })

  it('takes notifications with 202 and refuses GET, DELETE, foreign origins, batches and bad JSON', async () => {
    const d = deps(fakeStore())
    const note = await handleMcp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), d)
    expect([note.status, await note.text()]).toEqual([202, ''])
    for (const method of ['GET', 'DELETE']) {
      const res = await handleMcp(new Request('http://localhost/mcp', { method, headers: { Authorization: `Bearer ${KEY}` } }), d)
      expect([res.status, res.headers.get('Allow')]).toEqual([405, 'POST'])
    }
    expect((await handleMcp(post(rpc('ping'), { headers: { Origin: 'https://evil.example' } }), d)).status).toBe(403)
    expect((await handleMcp(post(rpc('ping'), { headers: { Origin: 'http://localhost:5173' } }), d)).status).toBe(200)
    const batch = await handleMcp(post([rpc('ping'), rpc('ping')]), d)
    expect(batch.status).toBe(400)
    const parse = await handleMcp(post('{nope'), d)
    expect([parse.status, (await parse.json()).error.code]).toEqual([400, -32700])
  })

  it('wants an AI access key: missing, malformed and unknown keys get 401 with a hint', async () => {
    const d = deps(fakeStore())
    for (const key of [null, 'kf_' + 'a'.repeat(43), newMcpKey()]) {
      const res = await handleMcp(post(rpc('tools/list'), { key }), d)
      expect(res.status).toBe(401)
      expect(res.headers.get('WWW-Authenticate')).toMatch(/^Bearer /)
      expect((await res.json()).hint).toContain('Settings → Integrations → AI assistants')
    }
  })

  it('the app makes keys the server accepts', () => {
    expect(KEY).toMatch(KEY_PATTERN)
    expect(newMcpKey()).not.toBe(KEY)
  })

  it('lists all ten tools for a read & write key, only the readers for a read-only key', async () => {
    const d = deps(fakeStore())
    const all = (await legacy(d, 'tools/list')).body.result!.tools as { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[]
    expect(all.map((t) => t.name)).toEqual(['today', 'search', 'list_tasks', 'get_task', 'add_task', 'complete_task', 'move_to_tomorrow', 'add_to_inbox', 'calendar', 'projects'])
    expect(all.every((t) => t.inputSchema.type === 'object')).toBe(true)
    expect(all.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(['add_task', 'complete_task', 'move_to_tomorrow', 'add_to_inbox'])
    const read = (await legacy(d, 'tools/list', undefined, READ_KEY)).body.result!.tools as { name: string }[]
    expect(read.map((t) => t.name)).toEqual(['today', 'search', 'list_tasks', 'get_task', 'calendar', 'projects'])
  })

  it('a read-only key cannot write, even by calling a writer by name', async () => {
    const store = fakeStore()
    const r = await call(deps(store), 'add_task', { title: 'sneaky' }, READ_KEY)
    expect(r.isError).toBe(true)
    expect(r.text).toContain('read-only')
    expect(store.tasks).toEqual([])
  })

  it('unknown methods and tools are JSON-RPC errors; a used-up key is a readable tool error', async () => {
    const d = deps(fakeStore())
    expect((await legacy(d, 'resources/list')).body.error!.code).toBe(-32601)
    expect((await legacy(d, 'tools/call', { name: 'drop_tables', arguments: {} })).body.error).toMatchObject({ code: -32602 })
    const limited = deps(fakeStore(), { withSession: async () => ({ ok: false as const, reason: 'limit' as const }) })
    const r = await call(limited, 'today')
    expect(r.isError).toBe(true)
    expect(r.text).toContain('500 tool calls')
  })

  it('a database failure is a short tool error, never the details; a broken session is a 500', async () => {
    const store = fakeStore()
    store.dayTasks = async () => {
      throw new Error('relation "tasks" does not exist: password=hunter2')
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await call(deps(store), 'today')
    expect(r.isError).toBe(true)
    expect(r.text).not.toContain('hunter2')
    const broken = deps(store, { withSession: async () => Promise.reject(new Error('db down')) })
    const res = await handleMcp(post(rpc('tools/list'), { headers: { 'MCP-Protocol-Version': '2025-11-25' } }), broken)
    expect([res.status, (await res.json()).error.code]).toEqual([500, -32603])
    err.mockRestore()
  })
})

describe('MCP: the 2026-07-28 (stateless) protocol', () => {
  const meta = (v = '2026-07-28') => ({ 'io.modelcontextprotocol/protocolVersion': v, 'io.modelcontextprotocol/clientCapabilities': {} })
  const modern = (method: string, params: Record<string, unknown>, headers: Record<string, string>) =>
    post(rpc(method, { ...params, _meta: meta(params._v as string | undefined) }), { headers })

  it('serves a well-formed request with resultType and serverInfo', async () => {
    const d = deps(fakeStore())
    const res = await handleMcp(modern('tools/call', { name: 'projects', arguments: {} }, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'projects' }), d)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.resultType).toBe('complete')
    expect(body.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('kais-flow')
    expect(JSON.parse(body.result.content[0].text).projects[0]).toEqual({ id: P1, name: 'Shaheen Website', status: 'active', type: 'standard', target_date: '2026-12-01' })
    const named = await handleMcp(modern('tools/call', { name: 'projects', arguments: {} }, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': `=?base64?${btoa('projects')}?=` }), d)
    expect(named.status).toBe(200)
  })

  it('server/discover lists both eras', async () => {
    const res = await handleMcp(modern('server/discover', {}, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover' }), deps(fakeStore()))
    const body = await res.json()
    expect(body.result.supportedVersions).toEqual(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'])
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } })
  })

  it('rejects header mismatches, unknown versions, missing _meta and unknown methods with the spec codes', async () => {
    const d = deps(fakeStore())
    const h = { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'today' }
    const cases: [Request, number, number][] = [
      [modern('tools/call', { name: 'projects' }, h), 400, -32020], // Mcp-Name says today
      [modern('tools/call', { name: 'today' }, { ...h, 'Mcp-Method': 'tools/list' }), 400, -32020],
      [modern('tools/call', { name: 'today' }, { 'Mcp-Method': 'tools/call', 'Mcp-Name': 'today' }), 400, -32020], // no version header
      [modern('tools/call', { name: 'today', _v: '2099-01-01' }, { ...h, 'MCP-Protocol-Version': '2099-01-01' }), 400, -32022],
      [post(rpc('tools/list', {}), { headers: { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' } }), 400, -32602],
      [modern('nope/never', {}, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'nope/never' }), 404, -32601],
    ]
    for (const [req, status, code] of cases) {
      const res = await handleMcp(req, d)
      expect([res.status, (await res.json()).error.code]).toEqual([status, code])
    }
    const v = await handleMcp(modern('tools/list', { _v: '2099-01-01' }, { 'MCP-Protocol-Version': '2099-01-01', 'Mcp-Method': 'tools/list' }), d)
    expect((await v.json()).error.data).toEqual({ supported: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'], requested: '2099-01-01' })
  })
})

describe('MCP: the tools', () => {
  const seed = () => [
    task(1, 'Call the tyre supplier', { top3: true, due_at: '2026-10-04T12:00:00Z', project_id: P1, project_name: 'Shaheen Website', labels: ['calls'] }),
    task(2, 'Send the invoice', { due_at: '2026-10-04T06:00:00Z' }),
    task(3, 'Renew the domain', { due_at: '2026-10-02T06:00:00Z' }),
    task(4, 'Water the plants', { due_at: '2026-10-03T06:00:00Z', recurrence_rule: 'FREQ=DAILY', reminder_at: '2026-10-03T05:50:00Z' }),
    task(5, 'Old done thing', { status: 'done', completed_at: '2026-10-01T10:00:00Z' }),
    task(6, 'Next week', { due_at: '2026-10-11T06:00:00Z' }),
  ]

  it('today: Top 3, due today, overdue and events, in the user\'s zone', async () => {
    const r = await call(deps(fakeStore('Africa/Cairo', seed())), 'today')
    expect(r.data).toMatchObject({ date: '2026-10-04', now: '2026-10-04 14:00', timezone: 'Africa/Cairo' })
    expect(r.data!.top3).toEqual([{ id: tid(1), title: 'Call the tyre supplier', due: '2026-10-04 15:00', project: 'Shaheen Website', labels: ['calls'], top3: true }])
    expect(r.data!.today.map((t: { title: string }) => t.title)).toEqual(['Send the invoice'])
    expect(r.data!.overdue.map((t: { title: string }) => t.title)).toEqual(['Renew the domain', 'Water the plants'])
    expect(r.data!.events).toEqual([{ id: tid(900), title: 'Standup', start: '2026-10-04 10:00', end: '2026-10-04 10:15' }])
    // No settings row → Cairo; a Tokyo user sees Tokyo wall time.
    expect((await call(deps(fakeStore(null, seed())), 'today')).data!.timezone).toBe('Africa/Cairo')
    const tokyo = await call(deps(fakeStore('Asia/Tokyo', seed())), 'today')
    expect([tokyo.data!.now, tokyo.data!.top3[0].due]).toEqual(['2026-10-04 20:00', '2026-10-04 21:00'])
  })

  it('search drops journal entries and people', async () => {
    const r = await call(deps(fakeStore()), 'search', { query: 'tyre' })
    expect(r.data!.results).toEqual([
      { type: 'task', id: tid(1), title: 'Call the tyre supplier' },
      { type: 'inbox_item', id: tid(802), title: 'tyre prices link', snippet: 'https://…' },
    ])
    expect((await call(deps(fakeStore()), 'search', {})).text).toBe('"query" is required.')
  })

  it('list_tasks turns dates into user-day bounds and checks its arguments', async () => {
    const store = fakeStore('Africa/Cairo', seed())
    const r = await call(deps(store), 'list_tasks', { status: 'done', due_from: '2026-10-01', due_to: '2026-10-04', label: 'calls', project_id: P1, limit: 5 })
    expect(r.data!.tasks.map((t: { title: string }) => t.title)).toEqual(['Old done thing'])
    expect(store.filters[0]).toEqual({ status: 'done', projectId: P1, label: 'calls', dueFrom: '2026-09-30T21:00:00.000Z', dueTo: '2026-10-04T21:00:00.000Z', limit: 5 })
    for (const [args, msg] of [
      [{ status: 'later' }, 'one of: open, done, all'],
      [{ limit: 500 }, 'from 1 to 100'],
      [{ project_id: 'Shaheen' }, 'UUID'],
      [{ due_from: 'next friday' }, 'YYYY-MM-DD'],
      [{ due_date: '2026-10-01' }, 'Unknown argument "due_date"'],
    ] as const) {
      const bad = await call(deps(store), 'list_tasks', args)
      expect(bad.isError).toBe(true)
      expect(bad.text).toContain(msg)
    }
  })

  it('get_task returns the details, or says it is gone', async () => {
    const store = fakeStore('Africa/Cairo', [task(7, 'Write the brief', { notes: 'two pages', duration_min: 45, reminder_at: '2026-10-05T05:45:00Z' })])
    expect((await call(deps(store), 'get_task', { id: tid(7) })).data!.task).toEqual({
      id: tid(7), title: 'Write the brief', notes: 'two pages', duration_min: 45, reminder: '2026-10-05 08:45', created: '2026-09-01 11:00',
    })
    expect((await call(deps(store), 'get_task', { id: tid(99) })).text).toContain('No task with id')
  })

  it("add_task: a bare date is 09:00 on the user's clock, the project brings its domain, it's logged", async () => {
    const store = fakeStore('America/Los_Angeles')
    const r = await call(deps(store), 'add_task', { title: '  Book the dentist ', due: '2026-10-07', project_id: P1, top3: true, notes: 'ask for Friday' })
    expect(r.data!.added).toMatchObject({ title: 'Book the dentist', due: '2026-10-07 09:00', project: 'Shaheen Website', top3: true })
    const [t] = store.tasks
    expect(t).toMatchObject({ title: 'Book the dentist', due_at: '2026-10-07T16:00:00.000Z', project_id: P1, domain_id: D1, top3: true, status: 'todo', someday: false, notes: 'ask for Friday', created_at: NOW.toISOString() })
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(store.logs).toEqual([
      { eventType: 'task.created', entityType: 'task', entityId: t.id, payload: { title: 'Book the dentist', source: 'mcp' } },
      { eventType: 'task.starred', entityType: 'task', entityId: t.id, payload: { source: 'mcp' } },
    ])
    const timed = await call(deps(store), 'add_task', { title: 'Call back', due: '2026-10-07T15:30' })
    expect(timed.data!.added.due).toBe('2026-10-07 15:30')
  })

  it('add_task refuses a fourth Top 3 pick, an unknown project and an empty title — writing nothing', async () => {
    const store = fakeStore('Africa/Cairo', [1, 2, 3].map((n) => task(n, `pick ${n}`, { top3: true })))
    for (const [args, msg] of [
      [{ title: 'one more', top3: true }, 'Top 3 is full'],
      [{ title: 'x', project_id: tid(404) }, 'No project with id'],
      [{ title: '   ' }, `"title" can't be empty`],
    ] as const) {
      const r = await call(deps(store), 'add_task', args)
      expect([r.isError, r.text.includes(msg)]).toEqual([true, true])
    }
    expect(store.tasks).toHaveLength(3)
    expect(store.logs).toEqual([])
  })

  it("complete_task: done and logged; a repeat's next occurrence is created once, reminder kept", async () => {
    const store = fakeStore('Africa/Cairo', seed())
    const r = await call(deps(store), 'complete_task', { id: tid(4) })
    expect(r.data!.done).toMatchObject({ title: 'Water the plants', status: 'done', completed: '2026-10-04 14:00' })
    expect(r.data!.next).toMatchObject({ title: 'Water the plants', due: '2026-10-04 09:00', repeats: 'FREQ=DAILY' })
    const next = store.tasks.find((t) => t.id === r.data!.next.id)!
    expect(next).toMatchObject({ status: 'todo', due_at: '2026-10-04T06:00:00.000Z', reminder_at: '2026-10-04T05:50:00.000Z', reminder_sent: false, completed_at: null })
    expect(store.logs.map((l) => [l.eventType, l.entityId])).toEqual([['task.completed', tid(4)], ['task.created', next.id]])
    expect(store.logs[1].payload).toEqual({ recurrence_parent: tid(4), source: 'mcp' })
    // Already done → says so, writes nothing more.
    const again = await call(deps(store), 'complete_task', { id: tid(4) })
    expect([again.isError, again.text]).toEqual([true, '"Water the plants" is already done.'])
    expect(store.logs).toHaveLength(2)
  })

  it('complete_task: a repeat rule rrule chokes on writes nothing', async () => {
    const store = fakeStore('Africa/Cairo', [task(8, 'Weird repeat', { due_at: '2026-10-03T06:00:00Z', recurrence_rule: 'FREQ=SOMETIMES' })])
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const choke = () => {
      throw new Error('Invalid frequency')
    }
    const r = await call(deps(store, { nextOccurrence: choke }), 'complete_task', { id: tid(8) })
    err.mockRestore()
    expect(r.isError).toBe(true)
    expect(store.tasks[0].status).toBe('todo')
    expect(store.logs).toEqual([])
  })

  it("move_to_tomorrow: tomorrow 09:00 on the user's clock, logged as a reschedule", async () => {
    const store = fakeStore('America/Los_Angeles', [task(9, 'Pay rent', { due_at: '2026-10-03T16:00:00Z', someday: true })])
    const r = await call(deps(store), 'move_to_tomorrow', { id: tid(9) })
    expect(r.data!.moved.due).toBe('2026-10-05 09:00')
    expect(store.tasks[0]).toMatchObject({ due_at: '2026-10-05T16:00:00.000Z', someday: false })
    expect(store.logs).toEqual([{ eventType: 'task.rescheduled', entityType: 'task', entityId: tid(9), payload: { due_at: '2026-10-05T16:00:00.000Z', source: 'mcp' } }])
  })

  it('add_to_inbox: a pending text capture with the link underneath, logged like ⌘K', async () => {
    const store = fakeStore()
    const r = await call(deps(store), 'add_to_inbox', { text: 'tyre prices', url: 'https://example.com/tyres' })
    expect(r.data!.added_to_inbox.text).toBe('tyre prices\nhttps://example.com/tyres')
    expect(store.inbox).toEqual([{ id: r.data!.added_to_inbox.id, raw_text: 'tyre prices\nhttps://example.com/tyres', payload: { source: 'mcp', url: 'https://example.com/tyres' } }])
    expect(store.logs[0]).toMatchObject({ eventType: 'inbox.captured', entityType: 'inbox_item', payload: { kind: 'text', source: 'mcp' } })
    expect((await call(deps(store), 'add_to_inbox', { text: 'x', url: 'javascript:alert(1)' })).text).toContain('http(s) link')
  })

  it('calendar: this week by default, inclusive days, at most 31 days', async () => {
    const d = deps(fakeStore())
    const week = await call(d, 'calendar')
    expect(week.data).toMatchObject({ from: '2026-10-04 00:00', until: '2026-10-11 00:00', timezone: 'Africa/Cairo' })
    expect(week.data!.events.map((e: { title: string }) => e.title)).toEqual(['Standup'])
    expect((await call(d, 'calendar', { from: '2026-10-20', to: '2026-10-20' })).data!.events.map((e: { title: string }) => e.title)).toEqual(['Next week'])
    expect((await call(d, 'calendar', { from: '2026-10-01', to: '2026-12-01' })).text).toContain('At most 31 days')
    expect((await call(d, 'calendar', { from: '2026-10-05', to: '2026-10-04' })).text).toContain('on or after')
  })
})

describe('MCP: client config snippets', () => {
  const key = 'kf_ai_' + 'k'.repeat(43)

  it('Claude Code: one command, the key in a header', () => {
    expect(claudeCodeCommand(key)).toMatch(/^claude mcp add --transport http kais-flow \S+\/functions\/v1\/mcp --header "Authorization: Bearer kf_ai_k{43}"$/)
  })

  it('Claude Desktop: mcp-remote with the space kept out of args', () => {
    const cfg = JSON.parse(claudeDesktopConfig(key)).mcpServers['kais-flow']
    expect(cfg.command).toBe('npx')
    expect(cfg.args.slice(0, 2)).toEqual(['-y', 'mcp-remote'])
    expect(cfg.args[2]).toMatch(/\/functions\/v1\/mcp$/)
    expect(cfg.args.slice(3)).toEqual(['--header', 'Authorization:${KF_AUTH}'])
    expect(cfg.args.join(' ')).not.toContain(key) // the key lives in env, not in the visible args
    expect(cfg.env).toEqual({ KF_AUTH: `Bearer ${key}` })
  })

  it('generic: url + headers, and placeholders until a key exists', () => {
    expect(JSON.parse(genericConfig(key)).mcpServers['kais-flow']).toMatchObject({ type: 'http', headers: { Authorization: `Bearer ${key}` } })
    expect(genericConfig()).toContain('Bearer <your key>')
    expect(wallTime('2026-10-04T21:30:00Z', 'Africa/Cairo')).toBe('2026-10-05 00:30')
  })
})
