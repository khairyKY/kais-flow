import { describe, expect, it, vi } from 'vitest'

// mcpKey.ts imports the Supabase client, which throws without VITE_ env (CI has none).
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import { handleMcp, KEY_PATTERN } from '../../../../supabase/functions/mcp/server.ts'
import { dayWindow, readWhen, replanMoves, settle, snoozePreset, splitToday, tomorrowAt9, userZone, wallTime, type BlockRow } from '../../../../supabase/functions/mcp/tools.ts'
import { claudeCodeCommand, claudeDesktopConfig, genericConfig, newMcpKey } from './mcpKey'
// The MCP endpoint end to end — HTTP in, HTTP out — against the in-memory Store in ./mcpFake (its
// filters mirror index.ts's SQL). "Now" is Sun 4 Oct 2026 11:00 UTC: 14:00 in Cairo, 04:00 in LA.
import { call, D1, deps, fakeStore, KEY, legacy, NOW, P1, post, READ_KEY, rpc, task, tid } from './mcpFake'

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

  it('sorts open tasks like the app: Top 3 (goal first), due or scheduled today, overdue', () => {
    const rows = [
      task(1, 'starred someday', { top3: true, someday: true }),
      task(2, 'due today 23:30 Cairo', { due_at: '2026-10-04T20:30:00Z' }),
      task(3, 'block today, due next week', { due_at: '2026-10-11T06:00:00Z', scheduled_start: '2026-10-04T10:00:00Z' }),
      task(4, 'due yesterday', { due_at: '2026-10-03T06:00:00Z' }),
      task(5, 'someday, overdue', { due_at: '2026-10-01T06:00:00Z', someday: true }),
      task(6, 'due tomorrow 00:30 Cairo', { due_at: '2026-10-04T21:30:00Z' }),
      task(7, 'pick moved to Thursday', { top3: true, top3_rank: 1, due_at: '2026-10-08T06:00:00Z' }),
      task(8, 'unranked pick, yesterday', { top3: true, due_at: '2026-10-03T06:00:00Z' }),
      task(9, 'second pick, due today', { top3: true, top3_rank: 2, due_at: '2026-10-04T08:00:00Z' }),
      task(10, 'the goal', { top3: true, top3_rank: 1 }),
    ]
    const split = splitToday(rows, NOW, 'Africa/Cairo')
    // The Top 3 rule: someday and moved picks aren't today's; yesterday's unfinished pick still is.
    expect(split.top3.map((t) => t.title)).toEqual(['the goal', 'second pick, due today', 'unranked pick, yesterday'])
    expect(split.today.map((t) => t.title)).toEqual(['due today 23:30 Cairo', 'block today, due next week'])
    expect(split.overdue.map((t) => t.title)).toEqual(['due yesterday'])
    // In Los Angeles the 23:30-Cairo task is due at 13:30 the same day; tomorrow-00:30-Cairo is today too.
    expect(splitToday(rows, NOW, 'America/Los_Angeles').today.map((t) => t.id)).toEqual([tid(2), tid(3), tid(6)])
  })
})

// Snooze (Kai 2026-10-17): the app's SnoozeMenu words, on the user's clock. NOW is a Sunday — 14:00 in
// Cairo, 04:00 in LA, 20:00 in Tokyo — so "next week" is the Monday after tomorrow's (dateShortcuts).
describe('MCP: snooze', () => {
  it("reads the Snooze menu's words on the user's clock", () => {
    expect(['later today', 'This evening', 'tomorrow', 'next week'].map((w) => snoozePreset(w, NOW, 'Africa/Cairo'))).toEqual([
      '2026-10-04T14:00:00.000Z', '2026-10-04T15:00:00.000Z', '2026-10-05T06:00:00.000Z', '2026-10-12T06:00:00.000Z',
    ])
    expect(snoozePreset('this evening', NOW, 'America/Los_Angeles')).toBe('2026-10-05T01:00:00.000Z') // 18:00 Sunday in LA
    expect(snoozePreset('this evening', NOW, 'Asia/Tokyo')).toBe('2026-10-05T09:00:00.000Z') // past 18:00 there: Monday's
    expect(snoozePreset('next week', NOW, 'Asia/Tokyo')).toBe('2026-10-12T00:00:00.000Z')
    expect(snoozePreset('next week', new Date('2026-10-07T08:00:00Z'), 'Africa/Cairo')).toBe('2026-10-12T06:00:00.000Z') // a Wednesday: the coming Monday
    expect(snoozePreset('soonish', NOW, 'Africa/Cairo')).toBeNull()
  })

  it('snooze_task: off Today until then, the date kept, a pick lets its place go; unsnooze_task brings it back', async () => {
    const store = fakeStore('Africa/Cairo', [task(40, 'Call the bank', { due_at: '2026-10-04T06:00:00Z', top3: true, top3_rank: 1 }), task(41, 'Buy milk', { due_at: '2026-10-04T08:00:00Z' })])
    const d = deps(store)
    const r = await call(d, 'snooze_task', { id: tid(40), until: 'later today' })
    expect(r.data).toMatchObject({ back: '2026-10-04 17:00', note: "left today's Top 3" })
    expect(store.tasks.find((t) => t.id === tid(40))).toMatchObject({ snoozed_until: '2026-10-04T14:00:00.000Z', due_at: '2026-10-04T06:00:00Z', top3: false, top3_rank: null })
    expect(store.logs.at(-1)).toMatchObject({ eventType: 'task.snoozed', entityId: tid(40), payload: { snoozed_until: '2026-10-04T14:00:00.000Z', source: 'mcp' } })
    const day = (await call(d, 'today')).data!
    expect([...day.top3, ...day.today, ...day.overdue].map((t: { title: string }) => t.title)).toEqual(['Buy milk'])
    // A local date-time, and several at once.
    const both = await call(d, 'snooze_task', { ids: [tid(40), tid(41)], until: '2026-10-06T08:30' })
    expect(both.data!.results.map((x: { back: string }) => x.back)).toEqual(['2026-10-06 08:30', '2026-10-06 08:30'])
    const back = await call(d, 'unsnooze_task', { id: tid(41) })
    expect(back.isError).toBeFalsy()
    expect(store.tasks.find((t) => t.id === tid(41))!.snoozed_until).toBeNull()
    expect(store.logs.at(-1)).toMatchObject({ eventType: 'task.unsnoozed', entityId: tid(41) })
    expect((await call(d, 'today')).data!.today.map((t: { title: string }) => t.title)).toEqual(['Buy milk'])
  })

  it('refuses a time already past, a word it does not know, and unsnoozing a task that is not snoozed', async () => {
    const d = deps(fakeStore('Africa/Cairo', [task(42, 'Water the ferns')]))
    const past = await call(d, 'snooze_task', { id: tid(42), until: '2026-10-04T13:00' })
    expect([past.isError, past.text]).toEqual([true, `"until" must be in the future (it's 2026-10-04 14:00 now).`])
    expect((await call(d, 'snooze_task', { id: tid(42), until: 'soonish' })).isError).toBe(true)
    const not = await call(d, 'unsnooze_task', { id: tid(42) })
    expect([not.isError, not.text]).toEqual([true, `"Water the ferns" isn't snoozed.`])
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

  it('lists every tool but the personal ones for a read & write key, only the readers for a read-only key', async () => {
    const d = deps(fakeStore())
    const all = (await legacy(d, 'tools/list')).body.result!.tools as { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean; destructiveHint?: boolean } }[]
    expect(all.map((t) => t.name)).toEqual([
      'today', 'search', 'list_tasks', 'get_task', 'add_task', 'edit_task', 'reschedule_task', 'complete_task', 'reopen_task', 'move_to_tomorrow', 'duplicate_task', 'snooze_task', 'unsnooze_task', 'add_to_inbox',
      'calendar', 'add_event', 'edit_event', 'delete_event', 'duplicate_event', 'projects',
      'get_project', 'save_project', 'update_milestone', 'update_checklist', 'checklist_template', 'save_area', 'save_domain', 'labels', 'update_label', 'smart_lists',
      'trash', 'move_to_trash', 'restore_from_trash', 'settings', 'update_settings', 'inbox', 'file_inbox_item', 'update_inbox_item',
      'routines', 'save_routine', 'check_routine', 'start_focus', 'stop_focus', 'plan_my_day', 'shut_down', 'library', 'save_library_item', 'delete_library_item',
      'insights', 'activity',
    ])
    expect(all.every((t) => t.inputSchema.type === 'object')).toBe(true)
    const writers = [
      'add_task', 'edit_task', 'reschedule_task', 'complete_task', 'reopen_task', 'move_to_tomorrow', 'duplicate_task', 'snooze_task', 'unsnooze_task', 'add_to_inbox', 'add_event', 'edit_event', 'delete_event',
      'duplicate_event', 'save_project', 'update_milestone', 'update_checklist', 'checklist_template', 'save_area', 'save_domain', 'update_label', 'move_to_trash', 'restore_from_trash',
      'update_settings', 'file_inbox_item', 'update_inbox_item', 'save_routine', 'check_routine', 'start_focus', 'stop_focus', 'plan_my_day', 'shut_down',
      'save_library_item', 'delete_library_item',
    ]
    expect(all.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(writers)
    // Only the deletes with no Trash behind them say so.
    expect(all.filter((t) => t.annotations.destructiveHint).map((t) => t.name)).toEqual(['delete_library_item'])
    // The instructions name every writer, so the model knows which calls change real data.
    const init = await (await handleMcp(post(rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {} })), d)).json()
    for (const w of writers) expect(init.result.instructions).toContain(w)
    const read = (await legacy(d, 'tools/list', undefined, READ_KEY)).body.result!.tools as { name: string }[]
    expect(read.map((t) => t.name)).toEqual([
      'today', 'search', 'list_tasks', 'get_task', 'calendar', 'projects', 'get_project', 'labels', 'smart_lists', 'trash', 'settings', 'inbox', 'routines', 'library', 'insights', 'activity',
    ])
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
    expect(JSON.parse(body.result.content[0].text).projects[0]).toEqual({ id: P1, name: 'Shaheen Website', status: 'active', type: 'standard', target_date: '2026-12-01', domain: 'Work' })
    const named = await handleMcp(modern('tools/call', { name: 'projects', arguments: {} }, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': `=?base64?${btoa('projects')}?=` }), d)
    expect(named.status).toBe(200)
  })

  it('tools/list carries the 2026-07-28 cache hints (ttlMs + private cacheScope); other methods do not', async () => {
    const d = deps(fakeStore())
    const list = await (await handleMcp(modern('tools/list', {}, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' }), d)).json()
    expect(list.result.ttlMs).toBe(300_000)
    expect(list.result.cacheScope).toBe('private')
    expect(list.result.tools.length).toBeGreaterThan(0)
    const call = await (await handleMcp(modern('tools/call', { name: 'projects', arguments: {} }, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'projects' }), d)).json()
    expect(call.result.ttlMs).toBeUndefined()
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
    task(10, 'Moved pick', { top3: true, due_at: '2026-10-08T06:00:00Z' }), // starred, then moved to Thursday
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
    const store = fakeStore('Africa/Cairo', seed().map((t) => (t.id === tid(5) ? { ...t, project_id: P1, labels: ['calls'] } : t)))
    const r = await call(deps(store), 'list_tasks', { status: 'done', due_from: '2026-10-01', due_to: '2026-10-04', label: 'calls', project_id: P1, limit: 5 })
    expect(r.data!.tasks.map((t: { title: string }) => t.title)).toEqual(['Old done thing'])
    expect(store.filters[0]).toEqual({ status: 'done', projectId: P1, areaId: null, label: 'calls', someday: null, dueFrom: '2026-09-30T21:00:00.000Z', dueTo: '2026-10-04T21:00:00.000Z', limit: 5 })
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
    const r = await call(deps(store), 'add_task', { title: '  Book the dentist ', due: '2026-10-07', project_id: P1, notes: 'ask for Friday' })
    expect(r.data!.added).toMatchObject({ title: 'Book the dentist', due: '2026-10-07 09:00', project: 'Shaheen Website' })
    const [t] = store.tasks
    expect(t).toMatchObject({ title: 'Book the dentist', due_at: '2026-10-07T16:00:00.000Z', project_id: P1, domain_id: D1, top3: false, status: 'todo', someday: false, notes: 'ask for Friday', created_at: NOW.toISOString() })
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(store.logs).toEqual([
      { eventType: 'task.created', entityType: 'task', entityId: t.id, payload: { title: 'Book the dentist', source: 'mcp' } },
    ])
    const timed = await call(deps(store), 'add_task', { title: 'Call back', due: '2026-10-07T15:30' })
    expect(timed.data!.added.due).toBe('2026-10-07 15:30')
  })

  it("add_task with top3: the Top 3 is today's, so a later date comes to today at its own time (flipTop3)", async () => {
    const store = fakeStore('America/Los_Angeles') // now = Sun 4 Oct, 04:00 in LA
    const later = await call(deps(store), 'add_task', { title: 'Book the dentist', due: '2026-10-07', top3: true })
    expect(later.data!.added).toMatchObject({ due: '2026-10-04 09:00', top3: true })
    expect(store.tasks[0]).toMatchObject({ due_at: '2026-10-04T16:00:00.000Z', top3: true })
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.created', 'task.starred'])
    expect((await call(deps(store), 'add_task', { title: 'Call back', due: '2026-10-09T15:30', top3: true })).data!.added.due).toBe('2026-10-04 15:30')
    // Today or earlier stays where it is; no date stays undated.
    expect((await call(deps(store), 'add_task', { title: 'Late one', due: '2026-10-02T10:00', top3: true })).data!.added.due).toBe('2026-10-02 10:00')
    expect((await call(deps(fakeStore('America/Los_Angeles')), 'add_task', { title: 'Whenever', top3: true })).data!.added.due).toBeUndefined()
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
    // A pick moved to another day or parked as someday isn't one of today's three.
    const stale = fakeStore('Africa/Cairo', [
      task(1, 'pick', { top3: true }),
      task(2, 'moved to Thursday', { top3: true, due_at: '2026-10-08T06:00:00Z' }),
      task(3, 'parked', { top3: true, someday: true }),
      task(4, 'pick today', { top3: true, due_at: '2026-10-04T06:00:00Z' }),
    ])
    expect((await call(deps(stale), 'add_task', { title: 'one more', top3: true })).isError).toBe(false)
  })

  it("complete_task: done and logged; a repeat's next occurrence is created once, reminder kept", async () => {
    const store = fakeStore('Africa/Cairo', seed())
    const r = await call(deps(store), 'complete_task', { id: tid(4) })
    expect(r.data!.done).toMatchObject({ title: 'Water the plants', status: 'done', completed: '2026-10-04 14:00' })
    // Rolls from max(due, today) like the app (_shared/repeat.ts): due yesterday, done at 14:00 today →
    // tomorrow 09:00, not today's 09:00 that has already gone by.
    expect(r.data!.next).toMatchObject({ title: 'Water the plants', due: '2026-10-05 09:00', repeats: 'FREQ=DAILY' })
    const next = store.tasks.find((t) => t.id === r.data!.next.id)!
    expect(next).toMatchObject({ status: 'todo', due_at: '2026-10-05T06:00:00.000Z', reminder_at: '2026-10-05T05:50:00.000Z', reminder_sent: false, completed_at: null })
    expect(store.logs.map((l) => [l.eventType, l.entityId])).toEqual([['task.completed', tid(4)], ['task.created', next.id]])
    expect(store.logs[1].payload).toEqual({ recurrence_parent: tid(4), source: 'mcp' })
    // Already done → says so, writes nothing more.
    const again = await call(deps(store), 'complete_task', { id: tid(4) })
    expect([again.isError, again.text]).toEqual([true, '"Water the plants" is already done.'])
    expect(store.logs).toHaveLength(2)
  })

  it('complete_task: "Ends after N times" counts down on the copies and the last one ends the series (p7e A13)', async () => {
    const store = fakeStore('Africa/Cairo', [task(9, 'Stretch', { due_at: '2026-10-04T06:00:00Z', recurrence_rule: 'FREQ=DAILY;COUNT=2' })])
    const r = await call(deps(store), 'complete_task', { id: tid(9) })
    expect(r.data!.next).toMatchObject({ due: '2026-10-05 09:00', repeats: 'FREQ=DAILY;COUNT=1' })
    const last = await call(deps(store), 'complete_task', { id: r.data!.next.id })
    expect(last.data!.next ?? null).toBeNull()
    expect(store.tasks.filter((t) => t.status === 'todo')).toHaveLength(0)
  })

  it('complete_task: a daily task finished five days late comes back tomorrow, not four days overdue', async () => {
    const store = fakeStore('Africa/Cairo', [task(9, 'Stretch', { due_at: '2026-09-29T06:00:00Z', recurrence_rule: 'FREQ=DAILY' })])
    const r = await call(deps(store), 'complete_task', { id: tid(9) })
    expect(r.data!.next).toMatchObject({ due: '2026-10-05 09:00' })
  })

  it('complete_task: a weekly Monday rule keeps its weekday on the user’s clock', async () => {
    // 2026-10-04 is a Sunday; a Monday 08:00 Tokyo series rolls to Monday 5 Oct 08:00 Tokyo (Sunday 23:00 UTC).
    const store = fakeStore('Asia/Tokyo', [task(10, 'Review', { due_at: '2026-09-27T23:00:00Z', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO' })])
    const r = await call(deps(store), 'complete_task', { id: tid(10) })
    expect(r.data!.next).toMatchObject({ due: '2026-10-05 08:00' })
  })

  it('complete_task: a paused series is ticked off without a next copy (A14)', async () => {
    const store = fakeStore('Africa/Cairo', [task(14, 'Water the ferns', { due_at: '2026-10-03T06:00:00Z', recurrence_rule: 'FREQ=DAILY', paused: true })])
    const r = await call(deps(store), 'complete_task', { id: tid(14) })
    expect(r.data!.done).toMatchObject({ title: 'Water the ferns', status: 'done', paused: true })
    expect(r.data!.next).toBeUndefined()
    expect(store.tasks).toHaveLength(1)
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.completed'])
  })

  it('today: a paused series is in no list and holds no Top 3 place (A14)', async () => {
    const store = fakeStore('Africa/Cairo', [
      task(15, 'Paused pick', { top3: true, paused: true, recurrence_rule: 'FREQ=DAILY', due_at: '2026-10-04T06:00:00Z' }),
      task(16, 'Paused, overdue', { paused: true, recurrence_rule: 'FREQ=WEEKLY', due_at: '2026-10-01T06:00:00Z' }),
      task(17, 'Live', { due_at: '2026-10-04T06:00:00Z' }),
    ])
    const r = await call(deps(store), 'today')
    expect([r.data!.top3, r.data!.today.map((t: { title: string }) => t.title), r.data!.overdue]).toEqual([[], ['Live'], []])
    // splitToday alone (a store that hands it a paused row anyway) says the same.
    expect(splitToday(store.tasks, NOW, 'Africa/Cairo')).toMatchObject({ top3: [], overdue: [] })
    // …and three paused picks leave the Top 3 open.
    const three = fakeStore('Africa/Cairo', [1, 2, 3].map((n) => task(n, `paused ${n}`, { top3: true, paused: true })))
    expect((await call(deps(three), 'add_task', { title: 'one more', top3: true })).isError).toBe(false)
  })

  describe('complete_task: a parent with subtasks (Kai 2026-10-16, 4 C)', () => {
    const family = (over: Partial<Parameters<typeof task>[2]> = {}) =>
      fakeStore('Africa/Cairo', [
        task(20, 'Finish the sheet', { due_at: '2026-10-04T06:00:00Z', ...over }),
        task(21, 'Read the notes', { parent_task_id: tid(20), status: 'done', completed_at: '2026-10-04T08:00:00Z', created_at: '2026-09-02T08:00:00Z' }),
        task(22, 'Questions 1–5', { parent_task_id: tid(20), created_at: '2026-09-02T08:01:00Z' }),
        task(23, 'Questions 6–10', { parent_task_id: tid(20), created_at: '2026-09-02T08:02:00Z' }),
      ])
    const status = (store: ReturnType<typeof fakeStore>, n: number) => store.tasks.find((t) => t.id === tid(n))!.status

    it("by default ('leave') its open subtasks stay open, and the answer says so", async () => {
      const store = family()
      const r = await call(deps(store), 'complete_task', { id: tid(20) })
      expect([status(store, 20), status(store, 22), status(store, 23)]).toEqual(['done', 'todo', 'todo'])
      expect(r.data!.subtasks).toBe("left its 2 subtasks open: Questions 1–5; Questions 6–10 (subtasks: 'complete' ticks them)")
      expect(store.logs.map((l) => l.eventType)).toEqual(['task.completed'])
    })

    it("subtasks: 'complete' ticks them too, each logged", async () => {
      const store = family()
      const r = await call(deps(store), 'complete_task', { id: tid(20), subtasks: 'complete' })
      expect([status(store, 20), status(store, 22), status(store, 23)]).toEqual(['done', 'done', 'done'])
      expect(r.data!.subtasks).toBe('ticked its 2 subtasks still open too: Questions 1–5; Questions 6–10')
      expect(store.logs.map((l) => [l.eventType, l.entityId])).toEqual([['task.completed', tid(20)], ['task.completed', tid(22)], ['task.completed', tid(23)]])
    })

    it('says nothing of subtasks when none is open; refuses an unknown choice', async () => {
      const store = fakeStore('Africa/Cairo', [task(30, 'Solo', {})])
      expect((await call(deps(store), 'complete_task', { id: tid(30) })).data!.subtasks).toBeUndefined()
      const bad = await call(deps(family()), 'complete_task', { id: tid(20), subtasks: 'all' })
      expect([bad.isError, bad.text]).toEqual([true, '"subtasks" must be one of: leave, complete.'])
    })

    it("a repeating parent's subtasks go with it to the next occurrence, open again (as the app)", async () => {
      const store = family({ recurrence_rule: 'FREQ=DAILY' })
      const r = await call(deps(store), 'complete_task', { id: tid(20), subtasks: 'complete' })
      const next = r.data!.next.id
      expect([21, 22, 23].map((n) => store.tasks.find((t) => t.id === tid(n))).map((t) => [t!.parent_task_id, t!.status])).toEqual([[next, 'todo'], [next, 'todo'], [next, 'todo']])
      expect(r.data!.subtasks).toBe('its 3 subtasks went with it to the next occurrence, open again')
    })

    it('duplicate_task: an open copy, off the calendar and out of the Top 3; the subtasks come along open, in order (Kai 2026-10-17)', async () => {
      const store = family({ top3: true, top3_rank: 1, scheduled_start: '2026-10-04T12:00:00Z', scheduled_end: '2026-10-04T12:30:00Z', labels: ['study'], priority: 2 })
      const r = await call(deps(store), 'duplicate_task', { id: tid(20) })
      const copy = store.tasks.find((t) => t.id === r.data!.duplicated.id)!
      expect(copy).toMatchObject({ title: 'Finish the sheet', status: 'todo', due_at: '2026-10-04T06:00:00Z', labels: ['study'], priority: 2, top3: false, top3_rank: null, scheduled_start: null, scheduled_end: null, created_at: NOW.toISOString() })
      const subs = store.tasks.filter((t) => t.parent_task_id === copy.id)
      expect(subs.map((t) => [t.title, t.status])).toEqual([['Read the notes', 'todo'], ['Questions 1–5', 'todo'], ['Questions 6–10', 'todo']])
      expect(subs.map((t) => t.created_at)).toEqual(['2026-10-04T11:00:00.001Z', '2026-10-04T11:00:00.002Z', '2026-10-04T11:00:00.003Z'])
      expect(r.data!.subtasks).toEqual(['Read the notes', 'Questions 1–5', 'Questions 6–10'])
      expect(store.logs.map((l) => [l.eventType, l.payload.duplicate_of])).toEqual([['task.created', tid(20)], ['task.created', tid(21)], ['task.created', tid(22)], ['task.created', tid(23)]])
      // The original is untouched.
      expect(store.tasks.find((t) => t.id === tid(20))).toMatchObject({ top3: true, scheduled_start: '2026-10-04T12:00:00Z' })
    })

    it('duplicate_task: a subtask copies under the same parent; picked with its parent, it comes along once', async () => {
      const store = family()
      const one = await call(deps(store), 'duplicate_task', { id: tid(22) })
      expect(store.tasks.find((t) => t.id === one.data!.duplicated.id)!.parent_task_id).toBe(tid(20))
      const both = fakeStore('Africa/Cairo', family().tasks)
      const r = await call(deps(both), 'duplicate_task', { ids: [tid(22), tid(20)] })
      expect(r.data!.results[0]).toMatchObject({ duplicated: null })
      expect(both.tasks.filter((t) => t.title === 'Questions 1–5')).toHaveLength(2)
      expect(both.tasks).toHaveLength(8) // 4 + the parent's copy with its 3
    })

    it("move_to_trash takes a parent's subtasks along; restore_from_trash brings them back together", async () => {
      const store = family()
      store.tasks.push(task(24, 'Binned before', { parent_task_id: tid(20), deleted_at: '2026-10-01T08:00:00Z' } as Partial<Parameters<typeof task>[2]>))
      const gone = await call(deps(store), 'move_to_trash', { type: 'task', id: tid(20) })
      expect(gone.data!.trashed).toMatchObject({ title: 'Finish the sheet', with_subtasks: 3 })
      expect([20, 21, 22, 23].every((n) => store.tasks.find((t) => t.id === tid(n))!.deleted_at === NOW.toISOString())).toBe(true)
      const back = await call(deps(store), 'restore_from_trash', { type: 'task', id: tid(20) })
      expect(back.data!.restored).toMatchObject({ with_subtasks: 3 })
      expect([20, 21, 22, 23].map((n) => store.tasks.find((t) => t.id === tid(n))!.deleted_at ?? null)).toEqual([null, null, null, null])
      expect(store.tasks.find((t) => t.id === tid(24))!.deleted_at).toBe('2026-10-01T08:00:00Z')
    })
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
    expect(r.data!.calendar_blocks_removed).toBeUndefined()
  })

  it('move_to_tomorrow: the reminder keeps its lead, blocks follow a date-only replan, the pick lets go', async () => {
    // Due today 15:00 Cairo, reminded at 14:50 (already sent), the goal; a block today and one tomorrow.
    const blocks = [
      { id: tid(500), task_id: tid(11), starts_at: '2026-10-04T12:00:00Z', ends_at: '2026-10-04T12:30:00Z', all_day: false, deleted_at: null },
      { id: tid(501), task_id: tid(11), starts_at: '2026-10-05T07:00:00Z', ends_at: '2026-10-05T08:00:00Z', all_day: false, deleted_at: null },
      { id: tid(502), task_id: tid(12), starts_at: '2026-10-04T12:00:00Z', ends_at: '2026-10-04T13:00:00Z', all_day: false, deleted_at: null },
    ]
    const store = fakeStore('Africa/Cairo', [
      task(11, 'Call the bank', { due_at: '2026-10-04T12:00:00Z', reminder_at: '2026-10-04T11:50:00Z', reminder_sent: true, top3: true, top3_rank: 1, scheduled_start: '2026-10-04T12:00:00Z', scheduled_end: '2026-10-04T12:30:00Z' }),
    ], blocks)
    const r = await call(deps(store), 'move_to_tomorrow', { id: tid(11) })
    // Tomorrow 09:00 Cairo = 06:00Z: the due moved 18 h, so the reminder is tomorrow 08:50 and armed again.
    expect(store.tasks[0]).toMatchObject({
      due_at: '2026-10-05T06:00:00.000Z', reminder_at: '2026-10-05T05:50:00.000Z', reminder_sent: false, top3: false, top3_rank: null,
      scheduled_start: '2026-10-05T07:00:00Z', scheduled_end: '2026-10-05T08:00:00Z', // the block already on tomorrow stays
    })
    expect(store.cal.filter((e) => e.task_id).map((b) => [b.id, !!b.deleted_at])).toEqual([[tid(500), true], [tid(501), false], [tid(502), false]])
    expect(r.data).toMatchObject({ calendar_blocks_removed: 1, moved: { due: '2026-10-05 09:00' } })
    expect(r.data!.moved.top3).toBeUndefined()
    expect(store.logs.map((l) => [l.eventType, l.entityId])).toEqual([['task.rescheduled', tid(11)], ['calendar_event.deleted', tid(500)]])
  })

  it('settle + replanMoves: a reminder that stays in the past stays sent; a date keeps only its own day\'s block', () => {
    const t = task(13, 'x', { due_at: '2026-10-01T06:00:00Z', reminder_at: '2026-09-20T06:00:00Z', reminder_sent: true })
    const due = '2026-10-05T06:00:00.000Z'
    // Moved 4 days: 20 Sep → 24 Sep, still before now (4 Oct) → not re-armed.
    expect(settle(t, { ...t, due_at: due }, NOW, 'Africa/Cairo')).toMatchObject({ reminder_at: '2026-09-24T06:00:00.000Z', reminder_sent: true })
    // A reminder this write sets itself is left alone (carryReminder).
    expect(settle(t, { ...t, due_at: due, reminder_at: '2026-10-05T05:00:00Z' }, NOW, 'Africa/Cairo').reminder_at).toBe('2026-10-05T05:00:00Z')
    // Its only block is on another day → off the calendar.
    const old: BlockRow = { id: tid(600), starts_at: '2026-10-01T06:00:00Z', ends_at: '2026-10-01T07:00:00Z', all_day: false }
    expect(replanMoves([old], due, false, null, 'Africa/Cairo')).toEqual({ place: null, keep: null, clear: [old] })
    // An all-day block is read at its noon: stored as tomorrow's UTC midnight, it's tomorrow's.
    const allDay: BlockRow = { id: tid(601), starts_at: '2026-10-05T00:00:00Z', ends_at: '2026-10-06T00:00:00Z', all_day: true }
    expect(replanMoves([old, allDay], due, false, null, 'Africa/Cairo')).toEqual({ place: null, keep: allDay, clear: [old] })
    // A time: the latest block goes there (an all-day one takes the estimate's length), the rest come off.
    expect(replanMoves([old, allDay], '2026-10-05T12:00:00.000Z', true, 45, 'Africa/Cairo')).toEqual({
      place: { block: allDay, starts_at: '2026-10-05T12:00:00.000Z', ends_at: '2026-10-05T12:45:00.000Z' }, keep: null, clear: [old],
    })
    // …a timed one keeps its own length; none at all → the estimate, else 30 minutes.
    expect(replanMoves([old], '2026-10-05T12:00:00.000Z', true, 45, 'Africa/Cairo').place!.ends_at).toBe('2026-10-05T13:00:00.000Z')
    expect(replanMoves([], '2026-10-05T12:00:00.000Z', true, null, 'Africa/Cairo').place).toEqual({ block: null, starts_at: '2026-10-05T12:00:00.000Z', ends_at: '2026-10-05T12:30:00.000Z' })
  })

  it('settle: a Top 3 pick keeps its place while it stays today\'s, and gives it up when moved to a later day', () => {
    const pick = task(18, 'pick', { top3: true, top3_rank: 1, due_at: '2026-10-04T06:00:00Z' })
    expect(settle(pick, { ...pick, due_at: '2026-10-04T15:00:00Z' }, NOW, 'Africa/Cairo')).toMatchObject({ top3: true, top3_rank: 1 })
    expect(settle(pick, { ...pick, due_at: '2026-10-05T06:00:00Z' }, NOW, 'Africa/Cairo')).toMatchObject({ top3: false, top3_rank: null })
    // 00:30 Monday in Cairo is still Sunday evening in Los Angeles: the user's day decides.
    expect(settle(pick, { ...pick, due_at: '2026-10-04T21:30:00Z' }, NOW, 'America/Los_Angeles').top3).toBe(true)
    expect(settle(pick, { ...pick, due_at: '2026-10-04T21:30:00Z' }, NOW, 'Africa/Cairo').top3).toBe(false)
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
    expect(week.data!.events.map((e: { title: string }) => e.title)).toEqual(['Standup', 'Choir']) // Choir repeats Thursdays
    expect((await call(d, 'calendar', { from: '2026-10-20', to: '2026-10-20' })).data!.events.map((e: { title: string }) => e.title)).toEqual(['Next week'])
    expect((await call(d, 'calendar', { from: '2026-10-01', to: '2026-12-01' })).text).toContain('At most 31 days')
    expect((await call(d, 'calendar', { from: '2026-10-05', to: '2026-10-04' })).text).toContain('on or after')
  })

  it('calendar: a repeating event is each of its weeks, on the series’ id, minus the skipped one', async () => {
    const d = deps(fakeStore())
    const month = await call(d, 'calendar', { from: '2026-10-05', to: '2026-10-31' })
    const choir = month.data!.events.filter((e: { title: string }) => e.title === 'Choir')
    expect(choir.map((e: { start: string }) => e.start)).toEqual(['2026-10-08 18:00', '2026-10-22 18:00', '2026-10-29 18:00'])
    expect(choir[0]).toMatchObject({ id: tid(902), end: '2026-10-08 19:30', repeats: 'FREQ=WEEKLY' })
    // …and it's in today's list only on its own day.
    expect((await call(d, 'today')).data!.events.map((e: { title: string }) => e.title)).toEqual(['Standup'])
  })

  it('calendar: a Time slot lists the tasks its occurrence holds (0073), and only that occurrence', async () => {
    const store = fakeStore('Africa/Cairo', [task(30, 'Ship the slot', { slot_id: tid(902), slot_date: '2026-10-22', scheduled_start: '2026-10-22T15:00:00Z' })])
    store.cal.find((e) => e.id === tid(902))!.type = 'time_block'
    const month = await call(deps(store), 'calendar', { from: '2026-10-05', to: '2026-10-31' })
    const choir = month.data!.events.filter((e: { title: string }) => e.title === 'Choir')
    expect(choir.map((e: { tasks?: unknown }) => e.tasks)).toEqual([undefined, [{ id: tid(30), title: 'Ship the slot', done: false }], undefined])
  })
})

// A1 (P7e parity audit): an assistant plans the week — tasks to a day or a time, task edits, and the
// calendar's own events and Time blocks, repeats included — with the app's rules on the user's clock.
describe('MCP: planning the week', () => {
  type Ev = { id: string; title: string; start: string; end?: string }

  it("reschedule_task: a date-time puts it on the calendar at that time, on the user's clock", async () => {
    const store = fakeStore('America/Los_Angeles', [task(20, 'Call the bank', { due_at: '2026-10-05T16:00:00Z', someday: true })])
    const r = await call(deps(store), 'reschedule_task', { id: tid(20), when: '2026-10-07T15:30' })
    expect(r.data!.rescheduled).toMatchObject({ due: '2026-10-07 15:30', scheduled: '2026-10-07 15:30–16:00' })
    expect(r.data!.changed).toEqual(['due 2026-10-07 15:30', 'on the calendar 2026-10-07 15:30–16:00', 'out of Someday'])
    const block = store.cal.find((e) => e.task_id === tid(20))!
    expect(block).toMatchObject({ title: 'Call the bank', type: 'task', all_day: false, starts_at: '2026-10-07T22:30:00.000Z', ends_at: '2026-10-07T23:00:00.000Z' })
    expect(store.tasks[0]).toMatchObject({ due_at: '2026-10-07T22:30:00.000Z', someday: false, scheduled_start: block.starts_at, scheduled_end: block.ends_at })
    expect(store.logs.map((l) => [l.eventType, l.payload])).toEqual([
      ['task.rescheduled', { due_at: '2026-10-07T22:30:00.000Z', source: 'mcp' }],
      ['task.scheduled', { calendar_event_id: block.id, source: 'mcp' }],
    ])
  })

  it('reschedule_task: its block moves there keeping its length, the others come off, the reminder keeps its lead, the pick lets go', async () => {
    const blocks = [
      { id: tid(510), task_id: tid(21), starts_at: '2026-10-04T12:00:00Z', ends_at: '2026-10-04T13:30:00Z', all_day: false }, // today 15:00–16:30
      { id: tid(511), task_id: tid(21), starts_at: '2026-10-02T12:00:00Z', ends_at: '2026-10-02T12:30:00Z', all_day: false }, // a missed one
    ]
    const store = fakeStore('Africa/Cairo', [
      task(21, 'Write the brief', { due_at: '2026-10-04T12:00:00Z', reminder_at: '2026-10-04T11:45:00Z', reminder_sent: true, top3: true, top3_rank: 2, duration_min: 45, scheduled_start: '2026-10-04T12:00:00Z', scheduled_end: '2026-10-04T13:30:00Z' }),
    ], blocks)
    const r = await call(deps(store), 'reschedule_task', { id: tid(21), when: '2026-10-06T10:00' })
    // Tue 10:00 Cairo = 07:00Z: the latest block (today's, 90 minutes) goes there; the missed one comes off.
    expect(store.cal.filter((e) => e.task_id).map((e) => [e.id, e.starts_at, e.ends_at, !!e.deleted_at])).toEqual([
      [tid(510), '2026-10-06T07:00:00.000Z', '2026-10-06T08:30:00.000Z', false],
      [tid(511), '2026-10-02T12:00:00Z', '2026-10-02T12:30:00Z', true],
    ])
    expect(store.tasks[0]).toMatchObject({
      due_at: '2026-10-06T07:00:00.000Z', reminder_at: '2026-10-06T06:45:00.000Z', reminder_sent: false, top3: false, top3_rank: null,
      scheduled_start: '2026-10-06T07:00:00.000Z', scheduled_end: '2026-10-06T08:30:00.000Z',
    })
    expect(r.data!.changed).toEqual(['due 2026-10-06 10:00', 'on the calendar 2026-10-06 10:00–11:30', '1 calendar block taken off the calendar (in Trash)', "left today's Top 3", 'reminder → 2026-10-06 09:45'])
    expect(store.logs.map((l) => [l.eventType, l.entityId])).toEqual([['task.rescheduled', tid(21)], ['calendar_event.deleted', tid(511)], ['task.scheduled', tid(21)]])
  })

  // bugs-1023 (Kai 2026-10-23: "duration doesn't sync with the times of scheduling"): the app's one rule.
  it('edit_task duration_min: the block keeps its start and takes the new length; reschedule_task makes the estimate the block’s', async () => {
    const blocks = [{ id: tid(530), task_id: tid(24), starts_at: '2026-10-04T14:15:00Z', ends_at: '2026-10-04T14:30:00Z', all_day: false }] // today 17:15–17:30
    const store = fakeStore('Africa/Cairo', [task(24, 'Pre workout', { due_at: '2026-10-04T14:15:00Z', duration_min: 15, scheduled_start: '2026-10-04T14:15:00Z', scheduled_end: '2026-10-04T14:30:00Z' })], blocks)
    const r = await call(deps(store), 'edit_task', { id: tid(24), duration_min: 60 })
    expect(r.data!.changed).toEqual(['duration → 60 min', 'on the calendar 2026-10-04 17:15–18:15'])
    expect(store.cal.find((e) => e.id === tid(530))).toMatchObject({ starts_at: '2026-10-04T14:15:00.000Z', ends_at: '2026-10-04T15:15:00.000Z' })
    expect(store.tasks[0]).toMatchObject({ duration_min: 60, scheduled_start: '2026-10-04T14:15:00.000Z', scheduled_end: '2026-10-04T15:15:00.000Z' })
    // A block out of step with its estimate (an older app moved it): a replan keeps the block's length and the estimate follows.
    store.cal.find((e) => e.id === tid(530))!.ends_at = '2026-10-04T14:45:00.000Z'
    await call(deps(store), 'reschedule_task', { id: tid(24), when: '2026-10-05T09:00' })
    expect(store.tasks[0]).toMatchObject({ duration_min: 30, scheduled_start: '2026-10-05T06:00:00.000Z', scheduled_end: '2026-10-05T06:30:00.000Z' })
  })

  it("reschedule_task: a date alone is 09:00 that day and keeps only that day's block — the user's day, not UTC's (Tokyo)", async () => {
    // Wed 7 Oct 08:00 in Tokyo is Tue 6 Oct 23:00 UTC.
    const blocks = [
      { id: tid(520), task_id: tid(22), starts_at: '2026-10-06T23:00:00Z', ends_at: '2026-10-07T00:00:00Z', all_day: false },
      { id: tid(521), task_id: tid(22), starts_at: '2026-10-05T23:00:00Z', ends_at: '2026-10-06T00:00:00Z', all_day: false },
    ]
    const store = fakeStore('Asia/Tokyo', [task(22, 'Review', { due_at: '2026-10-05T23:00:00Z' })], blocks)
    const r = await call(deps(store), 'reschedule_task', { id: tid(22), when: '2026-10-07' })
    expect(store.tasks[0]).toMatchObject({ due_at: '2026-10-07T00:00:00.000Z', scheduled_start: '2026-10-06T23:00:00Z', scheduled_end: '2026-10-07T00:00:00Z' })
    expect(store.cal.filter((e) => e.task_id).map((e) => !!e.deleted_at)).toEqual([false, true])
    expect(r.data!.changed).toEqual(['due 2026-10-07 09:00', '1 calendar block taken off the calendar (in Trash)'])
    // Across Cairo's autumn change (summer time ends on the night of 29–30 Oct): 09:00 is 09:00 on both sides.
    const cairo = fakeStore('Africa/Cairo', [task(23, 'Rent')])
    await call(deps(cairo), 'reschedule_task', { id: tid(23), when: '2026-10-29' })
    expect(cairo.tasks[0].due_at).toBe('2026-10-29T06:00:00.000Z')
    await call(deps(cairo), 'reschedule_task', { id: tid(23), when: '2026-10-30' })
    expect(cairo.tasks[0].due_at).toBe('2026-10-30T07:00:00.000Z')
  })

  it('reschedule_task: checks "when" and the task before writing anything', async () => {
    const store = fakeStore('Africa/Cairo', [task(24, 'Done one', { status: 'done' }), task(25, 'Open one')])
    for (const [args, msg] of [
      [{ id: tid(25) }, '"when" is required'],
      [{ id: tid(25), when: 'next tuesday' }, 'YYYY-MM-DD'],
      [{ id: tid(25), when: '2026-02-30' }, 'YYYY-MM-DD'],
      [{ id: tid(24), when: '2026-10-07' }, 'already done'],
      [{ id: tid(99), when: '2026-10-07' }, 'No task with id'],
    ] as const) {
      const r = await call(deps(store), 'reschedule_task', args)
      expect([r.isError, r.text]).toEqual([true, expect.stringContaining(msg)])
    }
    expect([store.logs, store.cal.filter((e) => e.task_id)]).toEqual([[], []])
  })

  it('edit_task: title, notes, duration and project — each logged as the app logs it, and said', async () => {
    const store = fakeStore('Africa/Cairo', [task(30, 'Draft', { notes: 'old', area_id: tid(701), domain_id: tid(702), milestone_id: tid(700) })])
    const r = await call(deps(store), 'edit_task', { id: tid(30), title: ' Draft the brief ', notes: 'two pages', duration_min: 90, project_id: P1 })
    expect(r.data!.changed).toEqual(['title → "Draft the brief"', 'notes', 'duration → 90 min', 'project → Shaheen Website'])
    // tasks/move.ts: in the project, its domain with it, out of the area; the milestone stays behind.
    expect(store.tasks[0]).toMatchObject({ title: 'Draft the brief', notes: 'two pages', duration_min: 90, project_id: P1, domain_id: D1, area_id: null, milestone_id: null })
    expect(r.data!.edited).toMatchObject({ title: 'Draft the brief', notes: 'two pages', duration_min: 90, project: 'Shaheen Website', project_id: P1 })
    expect(store.logs.map((l) => [l.eventType, l.payload])).toEqual([
      ['task.updated', { field: 'title', source: 'mcp' }],
      ['task.updated', { field: 'notes', source: 'mcp' }],
      ['task.updated', { field: 'duration', source: 'mcp' }],
      ['task.moved', { project_id: P1, area_id: null, domain_id: D1, source: 'mcp' }],
    ])
    // null clears; no project = out of all three.
    const cleared = await call(deps(store), 'edit_task', { id: tid(30), notes: null, duration_min: null, project_id: null })
    expect(cleared.data!.changed).toEqual(['notes cleared', 'duration cleared', 'out of its project'])
    expect(store.tasks[0]).toMatchObject({ notes: null, duration_min: null, project_id: null, domain_id: null })
    // The same values again change nothing and write nothing.
    const n = store.logs.length
    expect((await call(deps(store), 'edit_task', { id: tid(30), title: 'Draft the brief' })).data!.changed).toEqual([])
    expect(store.logs).toHaveLength(n)
  })

  it('edit_task: a repeat on an undated task dates it today 09:00; null stops it; a bad argument writes nothing', async () => {
    const store = fakeStore('America/Los_Angeles', [task(31, 'Stretch', { someday: true })])
    const r = await call(deps(store), 'edit_task', { id: tid(31), repeat: 'rrule:freq=weekly;byday=mo,we,fr' })
    expect(store.tasks[0]).toMatchObject({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', due_at: '2026-10-04T16:00:00.000Z', someday: false })
    expect(r.data!.changed).toEqual(['repeats FREQ=WEEKLY;BYDAY=MO,WE,FR', 'due 2026-10-04 09:00 (a repeat starts today)'])
    expect(store.logs.map((l) => [l.eventType, l.payload])).toEqual([
      ['task.recurrence_set', { rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', source: 'mcp' }],
      ['task.rescheduled', { due_at: '2026-10-04T16:00:00.000Z', source: 'mcp' }],
    ])
    expect((await call(deps(store), 'edit_task', { id: tid(31), repeat: null })).data!.changed).toEqual(['no longer repeats'])
    expect(store.tasks[0].recurrence_rule).toBeNull()
    const n = store.logs.length
    for (const [args, msg] of [
      [{ id: tid(31), repeat: 'FREQ=HOURLY' }, 'RRULE'],
      [{ id: tid(31), repeat: 'FREQ=DAILY;BYDAY=XX' }, 'RRULE'],
      [{ id: tid(31), repeat: 'FREQ=DAILY;COUNT=3;UNTIL=20261231T235959Z' }, 'RRULE'],
      [{ id: tid(31), repeat: 'BYDAY=MO' }, 'RRULE'],
      [{ id: tid(31), repeat: 'FREQ=DAILY;FREQ=WEEKLY' }, 'RRULE'],
      [{ id: tid(31) }, 'Nothing to change'],
      [{ id: tid(31), title: '  ' }, `"title" can't be empty`],
      [{ id: tid(31), duration_min: 0 }, 'from 1 to 1440'],
      [{ id: tid(31), title: 'Renamed', project_id: tid(404) }, 'No project with id'],
      [{ id: tid(31), due: '2026-10-07' }, 'Unknown argument "due"'],
    ] as const) {
      const bad = await call(deps(store), 'edit_task', args)
      expect([bad.isError, bad.text]).toEqual([true, expect.stringContaining(msg)])
    }
    expect(store.logs).toHaveLength(n)
    expect(store.tasks[0].title).toBe('Stretch')
  })

  it("add_task: a time blocks the calendar as a typed time does in the app; a date alone doesn't", async () => {
    const store = fakeStore('America/Los_Angeles')
    const r = await call(deps(store), 'add_task', { title: 'Deep work', due: '2026-10-07T15:30', duration_min: 45 })
    const [t] = store.tasks
    const block = store.cal.find((e) => e.task_id === t.id)!
    expect(block).toMatchObject({ title: 'Deep work', type: 'task', all_day: false, starts_at: '2026-10-07T22:30:00.000Z', ends_at: '2026-10-07T23:15:00.000Z' })
    expect(t).toMatchObject({ due_at: '2026-10-07T22:30:00.000Z', duration_min: 45, scheduled_start: block.starts_at, scheduled_end: block.ends_at })
    expect(r.data).toMatchObject({ added: { due: '2026-10-07 15:30', scheduled: '2026-10-07 15:30–16:15', duration_min: 45 }, calendar_block: '2026-10-07 15:30–16:15' })
    expect(store.logs.map((l) => [l.eventType, l.payload])).toEqual([
      ['task.created', { title: 'Deep work', source: 'mcp' }],
      ['task.scheduled', { calendar_event_id: block.id, source: 'mcp' }],
    ])
    // No estimate → 30 minutes; a bare date → no block.
    await call(deps(store), 'add_task', { title: 'Quick call', due: '2026-10-08T09:00' })
    expect(store.cal.filter((e) => e.title === 'Quick call').map((e) => [e.starts_at, e.ends_at])).toEqual([['2026-10-08T16:00:00.000Z', '2026-10-08T16:30:00.000Z']])
    const dated = await call(deps(store), 'add_task', { title: 'Taxes', due: '2026-10-09' })
    expect(dated.data!.calendar_block).toBeUndefined()
    expect(store.cal.filter((e) => e.title === 'Taxes')).toEqual([])
  })

  it('add_task: a timed pick for a later day is blocked at its own time today; a repeat starts today when undated', async () => {
    const store = fakeStore('Africa/Cairo')
    expect((await call(deps(store), 'add_task', { title: 'Gym', due: '2026-10-08T18:00', top3: true })).data!.calendar_block).toBe('2026-10-04 18:00–18:30')
    const rep = await call(deps(store), 'add_task', { title: 'Journal', repeat: 'FREQ=DAILY' })
    expect(rep.data!.added).toMatchObject({ due: '2026-10-04 09:00', repeats: 'FREQ=DAILY' })
    expect(store.logs.filter((l) => l.entityId === rep.data!.added.id).map((l) => l.eventType)).toEqual(['task.created', 'task.recurrence_set'])
    expect((await call(deps(store), 'add_task', { title: 'x', repeat: 'every day' })).text).toContain('RRULE')
  })

  it('add_event: an event or Time block on the user’s clock, 30 minutes unless told, logged like the app', async () => {
    const store = fakeStore('America/Los_Angeles')
    const r = await call(deps(store), 'add_event', { title: 'Focus', start: '2026-10-07T09:00', end: '2026-10-07T11:00', kind: 'time_block' })
    expect(r.data!.added).toMatchObject({ title: 'Focus', start: '2026-10-07 09:00', end: '2026-10-07 11:00', kind: 'time_block' })
    const e = store.cal.find((x) => x.title === 'Focus')!
    expect(e).toMatchObject({ starts_at: '2026-10-07T16:00:00.000Z', ends_at: '2026-10-07T18:00:00.000Z', all_day: false, task_id: null, type: 'time_block', recurrence_rule: null })
    expect(store.logs).toEqual([{ eventType: 'calendar_event.created', entityType: 'calendar_event', entityId: e.id, payload: { title: 'Focus', type: 'time_block', source: 'mcp' } }])
    expect((await call(deps(store), 'add_event', { title: 'Dentist', start: '2026-10-08T14:00' })).data!.added).toMatchObject({ start: '2026-10-08 14:00', end: '2026-10-08 14:30' })
    expect((await call(deps(store), 'add_event', { title: 'Lunch', start: '2026-10-08T12:00', duration_min: 75 })).data!.added.end).toBe('2026-10-08 13:15')
  })

  it('add_event: a date makes it all-day — its days, the last one included, the same on any clock', async () => {
    const store = fakeStore('Asia/Tokyo')
    const r = await call(deps(store), 'add_event', { title: 'Trip', start: '2026-10-10', end: '2026-10-12' })
    const trip = { id: r.data!.added.id, title: 'Trip', start: '2026-10-10', end: '2026-10-12', all_day: true }
    expect(r.data!.added).toEqual(trip)
    expect(store.cal.find((x) => x.title === 'Trip')).toMatchObject({ starts_at: '2026-10-10T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z', all_day: true })
    for (const zone of ['Asia/Tokyo', 'America/Los_Angeles', 'Africa/Cairo']) {
      const cal = await call(deps({ ...store, timezone: async () => zone }), 'calendar', { from: '2026-10-11', to: '2026-10-11' })
      expect(cal.data!.events.filter((e: Ev) => e.title === 'Trip')).toEqual([trip])
    }
  })

  it('add_event: a repeat must fall on its start; bad times and rules write nothing', async () => {
    const store = fakeStore('Africa/Cairo')
    // Mon 5 Oct 07:00 Cairo, Mon/Wed/Fri — and the calendar expands it.
    const ok = await call(deps(store), 'add_event', { title: 'Gym', start: '2026-10-05T07:00', duration_min: 60, repeat: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' })
    expect(ok.data!.added).toMatchObject({ start: '2026-10-05 07:00', end: '2026-10-05 08:00', repeats: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' })
    const week = await call(deps(store), 'calendar', { from: '2026-10-05', to: '2026-10-11' })
    expect(week.data!.events.filter((e: Ev) => e.title === 'Gym').map((e: Ev) => e.start)).toEqual(['2026-10-05 07:00', '2026-10-07 07:00', '2026-10-09 07:00'])
    const before = store.cal.length
    for (const [args, msg] of [
      [{ title: 'Gym', start: '2026-10-04T07:00', repeat: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }, 'its first one would be 2026-10-05 07:00'], // a Sunday
      [{ title: 'x', start: '2026-10-05T07:00', repeat: 'FREQ=DAILY;UNTIL=20261001T000000Z' }, 'never happens'],
      [{ title: 'x', start: '2026-10-05T07:00', repeat: 'FREQ=MINUTELY' }, 'RRULE'],
      [{ title: 'x' }, '"start" is required'],
      [{ title: 'x', start: '2026-10-05T07:00', end: '2026-10-05T06:00' }, 'after "start"'],
      [{ title: 'x', start: '2026-10-05T07:00', end: '2026-10-05T08:00', duration_min: 60 }, 'not both'],
      [{ title: 'x', start: '2026-10-05', duration_min: 60 }, 'all-day'],
      [{ title: 'x', start: '2026-10-05', end: '2026-10-05T10:00' }, 'last day'],
      [{ title: 'x', start: '2026-10-05T07:00', end: '2026-10-06' }, 'ends at a time'],
      [{ title: 'x', start: '2026-10-05', end: '2026-12-05' }, 'at most 31 days'],
      [{ title: 'x', start: '2026-10-05T07:00', kind: 'task' }, 'one of: event, time_block'],
      [{ title: '', start: '2026-10-05T07:00' }, `"title" can't be empty`],
    ] as const) {
      const r = await call(deps(store), 'add_event', args)
      expect([r.isError, r.text]).toEqual([true, expect.stringContaining(msg)])
    }
    expect(store.cal).toHaveLength(before)
  })

  it('edit_event: a one-off moves keeping its length; it says what changed and is logged', async () => {
    const store = fakeStore('Africa/Cairo')
    const r = await call(deps(store), 'edit_event', { id: tid(900), title: 'Team standup', start: '2026-10-05T09:30' })
    expect(r.data!.edited).toMatchObject({ id: tid(900), title: 'Team standup', start: '2026-10-05 09:30', end: '2026-10-05 09:45' })
    expect(r.data!.changed).toEqual(['title → "Team standup"', 'time → 2026-10-05 09:30–09:45'])
    expect(store.logs).toEqual([{ eventType: 'calendar_event.updated', entityType: 'calendar_event', entityId: tid(900), payload: { title: 'Team standup', changed: r.data!.changed, source: 'mcp' } }])
    // A Time block, then a weekly series from its own day (a Monday).
    expect((await call(deps(store), 'edit_event', { id: tid(900), kind: 'time_block', repeat: 'FREQ=WEEKLY' })).data!.changed).toEqual(['kind → time_block', 'repeats FREQ=WEEKLY'])
    // The same values change nothing and write nothing.
    const n = store.logs.length
    expect((await call(deps(store), 'edit_event', { id: tid(900), title: 'Team standup' })).data!.changed).toEqual([])
    expect(store.logs).toHaveLength(n)
  })

  it('edit_event: a whole series takes a new time of day on all its days, its skipped week still skipped', async () => {
    const store = fakeStore('Africa/Cairo')
    // Choir: Thursdays 18:00–19:30 from 1 Oct, the 15th skipped. 19:00 (any date's) → every Thursday at 19:00, still 90 minutes.
    const r = await call(deps(store), 'edit_event', { id: tid(902), start: '2026-10-22T19:00' })
    expect(r.data!.changed).toEqual(['time → 19:00–20:30, every occurrence'])
    expect(store.cal.find((e) => e.id === tid(902))).toMatchObject({ starts_at: '2026-10-01T16:00:00.000Z', ends_at: '2026-10-01T17:30:00.000Z', recurrence_exdates: ['2026-10-15T16:00:00.000Z'] })
    const month = await call(deps(store), 'calendar', { from: '2026-10-05', to: '2026-10-31' })
    expect(month.data!.events.filter((e: Ev) => e.title === 'Choir').map((e: Ev) => [e.start, e.end])).toEqual([
      ['2026-10-08 19:00', '2026-10-08 20:30'], ['2026-10-22 19:00', '2026-10-22 20:30'], ['2026-10-29 19:00', '2026-10-29 20:30'],
    ])
    expect((await call(deps(store), 'edit_event', { id: tid(902), duration_min: 60 })).data!.changed).toEqual(['time → 19:00–20:00, every occurrence'])
    expect((await call(deps(store), 'edit_event', { id: tid(902), end: '2026-10-08T21:00' })).data!.changed).toEqual(['time → 19:00–21:00, every occurrence'])
    for (const [args, msg] of [
      [{ id: tid(902), start: '2026-10-22' }, 'keeps its days'],
      [{ id: tid(902), repeat: 'FREQ=WEEKLY;BYDAY=TU' }, "doesn't fall on the start"],
    ] as const) {
      const bad = await call(deps(store), 'edit_event', args)
      expect([bad.isError, bad.text]).toEqual([true, expect.stringContaining(msg)])
    }
    // Ending it from a day on keeps what came before.
    expect((await call(deps(store), 'edit_event', { id: tid(902), repeat: 'FREQ=WEEKLY;UNTIL=20261023T000000Z' })).data!.changed).toEqual(['repeats FREQ=WEEKLY;UNTIL=20261023T000000Z'])
    const after = await call(deps(store), 'calendar', { from: '2026-10-05', to: '2026-10-31' })
    expect(after.data!.events.filter((e: Ev) => e.title === 'Choir').map((e: Ev) => e.start)).toEqual(['2026-10-08 19:00', '2026-10-22 19:00'])
  })

  it('edit_event: one occurrence on its own leaves the series as an event of its own', async () => {
    const store = fakeStore('Africa/Cairo')
    const r = await call(deps(store), 'edit_event', { id: tid(902), occurrence: '2026-10-08 18:00', start: '2026-10-09T20:00', title: 'Choir (moved)' })
    const copy = store.cal.find((e) => e.series_id === tid(902))!
    expect(copy).toMatchObject({ title: 'Choir (moved)', starts_at: '2026-10-09T17:00:00.000Z', ends_at: '2026-10-09T18:30:00.000Z', recurrence_rule: null, recurrence_exdates: [] })
    expect(store.cal.find((e) => e.id === tid(902))!.recurrence_exdates).toEqual(['2026-10-15T15:00:00.000Z', '2026-10-08T15:00:00.000Z'])
    expect(r.data!.edited).toMatchObject({ id: copy.id, title: 'Choir (moved)', start: '2026-10-09 20:00', end: '2026-10-09 21:30' })
    expect(r.data!.changed).toEqual(['title → "Choir (moved)"', 'time → 2026-10-09 20:00–21:30', 'only the 2026-10-08 18:00–19:30 occurrence: it is an event of its own now'])
    const days = await call(deps(store), 'calendar', { from: '2026-10-08', to: '2026-10-09' })
    expect(days.data!.events.map((e: Ev) => [e.title, e.start])).toEqual([['Choir (moved)', '2026-10-09 20:00']])
    expect(store.logs).toEqual([{ eventType: 'calendar_event.created', entityType: 'calendar_event', entityId: copy.id, payload: { title: 'Choir (moved)', type: 'event', series_id: tid(902), source: 'mcp' } }])
    for (const [args, msg] of [
      [{ id: tid(902), occurrence: '2026-10-15 18:00', title: 'x' }, 'no occurrence at 2026-10-15 18:00'], // skipped
      [{ id: tid(902), occurrence: '2026-10-22 18:00', repeat: 'FREQ=DAILY' }, 'whole series'],
      [{ id: tid(900), occurrence: '2026-10-04 10:00', title: 'x' }, "doesn't repeat"],
    ] as const) {
      const bad = await call(deps(store), 'edit_event', args)
      expect([bad.isError, bad.text]).toEqual([true, expect.stringContaining(msg)])
    }
  })

  it("edit_event and delete_event leave a task's block to its task", async () => {
    const store = fakeStore('Africa/Cairo', [task(40, 'Write')], [{ id: tid(540), task_id: tid(40), starts_at: '2026-10-05T07:00:00Z', ends_at: '2026-10-05T08:00:00Z', all_day: false }])
    for (const [name, args] of [['edit_event', { id: tid(540), title: 'x' }], ['delete_event', { id: tid(540) }]] as const) {
      const r = await call(deps(store), name, args)
      expect([r.isError, r.text]).toEqual([true, expect.stringContaining('reschedule_task')])
    }
    expect((await call(deps(store), 'delete_event', { id: tid(404) })).text).toContain('No event with id')
    expect([store.logs, store.cal.find((e) => e.id === tid(540))!.deleted_at]).toEqual([[], undefined])
  })

  it('delete_event: a one-off to Trash; one occurrence skipped; a whole series with what was moved out of it', async () => {
    const store = fakeStore('Africa/Cairo')
    const one = await call(deps(store), 'delete_event', { id: tid(900) })
    expect(one.data).toMatchObject({ deleted: { id: tid(900), title: 'Standup' }, changed: ['the event moved to Trash'] })
    expect(store.cal.find((e) => e.id === tid(900))!.deleted_at).toBeTruthy()
    // Choir on the 22nd only — its day names it too.
    const occ = await call(deps(store), 'delete_event', { id: tid(902), occurrence: '2026-10-22' })
    expect(occ.data!.changed).toEqual(['skipped the 2026-10-22 18:00–19:30 occurrence; the rest of the series stays'])
    expect(store.cal.find((e) => e.id === tid(902))!.recurrence_exdates).toEqual(['2026-10-15T15:00:00.000Z', '2026-10-22T15:00:00.000Z'])
    // The 29th moved out on its own, then the whole series deleted: the moved one goes too.
    await call(deps(store), 'edit_event', { id: tid(902), occurrence: '2026-10-29 18:00', start: '2026-10-30T18:00' })
    const all = await call(deps(store), 'delete_event', { id: tid(902) })
    expect(all.data!.changed).toEqual(['the whole series moved to Trash, with 1 occurrence moved out of it'])
    expect(store.cal.filter((e) => e.id === tid(902) || e.series_id === tid(902)).every((e) => !!e.deleted_at)).toBe(true)
    expect(store.logs.filter((l) => l.eventType === 'calendar_event.deleted').map((l) => l.payload)).toEqual([
      { source: 'mcp' }, { occurrence: '2026-10-22T15:00:00.000Z', source: 'mcp' }, { source: 'mcp' }, { source: 'mcp' },
    ])
    expect((await call(deps(store), 'delete_event', { id: tid(902) })).text).toContain('No event with id')
  })

  it('duplicate_event (Kai 2026-10-17): an event copies to the same time; a repeat by its occurrence, as a one-off', async () => {
    const store = fakeStore('Africa/Cairo')
    const one = await call(deps(store), 'duplicate_event', { id: tid(900) })
    expect(one.data!.duplicated).toMatchObject({ title: 'Standup', start: '2026-10-04 10:00', end: '2026-10-04 10:15' })
    expect(one.data!.duplicated.id).not.toBe(tid(900))
    expect(store.cal.filter((e) => e.title === 'Standup' && !e.deleted_at)).toHaveLength(2)
    expect(store.logs.at(-1)).toMatchObject({ eventType: 'calendar_event.created', payload: { duplicate_of: tid(900) } })
    const occ = await call(deps(store), 'duplicate_event', { id: tid(902), occurrence: '2026-10-22' })
    expect(occ.data!.duplicated).toEqual({ id: expect.any(String), title: 'Choir', start: '2026-10-22 18:00', end: '2026-10-22 19:30' }) // no "repeats"
    for (const [args, msg] of [
      [{ id: tid(902) }, 'give "occurrence"'],
      [{ id: tid(900), occurrence: '2026-10-04' }, "doesn't repeat"],
      [{ id: tid(404) }, 'No event with id'],
    ] as const) {
      const bad = await call(deps(store), 'duplicate_event', args)
      expect([bad.isError, bad.text]).toEqual([true, expect.stringContaining(msg)])
    }
    const slot = await call(deps(store), 'add_event', { title: 'Deep work', start: '2026-10-05T09:00', kind: 'time_block' })
    expect((await call(deps(store), 'duplicate_event', { id: slot.data!.added.id })).text).toContain('Time block')
  })

  it("duplicate_event on a task's block: the task's copy (subtasks along), blocked at the same time", async () => {
    const store = fakeStore('Africa/Cairo', [task(42, 'Draft the deck', { due_at: '2026-10-05T07:00:00Z', scheduled_start: '2026-10-05T07:00:00Z', scheduled_end: '2026-10-05T08:00:00Z' }), task(43, 'Outline', { parent_task_id: tid(42) })], [{ id: tid(542), task_id: tid(42), starts_at: '2026-10-05T07:00:00Z', ends_at: '2026-10-05T08:00:00Z', all_day: false }])
    const r = await call(deps(store), 'duplicate_event', { id: tid(542) })
    const copy = store.tasks.find((t) => t.id === r.data!.task.id)!
    expect(copy).toMatchObject({ title: 'Draft the deck', status: 'todo', scheduled_start: '2026-10-05T07:00:00.000Z', scheduled_end: '2026-10-05T08:00:00.000Z' })
    expect(r.data!.duplicated).toMatchObject({ start: '2026-10-05 10:00', end: '2026-10-05 11:00', kind: 'task', task_id: copy.id })
    expect(store.cal.filter((e) => e.task_id === copy.id && !e.deleted_at)).toHaveLength(1)
    expect(r.data!.subtasks).toEqual(['Outline'])
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.created', 'task.created', 'task.scheduled'])
  })

  it('today and calendar: Time blocks and task blocks say their kind; a task block carries its task', async () => {
    const store = fakeStore('Africa/Cairo', [task(41, 'Write')], [{ id: tid(541), task_id: tid(41), starts_at: '2026-10-04T12:00:00Z', ends_at: '2026-10-04T13:00:00Z', all_day: false }])
    const focus = await call(deps(store), 'add_event', { title: 'Focus', start: '2026-10-04T16:00', kind: 'time_block' })
    expect((await call(deps(store), 'today')).data!.events).toEqual([
      { id: tid(900), title: 'Standup', start: '2026-10-04 10:00', end: '2026-10-04 10:15' },
      { id: tid(541), title: 'block', start: '2026-10-04 15:00', end: '2026-10-04 16:00', kind: 'task', task_id: tid(41) },
      { id: focus.data!.added.id, title: 'Focus', start: '2026-10-04 16:00', end: '2026-10-04 16:30', kind: 'time_block' },
    ])
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
