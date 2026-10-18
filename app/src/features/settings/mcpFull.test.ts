import { describe, expect, it, vi } from 'vitest'

// mcpKey.ts imports the Supabase client, which throws without VITE_ env (CI has none).
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import { handleMcp } from '../../../../supabase/functions/mcp/server.ts'
import { streakOf } from '../../../../supabase/functions/mcp/life.ts'
import { keyBeside, orderKey } from '../../../../supabase/functions/mcp/tools.ts'
import { computeStreak } from '../routines/streaks'
import { withPersonal } from './mcpKey'
import { call, D1, deps, fakeStore, JOURNAL_KEY, KEY, legacy, NOW, P1, PERSONAL_KEY, post, READ_KEY, rpc, task, tid } from './mcpFake'

// "Full MCP" (Kai 2026-10-14: "I want to be able to tell any ai to do anything"): every area of the
// app over MCP, with the app's rules — and the journal / people only for a key granted them (0080).
// NOW = Sun 4 Oct 2026 11:00 UTC (14:00 Cairo).

const names = async (key: string) => ((await legacy(deps(fakeStore()), 'tools/list', undefined, key)).body.result!.tools as { name: string }[]).map((t) => t.name)
const PERSONAL = ['journal', 'save_journal_entry', 'people', 'save_person', 'log_interaction', 'delete_person']

describe('MCP full: the privacy gate (mcp_keys.scopes, 0080)', () => {
  it('a key without the scopes lists none of the journal / people tools; a granted key lists exactly its own', async () => {
    expect((await names(KEY)).filter((n) => PERSONAL.includes(n))).toEqual([])
    expect((await names(PERSONAL_KEY)).filter((n) => PERSONAL.includes(n))).toEqual(PERSONAL)
    expect((await names(JOURNAL_KEY)).filter((n) => PERSONAL.includes(n))).toEqual(['journal', 'save_journal_entry'])
    // A read-only key never gets the writers, whatever it may read.
    expect((await names(READ_KEY)).filter((n) => PERSONAL.includes(n))).toEqual([])
  })

  it('calling a personal tool by name without the scope is refused, and nothing is read or written', async () => {
    const store = fakeStore()
    store.db.journal_entries = [{ id: tid(70), body: 'private', entry_date: '2026-10-03', deleted_at: null, created_at: '2026-10-03T18:00:00Z' }]
    for (const [name, args] of [['journal', {}], ['save_journal_entry', { body: 'x' }], ['people', {}], ['save_person', { name: 'Mona' }]] as const) {
      const r = await call(deps(store), name, args)
      expect([r.isError, r.text]).toEqual([true, expect.stringContaining("This key can't reach")])
    }
    expect((await call(deps(store), 'people', {}, JOURNAL_KEY)).text).toContain("can't reach the people")
    expect(store.db.journal_entries).toHaveLength(1)
    expect(store.logs).toEqual([])
  })

  it('search, Trash, Activity and Inbox filing keep journal and people out unless granted', async () => {
    const store = fakeStore()
    const hits = async (key: string) => ((await call(deps(store), 'search', { query: 'x' }, key)).data!.results as { type: string }[]).map((h) => h.type)
    expect(await hits(KEY)).toEqual(['task', 'inbox_item'])
    expect(await hits(JOURNAL_KEY)).toEqual(['journal_entry', 'task', 'inbox_item'])
    expect(await hits(PERSONAL_KEY)).toEqual(['journal_entry', 'task', 'person', 'inbox_item'])
    store.db.journal_entries = [{ id: tid(71), body: 'a trashed entry', entry_date: '2026-10-01', deleted_at: '2026-10-02T10:00:00Z' }]
    expect((await call(deps(store), 'trash', {})).data!.items).toEqual([])
    expect((await call(deps(store), 'trash', {}, JOURNAL_KEY)).data!.items.map((i: { type: string }) => i.type)).toEqual(['journal_entry'])
    store.db.activity_seed = [
      { event_type: 'journal.created', entity_type: 'journal_entry', entity_id: tid(71), payload: { entry_date: '2026-10-01' }, created_at: '2026-10-01T10:00:00Z' },
      { event_type: 'people.interaction_logged', entity_type: 'people', entity_id: tid(72), payload: { summary: 'coffee with Mona' }, created_at: '2026-10-01T11:00:00Z' },
      { event_type: 'notify.birthday', entity_type: 'notification', entity_id: tid(73), payload: { title: 'Mona’s birthday' }, created_at: '2026-10-01T12:00:00Z' },
      { event_type: 'task.completed', entity_type: 'task', entity_id: tid(74), payload: {}, created_at: '2026-10-01T13:00:00Z' },
    ]
    const events = async (key: string) => ((await call(deps(store), 'activity', {}, key)).data!.activity as { event: string }[]).map((a) => a.event)
    expect(await events(KEY)).toEqual(['task.completed'])
    expect(await events(JOURNAL_KEY)).toEqual(['task.completed', 'journal.created'])
    expect(await events(PERSONAL_KEY)).toEqual(['task.completed', 'notify.birthday', 'people.interaction_logged', 'journal.created'])
    store.inbox.push({ id: tid(75), raw_text: 'called Mona', status: 'pending', kind: 'text', created_at: '2026-10-04T08:00:00Z' })
    expect((await call(deps(store), 'file_inbox_item', { id: tid(75), as: 'journal' })).text).toContain("can't reach")
    expect(store.inbox[0].status).toBe('pending')
  })

  it("a domain merge moves people only for a key allowed People; the store itself refuses the tables", async () => {
    const seed = () => {
      const s = fakeStore()
      s.db.domains.push({ id: tid(60), name: 'Home', color: null, sort_order: 1, deleted_at: null })
      s.db.people = [{ id: tid(61), name: 'Mona', facts: [], domain_id: D1 }]
      return s
    }
    const plain = seed()
    const r = await call(deps(plain), 'save_domain', { id: D1, merge_into: tid(60) })
    expect(r.data!.merged).toMatchObject({ from: 'Work', into: 'Home', moved: 1 }) // the project only
    expect(r.data!.changed[1]).toContain("can't reach People")
    expect(plain.db.people[0].domain_id).toBe(D1)
    expect(plain.db.domains[0].deleted_at).toBeTruthy()
    const granted = seed()
    expect((await call(deps(granted), 'save_domain', { id: D1, merge_into: tid(60) }, PERSONAL_KEY)).data!.merged.moved).toBe(2)
    expect(granted.db.people[0].domain_id).toBe(tid(60))
  })

  it('the instructions say what this key may reach', async () => {
    const init = async (key: string) => (await (await handleMcp(post(rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {} }), { key }), deps(fakeStore()))).json()).result.instructions as string
    expect(await init(KEY)).toContain('The journal and the people they keep are not available here.')
    expect(await init(PERSONAL_KEY)).toContain('may also read and write the journal and the people they keep')
    expect(await init(JOURNAL_KEY)).toContain('people are not available here')
    expect(await init(READ_KEY)).toContain('This key reads only')
  })

  it('the Settings switches keep a fixed order and never invent a scope', () => {
    expect(withPersonal([], 'people', true)).toEqual(['people'])
    expect(withPersonal(['people'], 'journal', true)).toEqual(['journal', 'people'])
    expect(withPersonal(['journal', 'people'], 'journal', false)).toEqual(['people'])
  })
})

describe('MCP full: tasks', () => {
  it('edit_task: labels, priority, a reminder, Someday, pause — each logged as the app logs it', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'Pay rent', { due_at: '2026-10-06T06:00:00Z', recurrence_rule: 'FREQ=MONTHLY' })])
    const r = await call(deps(store), 'edit_task', { id: tid(1), labels: ['money', ' home ', 'money'], priority: 2, remind_at: '2026-10-06T08:30', paused: true })
    expect(r.data!.changed).toEqual(['labels → money, home', 'priority → high', 'reminder → 2026-10-06 08:30', 'paused'])
    expect(store.tasks[0]).toMatchObject({ labels: ['money', 'home'], priority: 2, reminder_at: '2026-10-06T05:30:00.000Z', reminder_sent: false, paused: true })
    expect(store.logs.map((l) => [l.eventType, l.payload])).toEqual([
      ['task.updated', { field: 'labels', source: 'mcp' }],
      ['task.updated', { field: 'priority', source: 'mcp' }],
      ['task.reminder_set', { reminder_at: '2026-10-06T05:30:00.000Z', source: 'mcp' }],
      ['task.paused', { source: 'mcp' }],
    ])
    const off = await call(deps(store), 'edit_task', { id: tid(1), labels: null, priority: null, remind_at: null, someday: true })
    expect(off.data!.changed).toEqual(['labels cleared', 'priority cleared', 'reminder off', 'parked for Someday'])
    expect((await call(deps(store), 'edit_task', { id: tid(1), remind_at: '2026-10-06' })).text).toContain('needs a time')
    expect((await call(deps(store), 'edit_task', { id: tid(1), priority: 4 })).text).toContain('from 1 to 3')
  })

  it('edit_task: into an area (its domain with it, out of the project), and the one-place rule', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'Fix the gate', { project_id: P1, domain_id: D1 })])
    store.db.areas = [{ id: tid(40), name: 'Home', domain_id: null, deleted_at: null, sort_order: 0 }]
    const r = await call(deps(store), 'edit_task', { id: tid(1), area_id: tid(40) })
    expect(r.data!.changed).toEqual(['area → Home'])
    expect(store.tasks[0]).toMatchObject({ project_id: null, area_id: tid(40), domain_id: null })
    expect(store.logs[0]).toMatchObject({ eventType: 'task.moved', payload: { project_id: null, area_id: tid(40), domain_id: null } })
    expect((await call(deps(store), 'edit_task', { id: tid(1), area_id: tid(40), project_id: P1 })).text).toContain('one of project_id, area_id or domain_id')
  })

  it("edit_task: top3 stars (a later date comes to today), goal leads the Top 3 and renumbers it, a full Top 3 is refused", async () => {
    const store = fakeStore('Africa/Cairo', [
      task(1, 'one', { top3: true, top3_rank: 1 }),
      task(2, 'two', { top3: true, top3_rank: 2 }),
      task(3, 'later', { due_at: '2026-10-09T13:00:00Z', someday: false }),
      task(4, 'four'),
    ])
    const star = await call(deps(store), 'edit_task', { id: tid(3), top3: true })
    expect(star.data!.changed).toEqual(["due 2026-10-04 16:00 (the Top 3 is today's)", "in today's Top 3"])
    const full = await call(deps(store), 'edit_task', { id: tid(4), goal: true })
    expect([full.isError, full.text]).toEqual([true, expect.stringContaining('Top 3 is full ("one", "two", "later")')])
    const goal = await call(deps(store), 'edit_task', { id: tid(3), goal: true })
    expect(goal.data!.changed).toEqual(['the goal of the day'])
    expect(store.tasks.map((t) => [t.title, t.top3, t.top3_rank ?? null])).toEqual([['one', true, 2], ['two', true, 3], ['later', true, 1], ['four', false, null]])
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.starred', 'task.goal_set'])
    const out = await call(deps(store), 'edit_task', { id: tid(1), top3: false })
    expect(out.data!.changed).toEqual(["out of today's Top 3"])
    expect((await call(deps(store), 'edit_task', { id: tid(2), goal: true, someday: true })).text).toContain('Someday')
  })

  it('edit_task: into a Time slot (its block comes off, a missed due date follows), and out again', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'Write', { due_at: '2026-10-01T06:00:00Z', scheduled_start: '2026-10-01T06:00:00Z', scheduled_end: '2026-10-01T06:30:00Z' })], [
      { id: tid(500), task_id: tid(1), starts_at: '2026-10-01T06:00:00Z', ends_at: '2026-10-01T06:30:00Z', all_day: false },
    ])
    store.cal.find((e) => e.id === tid(902))!.type = 'time_block' // Choir, weekly Thursdays 18:00 Cairo
    expect((await call(deps(store), 'edit_task', { id: tid(1), slot_id: tid(902) })).text).toContain('slot_occurrence')
    const r = await call(deps(store), 'edit_task', { id: tid(1), slot_id: tid(902), slot_occurrence: '2026-10-08' })
    expect(r.data!.changed).toEqual(['in Choir · 2026-10-08 18:00–19:30'])
    expect(store.tasks[0]).toMatchObject({ slot_id: tid(902), slot_date: '2026-10-08', scheduled_start: '2026-10-08T15:00:00.000Z', due_at: '2026-10-08T15:00:00.000Z' })
    expect(store.cal.find((e) => e.id === tid(500))!.deleted_at).toBeTruthy()
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.scheduled', 'calendar_event.deleted'])
    expect((await call(deps(store), 'calendar', { from: '2026-10-08', to: '2026-10-08' })).data!.events[0].tasks).toEqual([{ id: tid(1), title: 'Write', done: false }])
    const back = await call(deps(store), 'edit_task', { id: tid(1), slot_id: null })
    expect(back.data!.changed).toEqual(['out of its Time slot (unscheduled)'])
    expect(store.tasks[0]).toMatchObject({ slot_id: null, slot_date: null, scheduled_start: null })
    expect((await call(deps(store), 'edit_task', { id: tid(1), slot_id: tid(900) })).text).toContain('No Time block')
  })

  it('edit_task: place_before / place_after sit between the neighbours on the dates\' scale (0076), unlogged', async () => {
    const store = fakeStore('Africa/Cairo', [
      task(1, 'a', { due_at: '2026-10-05T06:00:00Z' }),
      task(2, 'b', { due_at: '2026-10-06T06:00:00Z' }),
      task(3, 'c', { due_at: '2026-10-07T06:00:00Z' }),
    ])
    await call(deps(store), 'edit_task', { id: tid(3), place_before: tid(2) })
    const k = (n: number) => orderKey(store.tasks[n - 1])
    expect([k(1) < k(3), k(3) < k(2)]).toEqual([true, true])
    await call(deps(store), 'edit_task', { id: tid(1), place_after: tid(2) })
    expect(k(2) < k(1)).toBe(true)
    expect(store.logs).toEqual([])
    expect(keyBeside(100, [], 'before')).toBe(100 - 60_000)
    expect(keyBeside(100, [40, 90, 200], 'after')).toBe(150)
  })

  it('bulk: the same edit on several tasks, a refusal for one reported, the rest done', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'a'), task(2, 'b', { status: 'done' }), task(3, 'c')])
    const r = await call(deps(store), 'edit_task', { ids: [tid(1), tid(2), tid(3)], priority: 1 })
    expect(r.data!.results.map((x: { edited: { title: string } }) => x.edited.title)).toEqual(['a', 'c'])
    expect(r.data!.failed).toEqual([{ id: tid(2), error: '"b" is already done.' }])
    const done = await call(deps(store), 'complete_task', { ids: [tid(1), tid(3)] })
    expect(done.data!.results).toHaveLength(2)
    expect((await call(deps(store), 'edit_task', { ids: [tid(1)], goal: true })).text).toContain('one task at a time')
    expect((await call(deps(store), 'complete_task', { id: tid(1), ids: [tid(3)] })).text).toContain('not both')
  })

  it('reopen_task, reschedule_task to no date, and Trash: a task with its blocks, then back', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'Ship', { status: 'done', completed_at: '2026-10-03T10:00:00Z' }), task(2, 'Plan', { due_at: '2026-10-05T07:00:00Z', top3: true, scheduled_start: '2026-10-05T07:00:00Z', scheduled_end: '2026-10-05T08:00:00Z' })], [
      { id: tid(510), task_id: tid(2), starts_at: '2026-10-05T07:00:00Z', ends_at: '2026-10-05T08:00:00Z', all_day: false },
    ])
    expect((await call(deps(store), 'reopen_task', { id: tid(1) })).data!.reopened).toMatchObject({ title: 'Ship' })
    expect(store.tasks[0]).toMatchObject({ status: 'todo', completed_at: null })
    expect((await call(deps(store), 'reopen_task', { id: tid(1) })).text).toContain('already open')
    const off = await call(deps(store), 'reschedule_task', { id: tid(2), when: null })
    expect(off.data!.changed).toEqual(['date taken off', '1 calendar block taken off the calendar (in Trash)'])
    expect(store.tasks[1]).toMatchObject({ due_at: null, scheduled_start: null })
    store.cal.find((e) => e.id === tid(510))!.deleted_at = null // its block back on, for the Trash round trip
    const gone = await call(deps(store), 'move_to_trash', { type: 'task', id: tid(2) })
    expect(gone.data!.trashed).toEqual({ type: 'task', id: tid(2), title: 'Plan' })
    expect([!!store.tasks[1].deleted_at, store.tasks[1].top3, !!store.cal.find((e) => e.id === tid(510))!.deleted_at]).toEqual([true, false, true])
    expect((await call(deps(store), 'trash', {})).data!.items.map((i: { id: string }) => i.id)).toEqual([tid(2), tid(510)])
    expect((await call(deps(store), 'restore_from_trash', { type: 'task', id: tid(2) })).data!.restored.title).toBe('Plan')
    expect([store.tasks[1].deleted_at, store.cal.find((e) => e.id === tid(510))!.deleted_at]).toEqual([null, null])
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.reopened', 'task.rescheduled', 'calendar_event.deleted', 'task.deleted', 'task.restored'])
    expect((await call(deps(store), 'restore_from_trash', { type: 'task', id: tid(2) })).text).toContain('in Trash')
  })

  it('add_task: labels, priority, a reminder, an area, Someday, a subtask', async () => {
    const store = fakeStore('Africa/Cairo', [task(9, 'Parent'), task(10, 'Child', { parent_task_id: tid(9) })])
    store.db.areas = [{ id: tid(40), name: 'Home', domain_id: D1, deleted_at: null }]
    const r = await call(deps(store), 'add_task', { title: 'Sub', parent_id: tid(9), area_id: tid(40), labels: ['x'], priority: 3, remind_at: '2026-10-05T10:00' })
    expect(store.tasks[2]).toMatchObject({ parent_task_id: tid(9), area_id: tid(40), domain_id: D1, labels: ['x'], priority: 3, reminder_at: '2026-10-05T07:00:00.000Z' })
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.created', 'task.reminder_set'])
    expect(r.data!.added).toMatchObject({ title: 'Sub', labels: ['x'], priority: 3 })
    expect((await call(deps(store), 'add_task', { title: 'deep', parent_id: tid(10) })).text).toContain('one level deep')
    expect((await call(deps(store), 'add_task', { title: 's', someday: true, due: '2026-10-05' })).text).toContain('Someday')
    expect((await call(deps(store), 'add_task', { title: 's', someday: true })).isError).toBe(false)
  })
})

describe('MCP full: the calendar keeps Time slots whole', () => {
  it('a Time block moved takes its tasks; deleted, it lets them go', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'Held', { slot_id: tid(530), slot_date: '2026-10-05', scheduled_start: '2026-10-05T07:00:00Z', scheduled_end: '2026-10-05T09:00:00Z' })])
    store.cal.push({ id: tid(530), title: 'Deep work', starts_at: '2026-10-05T07:00:00Z', ends_at: '2026-10-05T09:00:00Z', all_day: false, task_id: null, type: 'time_block' })
    const moved = await call(deps(store), 'edit_event', { id: tid(530), start: '2026-10-05T13:00', remind_min: 10 })
    expect(moved.data!.changed).toEqual(['time → 2026-10-05 13:00–15:00', 'remind 10 min before', '1 task in it moved with it'])
    expect(store.tasks[0]).toMatchObject({ slot_id: tid(530), scheduled_start: '2026-10-05T10:00:00.000Z', scheduled_end: '2026-10-05T12:00:00.000Z' })
    expect(store.cal.find((e) => e.id === tid(530))!.remind_min).toBe(10)
    const del = await call(deps(store), 'delete_event', { id: tid(530) })
    expect(del.data!.changed).toEqual(['the event moved to Trash', '1 task it held is back unscheduled'])
    expect(store.tasks[0]).toMatchObject({ slot_id: null, slot_date: null, scheduled_start: null })
  })

  // The app's rule (calendar/api reseat / releaseRow / followSlot, slots-ux 2026-10-16): no task is left
  // held by a day, a kind or a band that holds none.
  const held = (n: number, title: string, slot: number, day: string, from: string, to: string) =>
    task(n, title, { slot_id: tid(slot), slot_date: day, scheduled_start: `${day}T${from}:00Z`, scheduled_end: `${day}T${to}:00Z` })
  const OUT = { slot_id: null, slot_date: null, scheduled_start: null, scheduled_end: null }
  const slotLogs = (store: ReturnType<typeof fakeStore>) => store.logs.filter((l) => l.entityType === 'task').map((l) => [l.eventType, l.entityId, l.payload])

  it('a repeating slot re-timed, re-ruled, then not repeating: each task to its day, else out', async () => {
    // Code block: every day from Mon 5 Oct, 10:00–12:00 Cairo; one task held Mon, Tue and Wed.
    const store = fakeStore('Africa/Cairo', [held(1, 'Mon', 531, '2026-10-05', '07:00', '09:00'), held(2, 'Tue', 531, '2026-10-06', '07:00', '09:00'), held(3, 'Wed', 531, '2026-10-07', '07:00', '09:00')])
    store.cal.push({ id: tid(531), title: 'Code block', starts_at: '2026-10-05T07:00:00Z', ends_at: '2026-10-05T09:00:00Z', all_day: false, task_id: null, type: 'time_block', recurrence_rule: 'FREQ=DAILY', recurrence_exdates: [] })
    const retimed = await call(deps(store), 'edit_event', { id: tid(531), start: '2026-10-05T13:00' })
    expect(retimed.data!.changed).toEqual(['time → 13:00–15:00, every occurrence', '3 tasks in it moved with it'])
    expect(store.tasks.map((t) => [t.slot_date, t.scheduled_start, t.scheduled_end])).toEqual([
      ['2026-10-05', '2026-10-05T10:00:00.000Z', '2026-10-05T12:00:00.000Z'], ['2026-10-06', '2026-10-06T10:00:00.000Z', '2026-10-06T12:00:00.000Z'], ['2026-10-07', '2026-10-07T10:00:00.000Z', '2026-10-07T12:00:00.000Z'],
    ])
    expect(slotLogs(store)).toEqual([1, 2, 3].map((n) => ['task.scheduled', tid(n), { slot_id: tid(531), slot_date: `2026-10-0${n + 4}`, source: 'mcp' }]))
    // Mondays and Wednesdays now: Tuesday's task has no slot that day — out, unscheduled; the others stay, untouched.
    store.logs = []
    const reruled = await call(deps(store), 'edit_event', { id: tid(531), repeat: 'FREQ=WEEKLY;BYDAY=MO,WE' })
    expect(reruled.data!.changed).toEqual(['repeats FREQ=WEEKLY;BYDAY=MO,WE', '1 task it held is back unscheduled'])
    expect(store.tasks[1]).toMatchObject(OUT)
    expect(store.tasks[0]).toMatchObject({ slot_id: tid(531), slot_date: '2026-10-05', scheduled_start: '2026-10-05T10:00:00.000Z' })
    expect(store.tasks[2]).toMatchObject({ slot_id: tid(531), slot_date: '2026-10-07', scheduled_start: '2026-10-07T10:00:00.000Z' })
    expect(slotLogs(store)).toEqual([['task.unscheduled', tid(2), { slot_id: tid(531), source: 'mcp' }]])
    // Not repeating: it is its first occurrence (Mon 5) only — Wednesday's task comes out.
    const once = await call(deps(store), 'edit_event', { id: tid(531), repeat: null })
    expect(once.data!.changed).toEqual(['no longer repeats', '1 task it held is back unscheduled'])
    expect(store.tasks[2]).toMatchObject(OUT)
    expect(store.tasks[0]).toMatchObject({ slot_id: tid(531), slot_date: '2026-10-05', scheduled_start: '2026-10-05T10:00:00.000Z' })
    const cal = await call(deps(store), 'calendar', { from: '2026-10-05', to: '2026-10-05' })
    expect(cal.data!.events.find((e: { id: string }) => e.id === tid(531)).tasks).toEqual([{ id: tid(1), title: 'Mon', done: false }])
  })

  it('a Time block made an event lets its tasks go — the whole row, or one occurrence of a series', async () => {
    const store = fakeStore('Africa/Cairo', [held(4, 'A', 532, '2026-10-06', '07:00', '09:00'), held(5, 'B', 532, '2026-10-06', '07:00', '09:00'), held(6, 'C', 533, '2026-10-07', '05:00', '06:00'), held(7, 'D', 533, '2026-10-08', '05:00', '06:00')])
    store.cal.push(
      { id: tid(532), title: 'Admin', starts_at: '2026-10-06T07:00:00Z', ends_at: '2026-10-06T09:00:00Z', all_day: false, task_id: null, type: 'time_block' },
      { id: tid(533), title: 'Writing', starts_at: '2026-10-05T05:00:00Z', ends_at: '2026-10-05T06:00:00Z', all_day: false, task_id: null, type: 'time_block', recurrence_rule: 'FREQ=DAILY', recurrence_exdates: [] },
    )
    const r = await call(deps(store), 'edit_event', { id: tid(532), kind: 'event' })
    expect(r.data!.changed).toEqual(['kind → event', '2 tasks it held are back unscheduled'])
    expect([store.tasks[0], store.tasks[1]]).toEqual([expect.objectContaining(OUT), expect.objectContaining(OUT)])
    expect(slotLogs(store)).toEqual([4, 5].map((n) => ['task.unscheduled', tid(n), { slot_id: tid(532), source: 'mcp' }]))
    // Only Wednesday's Writing an event: its task out; Thursday's stays in the series.
    const one = await call(deps(store), 'edit_event', { id: tid(533), occurrence: '2026-10-07T08:00', kind: 'event' })
    expect(one.data!.changed).toEqual(['kind → event', 'only the 2026-10-07 08:00–09:00 occurrence: it is an event of its own now', '1 task it held is back unscheduled'])
    expect(store.tasks[2]).toMatchObject(OUT)
    expect(store.tasks[3]).toMatchObject({ slot_id: tid(533), slot_date: '2026-10-08', scheduled_start: '2026-10-08T05:00:00Z' })
  })

  it('a Time block moved into the all-day band lets its tasks go', async () => {
    const store = fakeStore('Africa/Cairo', [held(8, 'Held', 534, '2026-10-08', '07:00', '09:00')])
    store.cal.push({ id: tid(534), title: 'Deep', starts_at: '2026-10-08T07:00:00Z', ends_at: '2026-10-08T09:00:00Z', all_day: false, task_id: null, type: 'time_block' })
    const r = await call(deps(store), 'edit_event', { id: tid(534), start: '2026-10-08' })
    expect(r.data!.changed).toEqual(['time → 2026-10-08', '1 task it held is back unscheduled'])
    expect(store.tasks[0]).toMatchObject(OUT)
    expect(slotLogs(store)).toEqual([['task.unscheduled', tid(8), { slot_id: tid(534), source: 'mcp' }]])
  })

  it('add_event takes a reminder, never on an all-day event', async () => {
    const store = fakeStore()
    const r = await call(deps(store), 'add_event', { title: 'Gym', start: '2026-10-06T18:00', duration_min: 90, remind_min: 15 })
    expect(r.data!.added).toMatchObject({ title: 'Gym', remind_min: 15 })
    expect((await call(deps(store), 'add_event', { title: 'Trip', start: '2026-10-06', remind_min: 15 })).text).toContain('timed event')
  })
})

describe('MCP full: the Inbox', () => {
  const item = (n: number, over: Record<string, unknown> = {}) => ({ id: tid(n), raw_text: `capture ${n}`, kind: 'text', status: 'pending', payload: null, ai_parse: null, snoozed_until: null, deleted_at: null, filed_task_id: null, created_at: '2026-10-04T08:00:00Z', ...over })

  it('inbox lists the waiting captures; snoozed and dismissed ones on request', async () => {
    const store = fakeStore()
    store.inbox.push(item(1), item(2, { snoozed_until: '2026-10-06T06:00:00Z' }), item(3, { status: 'dismissed' }), item(4, { deleted_at: '2026-10-03T00:00:00Z' }))
    const ids = async (show?: string) => ((await call(deps(store), 'inbox', show ? { show } : {})).data!.items as { id: string }[]).map((i) => i.id)
    expect(await ids()).toEqual([tid(1)])
    expect(await ids('snoozed')).toEqual([tid(2)])
    expect(await ids('dismissed')).toEqual([tid(3)])
    expect(await ids('all')).toEqual([tid(1), tid(2), tid(3)])
  })

  it("file as a task: the AI's title and timed date (on the calendar), the link rides along", async () => {
    const store = fakeStore()
    store.inbox.push(item(5, { raw_text: 'dentist fri 3pm https://dent.example/book', ai_parse: { title: 'Dentist', due_at: '2026-10-09T12:00:00Z', has_time: true }, payload: { duration_override: 45 } }))
    const r = await call(deps(store), 'file_inbox_item', { id: tid(5), as: 'task' })
    expect(r.data!.filed).toMatchObject({ as: 'task', task: { title: 'Dentist', due: '2026-10-09 15:00', duration_min: 45 }, calendar_block: '2026-10-09 15:00–15:45' })
    expect(store.tasks[0].external_ref).toMatchObject({ source: 'link', url: 'https://dent.example/book' })
    expect(store.inbox[0]).toMatchObject({ status: 'filed', filed_task_id: store.tasks[0].id })
    expect(store.logs.map((l) => l.eventType)).toEqual(['task.created', 'task.scheduled', 'inbox.filed'])
    expect((await call(deps(store), 'file_inbox_item', { id: tid(5), as: 'task' })).text).toContain('already filed')
  })

  it('file as an event, as a Library note; the wrong fields for a kind are refused', async () => {
    const store = fakeStore()
    store.inbox.push(item(6), item(7))
    expect((await call(deps(store), 'file_inbox_item', { id: tid(6), as: 'event', project_id: P1, start: '2026-10-06T10:00' })).text).toContain('not project_id')
    const ev = await call(deps(store), 'file_inbox_item', { id: tid(6), as: 'event', start: '2026-10-06T10:00' })
    expect(ev.data!.filed.event).toMatchObject({ title: 'capture 6', start: '2026-10-06 10:00', end: '2026-10-06 10:30' })
    expect(store.inbox[0]).toMatchObject({ status: 'filed', payload: { filed_to: 'event' } })
    const note = await call(deps(store), 'file_inbox_item', { id: tid(7), as: 'note', title: 'Idea' })
    expect(store.db.notes).toEqual([expect.objectContaining({ id: note.data!.filed.note.id, title: 'Idea', body: 'capture 7' })])
  })

  it('triage: dismiss, snooze (future only), unsnooze, restore — in bulk too', async () => {
    const store = fakeStore()
    store.inbox.push(item(8), item(9))
    expect((await call(deps(store), 'update_inbox_item', { id: tid(8), action: 'snooze', until: '2026-10-01' })).text).toContain('future')
    const s = await call(deps(store), 'update_inbox_item', { ids: [tid(8), tid(9)], action: 'snooze', until: '2026-10-06' })
    expect(s.data!.results[0].snoozed.snoozed_until).toBe('2026-10-06 09:00')
    await call(deps(store), 'update_inbox_item', { id: tid(8), action: 'unsnooze' })
    await call(deps(store), 'update_inbox_item', { id: tid(9), action: 'dismiss' })
    expect(store.inbox.map((i) => [i.status, i.snoozed_until])).toEqual([['pending', null], ['dismissed', '2026-10-06T06:00:00.000Z']])
    expect(store.logs.map((l) => l.eventType)).toEqual(['inbox.snoozed', 'inbox.snoozed', 'inbox.restored', 'inbox.dismissed'])
  })
})

describe('MCP full: projects, areas, domains, labels, templates', () => {
  it('save_project creates, then a new domain takes its tasks along; archived = finished', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'in it', { project_id: P1, domain_id: D1 })])
    store.db.domains.push({ id: tid(60), name: 'Home', color: null, sort_order: 1, deleted_at: null })
    const made = await call(deps(store), 'save_project', { name: 'Garden', color: 'Sage', target_date: '2026-11-01' })
    expect(made.data!.created).toMatchObject({ name: 'Garden', status: 'active', color: 'sage', target_date: '2026-11-01' })
    expect(store.db.projects[1]).toMatchObject({ target_date: '2026-11-01T00:00:00Z', color: 'var(--acc-sage)' })
    const r = await call(deps(store), 'save_project', { id: P1, domain_id: tid(60), status: 'archived' })
    expect(r.data!.changed).toEqual(['domain → Home', 'archived (finished)', '1 task moved with it'])
    expect(store.tasks[0].domain_id).toBe(tid(60))
    expect(store.logs.map((l) => l.eventType)).toEqual(['project.created', 'project.reparented', 'project.archived', 'task.moved'])
    expect((await call(deps(store), 'save_project', { name: 'x', color: 'neon' })).text).toContain('terracotta')
  })

  it('milestones and a checklist: a task-linked line is a real task, and ticking it completes the task', async () => {
    const store = fakeStore()
    const m = await call(deps(store), 'update_milestone', { project_id: P1, action: 'add', title: 'Beta', weight: 3 })
    await call(deps(store), 'update_milestone', { project_id: P1, action: 'complete', milestone_id: m.data!.added.id })
    const line = await call(deps(store), 'update_checklist', { project_id: P1, action: 'add', title: 'Write docs', type: 'task-linked' })
    expect(store.tasks[0]).toMatchObject({ title: 'Write docs', project_id: P1, domain_id: D1 })
    const tick = await call(deps(store), 'update_checklist', { project_id: P1, action: 'check', item_id: line.data!.added.id })
    expect([tick.data!.line.done, store.tasks[0].status]).toEqual([true, 'done'])
    const p = (await call(deps(store), 'get_project', { id: P1 })).data!.project
    expect(p.milestones).toEqual([{ id: m.data!.added.id, title: 'Beta', weight: 3, done: true }])
    expect(p.checklist).toEqual([{ id: line.data!.added.id, title: 'Write docs', type: 'task-linked', done: true, task_id: store.tasks[0].id }])
    expect(store.logs.map((l) => l.eventType)).toEqual(['project.milestone_added', 'project.milestone_completed', 'task.created', 'project.checklist_item_added', 'task.completed'])
  })

  it('checklist templates: save one from a project, use it on another — task-linked items become tasks there', async () => {
    const store = fakeStore()
    store.db.projects[0].checklist = [{ id: tid(80), title: 'Kickoff', type: 'one-shot', completed: true }, { id: tid(81), title: 'Invoice', type: 'task-linked', completed: false, task_id: null }]
    const saved = await call(deps(store), 'checklist_template', { action: 'save', project_id: P1, name: 'Client' })
    const p2 = (await call(deps(store), 'save_project', { name: 'Client B' })).data!.created.id
    const used = await call(deps(store), 'checklist_template', { action: 'use', template_id: saved.data!.saved.id, project_id: p2 })
    expect(used.data!.used).toEqual({ template: 'Client', project: 'Client B', lines: 2, tasks: 1 })
    expect(store.tasks.map((t) => [t.title, t.project_id])).toEqual([['Invoice', p2]])
    expect((await call(deps(store), 'projects', {})).data!.checklist_templates).toEqual([{ id: saved.data!.saved.id, name: 'Client', items: 2 }])
  })

  it('save_area and save_domain create and change; labels rename, merge, recolour and delete across tasks', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'a', { labels: ['Urgent', 'home'] }), task(2, 'b', { labels: ['urgent-ish'] }), task(3, 'c', { labels: ['home'] })])
    const area = await call(deps(store), 'save_area', { name: 'Health', domain_id: D1 })
    expect(area.data!.created).toMatchObject({ name: 'Health' })
    expect((await call(deps(store), 'save_domain', { name: 'Side', color: 'gold' })).data!.created).toMatchObject({ name: 'Side', color: 'gold' })
    await call(deps(store), 'update_label', { action: 'recolor', name: 'urgent', color: 'Terracotta' })
    expect(store.db.app_settings[0].label_meta).toEqual({ Urgent: 'var(--acc-terra)' })
    const merged = await call(deps(store), 'update_label', { action: 'rename', name: 'urgent-ish', to: 'URGENT' })
    expect(merged.data!.merged).toEqual({ from: 'urgent-ish', to: 'Urgent', tasks: 1 })
    expect(store.tasks.map((t) => t.labels)).toEqual([['Urgent', 'home'], ['Urgent'], ['home']])
    await call(deps(store), 'update_label', { action: 'delete', name: 'home' })
    expect((await call(deps(store), 'labels', {})).data!.labels).toEqual([{ name: 'Urgent', count: 2, color: 'terracotta' }])
    expect(store.logs.filter((l) => l.entityType === 'label').map((l) => [l.eventType, l.payload.entity_key])).toEqual([['label.recolored', 'Urgent'], ['label.merged', 'urgent-ish'], ['label.deleted', 'home']])
    expect(store.logs.some((l) => l.entityType === 'task')).toBe(false) // a relabel isn't task activity
  })
})

describe('MCP full: settings', () => {
  it('reads and writes the safe subset; an unknown zone or a column the server lacks is refused', async () => {
    const store = fakeStore()
    expect((await call(deps(store), 'settings', {})).data!.settings).toMatchObject({ timezone: 'Africa/Cairo', weekend_days: ['sun', 'sat'], morning_digest_at: '08:00' })
    const r = await call(deps(store), 'update_settings', { timezone: 'Europe/London', weekend_days: ['fri', 'sat'], morning_digest_on: false })
    expect(r.data!.updated).toEqual({ timezone: 'Europe/London', weekend_days: ['fri', 'sat'], morning_digest_on: false })
    expect(store.db.app_settings[0]).toMatchObject({ timezone: 'Europe/London', weekend_days: [5, 6], morning_digest_on: false })
    expect(store.logs[0]).toMatchObject({ eventType: 'settings.updated', payload: { fields: ['timezone', 'weekend_days', 'morning_digest_on'] } })
    expect((await call(deps(store), 'update_settings', { timezone: 'Mars/Olympus' })).text).toContain("isn't a time zone")
    expect((await call(deps(store), 'update_settings', { quiet_hours_on: true })).text).toContain('need a newer server')
    expect((await call(deps(store), 'update_settings', { key_hash: 'x' })).text).toContain('Unknown argument')
  })
})

describe('MCP full: routines, focus, rituals', () => {
  it("routines: the streak is the app's (one missed day a month rains), and check_routine ticks the user's day", async () => {
    const store = fakeStore()
    const made = await call(deps(store), 'save_routine', { name: 'Stretch', days: ['every day'], clock_time: '7:30', steps: [{ text: 'Neck', minutes: 2 }, 'Back'] })
    const rid = made.data!.created.id
    expect(made.data!.created).toMatchObject({ name: 'Stretch', days: 'every day', clock_time: '07:30', steps: [{ text: 'Neck', minutes: 2 }, { text: 'Back' }] })
    expect(store.db.routines[0]).toMatchObject({ step_minutes: [2, null], cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] } })
    store.db.routine_completions = ['2026-09-30', '2026-10-01', '2026-10-03'].map((d, i) => ({ id: tid(90 + i), routine_id: rid, completed_on: d }))
    const r = await call(deps(store), 'check_routine', { id: rid })
    expect(r.data!.routine).toMatchObject({ done_today: true, streak: { current: 4, best: 4 } })
    expect((await call(deps(store), 'check_routine', { id: rid, date: '2026-10-05' })).text).toContain("hasn't come yet")
    await call(deps(store), 'check_routine', { id: rid, done: false })
    await call(deps(store), 'save_routine', { id: rid, active: false })
    expect((await call(deps(store), 'routines', {})).data!.routines).toEqual([])
    expect(store.logs.map((l) => l.eventType)).toEqual(['routine.created', 'routine.checked', 'routine.unchecked', 'routine.archived'])
  })

  it("streakOf matches the app's computeStreak", () => {
    const today = new Date('2026-10-04T11:00:00Z') // Sunday, Cairo
    const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 4 - i)).toISOString().slice(0, 10))
    const cases: [string[], number[]][] = [
      [days(10), [0, 1, 2, 3, 4, 5, 6]],
      [days(40).filter((_, i) => i % 9 !== 3), [0, 1, 2, 3, 4, 5, 6]],
      [days(60).filter((_, i) => i % 5 !== 0), [1, 3, 5]],
      [days(30).slice(1), [0, 6]],
      [[], [1]],
    ]
    for (const [dates, weekdays] of cases) expect(streakOf(dates, weekdays, '2026-10-04')).toEqual(computeStreak(dates, { weekdays }, today))
  })

  it('a focus round is logged on the task from its start; stopping it keeps what was spent', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'Write', { project_id: P1 })])
    const r = await call(deps(store), 'start_focus', { task_id: tid(1), minutes: 50 })
    expect(r.data!.focus).toMatchObject({ minutes: 50, until: '2026-10-04 14:50' })
    expect(store.db.time_entries[0]).toMatchObject({ task_id: tid(1), project_id: P1, duration_min: 50, started_at: NOW.toISOString() })
    expect((await call(deps(store), 'start_focus', { task_id: tid(1) })).text).toContain('already running')
    const later = deps(store, { now: () => new Date(NOW.getTime() + 20 * 60_000) })
    const stop = await call(later, 'stop_focus', { complete_task: true })
    expect(stop.data!.stopped).toMatchObject({ minutes: 20, task: { status: 'done' } })
    expect(store.db.time_entries[0].duration_min).toBe(20)
    expect(store.logs.map((l) => l.eventType)).toEqual(['project.work_logged', 'project.work_edited', 'task.completed'])
    expect((await call(later, 'stop_focus', {})).text).toContain('No focus round')
  })

  it("plan_my_day: carries, makes the Top 3 in order (the first the goal), unstars the rest, finishes the ritual", async () => {
    const store = fakeStore('Africa/Cairo', [
      task(1, 'old', { due_at: '2026-10-01T06:00:00Z' }),
      task(2, 'older', { due_at: '2026-09-30T06:00:00Z' }),
      task(3, 'pick a'),
      task(4, 'was a pick', { top3: true, top3_rank: 1 }),
    ])
    const r = await call(deps(store), 'plan_my_day', { carry: [{ id: tid(1), to: 'tomorrow' }, { id: tid(2), to: 'someday' }], top3: [tid(3), tid(1)] })
    expect(r.data!.carried.map((t: { to: string }) => t.to)).toEqual(['tomorrow', 'someday'])
    expect(store.tasks.map((t) => [t.title, t.top3, t.top3_rank ?? null])).toEqual([['old', true, 2], ['older', false, null], ['pick a', true, 1], ['was a pick', false, null]])
    // Picked though carried to tomorrow: the Top 3 is today's.
    expect(store.tasks[0].due_at).toBe('2026-10-04T06:00:00.000Z')
    expect(store.tasks[1].someday).toBe(true)
    const finished = store.logs.find((l) => l.eventType === 'ritual.finished')!
    expect(finished.payload).toMatchObject({ ritual: 'morning', date: '2026-10-04', steps: ['overdue', 'inbox', 'top3', 'block'], entity_key: 'morning-2026-10-04' })
    expect((await call(deps(store), 'today')).data!.rituals).toEqual({ plan_my_day_done: true, shut_down_done: false })
  })

  it("shut_down: rolls, seeds tomorrow's 3 (a seed on today's plate rolls too), and the journal line needs the journal scope", async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'left today', { due_at: '2026-10-04T06:00:00Z' }), task(2, 'seed me', { due_at: '2026-10-04T07:00:00Z' }), task(3, 'later', { due_at: '2026-10-08T06:00:00Z' })])
    expect((await call(deps(store), 'shut_down', { line: 'good day' })).text).toContain("can't reach")
    const r = await call(deps(store), 'shut_down', { roll: [tid(1)], seeds: [tid(2), tid(3)] })
    expect(r.data).toMatchObject({ seeds_for: '2026-10-05', shut_down_done: true })
    expect(r.data!.rolled.map((t: { title: string; due: string }) => [t.title, t.due])).toEqual([['left today', '2026-10-05 09:00'], ['seed me', '2026-10-05 09:00']])
    expect(store.logs.filter((l) => l.eventType === 'ritual.seeded').map((l) => [l.entityId, l.payload.for_date])).toEqual([[tid(2), '2026-10-05'], [tid(3), '2026-10-05']])
    // Re-seeding the same night swaps a seed out.
    await call(deps(store), 'shut_down', { seeds: [tid(3)] })
    expect(store.logs.filter((l) => l.eventType === 'ritual.unseeded').map((l) => l.entityId)).toEqual([tid(2)])
    const line = await call(deps(store), 'shut_down', { line: 'good day' }, JOURNAL_KEY)
    expect(line.data!.line_saved).toMatchObject({ date: '2026-10-04' })
    expect(store.db.journal_entries[0]).toMatchObject({ body: 'good day', entry_date: '2026-10-04' })
    expect(store.logs.find((l) => l.eventType === 'journal.line_added')!.payload).toEqual({ date: '2026-10-04', entity_key: '2026-10-04', source: 'mcp' })
  })
})

describe('MCP full: Library, insights, journal and people', () => {
  it('Library: add, change (reading progress finishes a book), list, delete for good with the row given back', async () => {
    const store = fakeStore()
    const b = await call(deps(store), 'save_library_item', { kind: 'book', title: 'Dune', total_pages: 400 })
    const bid = b.data!.added.id
    const p = await call(deps(store), 'save_library_item', { kind: 'book', id: bid, current_page: 450 })
    expect(p.data!.saved).toMatchObject({ page: '400/400', status: 'finished' })
    await call(deps(store), 'save_library_item', { kind: 'quote', text: 'Fear is the mind-killer.', author: 'Herbert', book_id: bid })
    expect((await call(deps(store), 'save_library_item', { kind: 'note', body: 'x', author: 'y' })).text).toContain('not author')
    expect((await call(deps(store), 'library', { query: 'mind' })).data).toEqual({ books: [], notes: [], quotes: [expect.objectContaining({ author: 'Herbert' })] })
    const del = await call(deps(store), 'delete_library_item', { kind: 'book', id: bid })
    expect(del.data!.deleted).toMatchObject({ kind: 'book', title: 'Dune', current_page: 400 })
    expect(store.db.books).toEqual([])
    expect(store.logs.map((l) => l.eventType)).toEqual(['book.created', 'book.progress_updated', 'quote.created', 'book.deleted'])
  })

  it('insights: the week from the day after the weekend, what is slipping past the threshold, the streaks', async () => {
    const store = fakeStore('Africa/Cairo', [task(1, 'done this week', { status: 'done', completed_at: '2026-10-04T08:00:00Z' }), task(2, 'done last week', { status: 'done', completed_at: '2026-10-02T08:00:00Z' })])
    store.db.slipping = [{ entity_type: 'project', entity_id: P1, entity_name: 'Shaheen Website', days_since: 12 }, { entity_type: 'area', entity_id: tid(40), entity_name: 'Home', days_since: 3 }]
    const r = await call(deps(store), 'insights', {})
    // Weekend Sat+Sun → the week starts Monday 28 Sep.
    expect(r.data!.week).toMatchObject({ from: '2026-09-28', through: '2026-10-04', done: 2 })
    expect(r.data!.slipping).toEqual([{ type: 'project', id: P1, name: 'Shaheen Website', days_since: 12 }])
    store.db.app_settings[0].weekend_days = [5, 6] // Fri + Sat → the week starts Sunday
    expect((await call(deps(store), 'insights', {})).data!.week).toMatchObject({ from: '2026-10-04', done: 1, done_titles: ['done this week'] })
  })

  it('journal: write (mood rides on the day\'s first entry), read a range, move to Trash and back', async () => {
    const store = fakeStore()
    const first = await call(deps(store), 'save_journal_entry', { body: 'Morning pages', date: '2026-10-03' }, JOURNAL_KEY)
    const second = await call(deps(store), 'save_journal_entry', { body: 'Evening', date: '2026-10-03', mood: '🙂', gratitude: ['tea'] }, JOURNAL_KEY)
    expect(store.db.journal_entries.map((e) => [e.body, e.mood, e.gratitude])).toEqual([['Morning pages', '🙂', ['tea']], ['Evening', null, []]])
    expect(second.data!.written).toMatchObject({ body: 'Evening', date: '2026-10-03' })
    const read = await call(deps(store), 'journal', { from: '2026-10-01', to: '2026-10-04' }, JOURNAL_KEY)
    expect(read.data!.entries.map((e: { body: string }) => e.body).sort()).toEqual(['Evening', 'Morning pages'])
    await call(deps(store), 'move_to_trash', { type: 'journal_entry', id: first.data!.written.id }, JOURNAL_KEY)
    expect((await call(deps(store), 'move_to_trash', { type: 'journal_entry', id: second.data!.written.id })).text).toContain("can't reach")
    await call(deps(store), 'restore_from_trash', { type: 'journal_entry', id: first.data!.written.id }, JOURNAL_KEY)
    expect(store.logs.map((l) => l.eventType)).toEqual(['journal.created', 'journal.created', 'journal.updated', 'journal.deleted', 'journal.restored'])
  })

  it('people: add with facts, log an interaction, read one, delete for good with their interactions given back', async () => {
    const store = fakeStore()
    const p = await call(deps(store), 'save_person', { name: 'Mona', facts: [{ label: 'Birthday', value: '12 May', date: '05-12' }] }, PERSONAL_KEY)
    const pid = p.data!.added.id
    await call(deps(store), 'log_interaction', { person_id: pid, summary: 'Coffee', when: '2026-10-02T10:00' }, PERSONAL_KEY)
    expect((await call(deps(store), 'log_interaction', { person_id: pid, summary: 'x', when: '2026-10-09' }, PERSONAL_KEY)).text).toContain('future')
    const one = await call(deps(store), 'people', { id: pid }, PERSONAL_KEY)
    expect(one.data!.person).toMatchObject({ name: 'Mona', facts: [{ label: 'Birthday', value: '12 May', date: '05-12' }], last_spoke: '2026-10-02', interactions: [{ summary: 'Coffee', when: '2026-10-02 10:00' }] })
    const gone = await call(deps(store), 'delete_person', { id: pid }, PERSONAL_KEY)
    expect(gone.data!.deleted).toMatchObject({ person: { name: 'Mona' }, interactions: [{ summary: 'Coffee' }] })
    expect([store.db.people, store.db.interactions]).toEqual([[], []])
    expect(store.logs.map((l) => l.eventType)).toEqual(['people.created', 'people.interaction_logged', 'people.deleted'])
  })
})

// Smart lists (0081): the saved filters, read through the same rules the app uses (_shared/smartList.ts).
describe('MCP full: smart lists', () => {
  const L1 = tid(701), L2 = tid(702), L3 = tid(703)
  const seeded = () => {
    const store = fakeStore('Africa/Cairo', [
      task(1, 'Fix header', { project_id: P1, duration_min: 20 }), // in Work through its project
      task(2, 'Rewrite the site', { project_id: P1, duration_min: 90 }),
      task(3, 'Own domain', { domain_id: D1, duration_min: 15 }),
      task(4, 'Call mum', { labels: ['calls'] }),
      task(5, 'Call the bank', { labels: ['calls'], status: 'done', completed_at: '2026-10-03T09:00:00Z' }),
    ])
    store.db.smart_lists = [
      { id: L2, name: 'Calls', icon: null, filter: { labels: ['calls'], show_done: true }, position: 1, deleted_at: null },
      { id: L1, name: 'Quick work', icon: '⚡', filter: { places: [D1], length: 30, junk: 1 }, position: 0, deleted_at: null },
      { id: L3, name: 'Gone', icon: null, filter: {}, position: 2, deleted_at: '2026-10-02T09:00:00Z' },
    ]
    return store
  }
  const titles = (r: { data: Record<string, any> | null }) => r.data!.tasks.map((t: { title: string }) => t.title)

  it('smart_lists: each live list in sidebar order, its conditions in words, its open count — for a read-only key too', async () => {
    const r = await call(deps(seeded()), 'smart_lists', {}, READ_KEY)
    expect(r.data!.smart_lists).toEqual([
      { id: L1, name: 'Quick work', icon: '⚡', conditions: 'Work · ≤ 30 min', filter: { places: [D1], length: 30 }, open: 2 },
      { id: L2, name: 'Calls', conditions: 'calls · done ones too', filter: { labels: ['calls'], show_done: true }, open: 1 },
    ])
    expect((await call(deps(fakeStore()), 'smart_lists', {})).data).toEqual({ smart_lists: [] })
  })

  it('list_tasks smart_list: by name or id; a list showing done tasks brings them unless status says open', async () => {
    const store = seeded()
    const quick = await call(deps(store), 'list_tasks', { smart_list: 'QUICK work' })
    expect([titles(quick), quick.data!.smart_list]).toEqual([['Fix header', 'Own domain'], 'Quick work'])
    expect(titles(await call(deps(store), 'list_tasks', { smart_list: L2 }))).toEqual(['Call mum', 'Call the bank'])
    expect(titles(await call(deps(store), 'list_tasks', { smart_list: L2, status: 'open' }))).toEqual(['Call mum'])
    expect(titles(await call(deps(store), 'list_tasks', { smart_list: 'Quick work', limit: 1 }))).toEqual(['Fix header'])
    const gone = await call(deps(store), 'list_tasks', { smart_list: 'Gone' })
    expect([gone.isError, gone.text]).toEqual([true, expect.stringContaining('No smart list "Gone"')])
  })
})
