import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'

// The plan writes (Kai 2026-10-07): replanning never leaves a block stuck in the past, a free slot
// moves the block the task already has, Undo puts it all back; Make goal / Move up–down rank the
// Top 3 on the rows. An in-memory cache stands in for TanStack + the outbox (writeRow's optimistic
// update), so each write is seen by the next, as in the app.
const cache: { tasks: Task[]; calendar_events: CalendarEvent[] | undefined } = { tasks: [], calendar_events: [] }
const writes: { table: string; row: Record<string, unknown> }[] = []
function writeRow(table: 'tasks' | 'calendar_events', row: { id: string; [k: string]: any }) {
  writes.push({ table, row })
  const list = cache[table] as { id: string }[] | undefined
  if (!list) return
  const i = list.findIndex((r) => r.id === row.id)
  if (i >= 0) list[i] = row
  else list.push(row)
}
const toasts: { message: string; undo?: () => void; action?: () => void }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: ([k]: [keyof typeof cache]) => cache[k], getQueriesData: () => [] } }))
vi.mock('../../lib/outbox', () => ({ writeRow }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/undo', () => ({
  toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }),
  toastAction: (message: string, _label: string, action: () => void) => toasts.push({ message, action }),
}))
vi.mock('../calendar/api', () => ({
  deleteEventsForTask: vi.fn(),
  restoreEventsForTask: vi.fn(),
  scheduleTask: (task: Task, starts_at: string, ends_at: string) => {
    const ev = { id: 'new-block', task_id: task.id, title: task.title, starts_at, ends_at, all_day: false, deleted_at: null } as unknown as CalendarEvent
    writeRow('calendar_events', ev)
    writeRow('tasks', { ...cache.tasks.find((t) => t.id === task.id)!, scheduled_start: starts_at, scheduled_end: ends_at })
    return ev
  },
  moveOrResizeEvent: (ev: CalendarEvent, starts_at: string, ends_at: string) => {
    writeRow('calendar_events', { ...ev, starts_at, ends_at })
    writeRow('tasks', { ...cache.tasks.find((t) => t.id === ev.task_id)!, scheduled_start: starts_at, scheduled_end: ends_at })
  },
}))
const { currentTop3, makeGoalWithUndo, moveInTop3Order, planSlot, rescheduleDue, restorePlan } = await import('./api')

const H = 3_600_000
const NOW = Date.now()
const iso = (offsetH: number) => new Date(NOW + offsetH * H).toISOString()
const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: 'todo', top3: false, top3_rank: null, someday: false, due_at: null, scheduled_start: null, scheduled_end: null, reminder_at: null, reminder_sent: false, completed_at: null, deleted_at: null, ...over }) as Task
const block = (id: string, taskId: string, fromH: number, toH: number): CalendarEvent =>
  ({ id, task_id: taskId, title: taskId, starts_at: iso(fromH), ends_at: iso(toH), all_day: false, deleted_at: null }) as unknown as CalendarEvent
const T = (id: string) => cache.tasks.find((t) => t.id === id)!
const E = (id: string) => cache.calendar_events!.find((e) => e.id === id)!

beforeEach(() => {
  writes.length = 0
  toasts.length = 0
})

describe('rescheduleDue — replanning takes a block that is already over off the calendar', () => {
  it('an overdue task with yesterday’s block, planned for a day: the block goes, the task is unscheduled', () => {
    cache.tasks = [task('t', { due_at: iso(-30), scheduled_start: iso(-30), scheduled_end: iso(-29) })]
    cache.calendar_events = [block('b', 't', -30, -29)]
    const u = rescheduleDue(T('t'), iso(20))
    expect(E('b').deleted_at).toBeTruthy()
    expect(T('t')).toMatchObject({ due_at: iso(20), scheduled_start: null, scheduled_end: null })
    restorePlan(u)
    expect(E('b').deleted_at).toBeNull()
    expect(T('t')).toMatchObject({ due_at: iso(-30), scheduled_start: iso(-30), scheduled_end: iso(-29) })
  })
  it('a block still ahead stays, and the task keeps pointing at it', () => {
    cache.tasks = [task('t', { due_at: iso(-30), scheduled_start: iso(-30), scheduled_end: iso(-29) })]
    cache.calendar_events = [block('old', 't', -30, -29), block('next', 't', 5, 6)]
    rescheduleDue(T('t'), iso(20))
    expect(E('old').deleted_at).toBeTruthy()
    expect(E('next').deleted_at).toBeNull()
    expect(T('t')).toMatchObject({ scheduled_start: iso(5), scheduled_end: iso(6) })
  })
  it('no blocks: just the due (and a real date clears Someday)', () => {
    cache.tasks = [task('t', { someday: true })]
    cache.calendar_events = []
    rescheduleDue(T('t'), iso(20))
    expect(T('t')).toMatchObject({ due_at: iso(20), someday: false, scheduled_start: null })
    expect(writes.filter((w) => w.table === 'calendar_events')).toHaveLength(0)
  })
  it('the calendar not loaded yet: the schedule is left as it is (nothing to check it against)', () => {
    cache.tasks = [task('t', { scheduled_start: iso(-30), scheduled_end: iso(-29) })]
    cache.calendar_events = undefined
    rescheduleDue(T('t'), iso(20))
    expect(T('t')).toMatchObject({ due_at: iso(20), scheduled_start: iso(-30) })
    cache.calendar_events = []
  })
})

describe('planSlot — Next free slot’s Confirm', () => {
  it('moves the stuck block into the slot (no second block), the task due then', () => {
    cache.tasks = [task('t', { due_at: iso(-30), scheduled_start: iso(-30), scheduled_end: iso(-29) })]
    cache.calendar_events = [block('b', 't', -30, -29)]
    const u = planSlot(T('t'), iso(3), iso(3.5))
    expect(cache.calendar_events.filter((e) => !e.deleted_at)).toHaveLength(1)
    expect(E('b')).toMatchObject({ starts_at: iso(3), ends_at: iso(3.5) })
    expect(T('t')).toMatchObject({ due_at: iso(3), scheduled_start: iso(3), scheduled_end: iso(3.5), someday: false })
    restorePlan(u)
    expect(E('b')).toMatchObject({ starts_at: iso(-30), ends_at: iso(-29) })
    expect(T('t')).toMatchObject({ due_at: iso(-30), scheduled_start: iso(-30) })
  })
  it('no block yet: places one; Undo takes it off', () => {
    cache.tasks = [task('t')]
    cache.calendar_events = []
    const u = planSlot(T('t'), iso(3), iso(3.5))
    expect(E('new-block')).toMatchObject({ starts_at: iso(3), task_id: 't' })
    expect(T('t')).toMatchObject({ due_at: iso(3), scheduled_start: iso(3) })
    restorePlan(u)
    expect(E('new-block').deleted_at).toBeTruthy()
    expect(T('t')).toMatchObject({ due_at: null, scheduled_start: null })
  })
  it('two blocks: the earliest moves, another already over goes', () => {
    cache.tasks = [task('t')]
    cache.calendar_events = [block('a', 't', -50, -49), block('b', 't', -30, -29)]
    planSlot(T('t'), iso(3), iso(4))
    expect(E('a')).toMatchObject({ starts_at: iso(3), deleted_at: null })
    expect(E('b').deleted_at).toBeTruthy()
  })
})

describe('Make goal of the day / Move up–down — the Top 3’s order on the rows (top3_rank)', () => {
  const rank = (id: string) => T(id).top3_rank
  it('a pick becomes the goal: first place, the rest after it, with Undo', () => {
    cache.tasks = [task('g', { top3: true }), task('a', { top3: true }), task('b', { top3: true })]
    expect(currentTop3().map((t) => t.id)).toEqual(['g', 'a', 'b']) // nothing ranked: Today's order
    makeGoalWithUndo(T('b'))
    expect([rank('b'), rank('g'), rank('a')]).toEqual([1, 2, 3])
    expect(currentTop3()[0].id).toBe('b')
    expect(toasts.at(-1)?.message).toBe('Goal of the day')
    toasts.at(-1)!.undo!()
    expect([rank('g'), rank('a'), rank('b')]).toEqual([null, null, null])
  })
  it('a task outside a full Top 3 asks first (the swap), then the last pick makes room', () => {
    cache.tasks = [task('g', { top3: true, top3_rank: 1 }), task('a', { top3: true, top3_rank: 2 }), task('b', { top3: true, top3_rank: 3 }), task('x', { someday: true })]
    makeGoalWithUndo(T('x'))
    expect(T('x').top3).toBe(false) // nothing yet — the toast asks
    expect(toasts.at(-1)?.message).toMatch(/Top 3 is full — swap out “b”/)
    toasts.at(-1)!.action!()
    expect(T('x')).toMatchObject({ top3: true, top3_rank: 1, someday: false })
    expect(T('b')).toMatchObject({ top3: false, top3_rank: null })
    expect([rank('g'), rank('a')]).toEqual([2, 3])
    toasts.at(-1)!.undo!()
    expect(T('x')).toMatchObject({ top3: false, someday: true })
    expect(T('b')).toMatchObject({ top3: true, top3_rank: 3 })
    expect(rank('g')).toBe(1)
  })
  it('Move down / up; up into first place is a new goal (with its Undo)', () => {
    cache.tasks = [task('g', { top3: true, top3_rank: 1 }), task('a', { top3: true, top3_rank: 2 }), task('b', { top3: true, top3_rank: 3 })]
    expect(moveInTop3Order(T('a'), 2)).toBe(true)
    expect(currentTop3().map((t) => t.id)).toEqual(['g', 'b', 'a'])
    expect(moveInTop3Order(T('a'), 3)).toBe(false) // already last
    expect(moveInTop3Order(T('b'), 0)).toBe(true)
    expect(currentTop3().map((t) => t.id)).toEqual(['b', 'g', 'a'])
    expect(toasts.at(-1)?.message).toBe('Goal of the day')
  })
})
