import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../lib/types'

// The plan writes (Kai 2026-10-07). Where a replanned task's blocks go is calendar-rail's rule
// (calendar/replan.ts, tested in replan.test.ts / replan.flow.test.ts); here: the Plan menu's
// writes hand it the right `timed`, Undo takes everything back, and Make goal / Move up–down rank
// the Top 3 on the rows. An in-memory cache stands in for TanStack + the outbox (writeRow's
// optimistic update), so each write is seen by the next, as in the app.
const cache: { tasks: Task[] } = { tasks: [] }
function writeRow(_table: 'tasks', row: Task) {
  const i = cache.tasks.findIndex((r) => r.id === row.id)
  if (i >= 0) cache.tasks[i] = row
  else cache.tasks.push(row)
}
const toasts: { message: string; undo?: () => void; action?: () => void }[] = []
const replans: { id: string; dueAt: string | null; timed: boolean; undone: boolean }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: ([k]: ['tasks']) => cache[k], getQueriesData: () => [] } }))
vi.mock('../../lib/outbox', () => ({ writeRow }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/undo', () => ({
  toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }),
  toastAction: (message: string, _label: string, action: () => void) => toasts.push({ message, action }),
}))
vi.mock('../calendar/api', () => ({
  deleteEventsForTask: vi.fn(),
  restoreEventsForTask: vi.fn(),
  replanTaskBlocks: (task: Task, dueAt: string | null, timed: boolean) => {
    const r = { id: task.id, dueAt, timed, undone: false }
    replans.push(r)
    return () => void (r.undone = true)
  },
}))
const { currentTop3, makeGoalWithUndo, moveInTop3Order, planWithUndo, spreadWithUndo } = await import('./api')
const { scheduleTomorrow } = await import('../../lib/dateShortcuts')
const { cairoToIso } = await import('../calendar/eventTime')

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: 'todo', top3: false, top3_rank: null, someday: false, due_at: null, scheduled_start: null, scheduled_end: null, reminder_at: null, reminder_sent: false, completed_at: null, deleted_at: null, ...over }) as Task
const T = (id: string) => cache.tasks.find((t) => t.id === id)!

beforeEach(() => {
  toasts.length = 0
  replans.length = 0
})

describe('planWithUndo — a Plan pick for one task or a selection', () => {
  it('a date alone is date-only for the blocks; Pick date & time with a time is timed; one Undo puts the dates back', () => {
    cache.tasks = [task('a', { due_at: '2026-10-05T06:00:00.000Z', someday: true }), task('b')]
    planWithUndo([T('a'), T('b')], '2026-10-08T06:00:00.000Z', '2 tasks planned')
    expect(replans.map((r) => [r.id, r.timed])).toEqual([['a', false], ['b', false]])
    expect(T('a')).toMatchObject({ due_at: '2026-10-08T06:00:00.000Z', someday: false })
    planWithUndo([T('b')], '2026-10-08T12:30:00.000Z', 'Planned', true)
    expect(replans.at(-1)).toMatchObject({ id: 'b', timed: true })
    toasts[0].undo!()
    expect(replans.slice(0, 2).every((r) => r.undone)).toBe(true)
    expect(T('a')).toMatchObject({ due_at: '2026-10-05T06:00:00.000Z', someday: true })
  })
})

describe('spreadWithUndo — Replan all → Spread into free slots', () => {
  it('a placed task is a timed replan at its slot (its block moves there); the rest go to tomorrow, first thing, date-only', () => {
    cache.tasks = [task('a'), task('b'), task('c')]
    spreadWithUndo([
      { task: T('a'), slot: { day: '2026-10-07', start: 600 }, dur: 30 },
      { task: T('b'), slot: { day: '2026-10-07', start: 630 }, dur: 60 },
      { task: T('c'), slot: null, dur: 120 },
    ])
    expect(replans.map((r) => [r.id, r.dueAt, r.timed])).toEqual([
      ['a', cairoToIso('2026-10-07', '10:00'), true],
      ['b', cairoToIso('2026-10-07', '10:30'), true],
      ['c', scheduleTomorrow(), false],
    ])
    expect(toasts.at(-1)?.message).toBe('3 replanned · 2 today, 1 tomorrow')
    toasts.at(-1)!.undo!()
    expect(replans.every((r) => r.undone)).toBe(true)
    expect(T('c').due_at).toBeNull()
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
