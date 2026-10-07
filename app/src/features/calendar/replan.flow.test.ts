import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'

// Kai 2026-10-07 — "I planned my crypto session for 4am today and didn't see it on the calendar",
// and "an overdue task I replan stays stuck on the calendar". The real calendar/api + tasks/api
// writes against an in-memory cache that behaves like the outbox's optimistic one.
const cache = new Map<string, unknown>()
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({
  queryClient: { getQueryData: (key: string[]) => cache.get(key[0]), setQueryData: (key: string[], v: unknown) => cache.set(key[0], v) },
}))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: { id: string }, op = 'upsert') => {
    const rows = (cache.get(table) as { id: string }[] | undefined) ?? []
    cache.set(table, op === 'delete' ? rows.filter((r) => r.id !== row.id) : rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row])
  },
}))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/motion', () => ({ animateRowRemoval: (_el: unknown, run: () => void) => run() }))
const toasts: { message: string; undo: () => void }[] = []
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))

const { moveOrResizeEvent, scheduleTask, scheduleTaskWithUndo, updateEvent } = await import('./api')
const { moveToTomorrowWithUndo, rescheduleDue } = await import('../tasks/api')
const { railBuckets } = await import('./replan')
const { scrollTimeNear } = await import('./gridClock')

const cairo = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 3, m)).toISOString()
}
const TODAY = '2026-10-07'
const YESTERDAY = '2026-10-06'
const NOW = new Date(cairo(TODAY, '15:00'))

const crypto0: Task = { id: 'crypto', title: 'Crypto session', status: 'todo', someday: false, top3: false, due_at: cairo(YESTERDAY, '09:00'), scheduled_start: cairo(YESTERDAY, '20:00'), scheduled_end: cairo(YESTERDAY, '21:30'), duration_min: 90, reminder_at: null } as Task
const missed0: CalendarEvent = { id: 'b-crypto', task_id: 'crypto', title: 'Crypto session', starts_at: cairo(YESTERDAY, '20:00'), ends_at: cairo(YESTERDAY, '21:30'), all_day: false, type: 'task', busy: true, deleted_at: null } as CalendarEvent

const tasks = () => cache.get('tasks') as Task[]
const live = () => (cache.get('calendar_events') as CalendarEvent[]).filter((e) => !e.deleted_at)
const crypto = () => tasks().find((t) => t.id === 'crypto')!
const blocks = () => live().filter((e) => e.task_id === 'crypto')

/** The 4am case's whole promise: one block, at 04:00 today, on the grid; nothing left yesterday. */
function expectOnTheCalendarAt4am() {
  expect(blocks().map((e) => [e.starts_at, e.ends_at])).toEqual([[cairo(TODAY, '04:00'), cairo(TODAY, '05:30')]])
  expect(crypto().scheduled_start).toBe(cairo(TODAY, '04:00'))
  // …and it's planned now: out of the rail's Overdue (and not waiting in Today without a time).
  const rail = railBuckets(tasks(), live(), NOW)
  expect(rail.overdue.map((r) => r.task.id)).not.toContain('crypto')
  expect(rail.today.map((r) => r.task.id)).not.toContain('crypto')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  cache.set('tasks', [{ ...crypto0 }])
  cache.set('calendar_events', [{ ...missed0 }])
  toasts.length = 0
})
afterEach(() => vi.useRealTimers())

describe('the 4am regression — an overdue task replanned to 04:00 today lands on the calendar', () => {
  it('before: it sat in the rail\'s Overdue with its block stuck on yesterday', () => {
    expect(railBuckets(tasks(), live(), NOW).overdue.map((r) => r.task.id)).toEqual(['crypto'])
  })

  it('the task sheet / ⋯ Pick date… with Set time 04:00 (the picker says a time was set)', () => {
    rescheduleDue(crypto(), cairo(TODAY, '04:00'), true)
    expectOnTheCalendarAt4am()
    expect(crypto().due_at).toBe(cairo(TODAY, '04:00'))
  })

  // plan-replan: the desktop ⋯ submenu (the Plan menu's Pick date & time…) now passes the picker's
  // `timed` through, so the 09:00 fallback (setTimeOf) is gone; a picked 04:00 arrives timed.
  it('the desktop ⋯ submenu passes the picker\'s time flag: 04:00 is on the calendar', () => {
    rescheduleDue(crypto(), cairo(TODAY, '04:00'), true)
    expectOnTheCalendarAt4am()
  })

  it('the task editor\'s due time field', () => {
    rescheduleDue(crypto(), cairo(TODAY, '04:00'), true)
    expectOnTheCalendarAt4am()
  })

  it('the details panel: date → today, start → 04:00 (Save)', () => {
    updateEvent(blocks()[0], { starts_at: cairo(TODAY, '04:00'), ends_at: cairo(TODAY, '05:30') })
    expectOnTheCalendarAt4am()
    // The missed due date followed the block: it stops reading "Overdue" on Tasks and Today too.
    expect(crypto().due_at).toBe(cairo(TODAY, '04:00'))
  })

  it('a drag on the grid, and a drop from the rail onto 04:00 — the old block moves, never a second one', () => {
    moveOrResizeEvent(blocks()[0], cairo(TODAY, '04:00'), cairo(TODAY, '05:30'))
    expectOnTheCalendarAt4am()
    cache.set('tasks', [{ ...crypto0 }])
    cache.set('calendar_events', [{ ...missed0 }])
    scheduleTask(crypto(), cairo(TODAY, '04:00'), cairo(TODAY, '05:30'))
    expectOnTheCalendarAt4am()
  })

  it('a task with no block yet: a time puts it on the calendar (Akiflow\'s rule)', () => {
    cache.set('tasks', [{ ...crypto0, scheduled_start: null, scheduled_end: null }])
    cache.set('calendar_events', [])
    rescheduleDue(crypto(), cairo(TODAY, '04:00'), true)
    expectOnTheCalendarAt4am()
  })

  it('and a Plan scrolls the grid to it (CalendarGrid gotoDate): two hours above 04:00, not the afternoon', () => {
    expect(scrollTimeNear(new Date(2026, 9, 7, 4, 0))).toBe('02:00:00')
  })
})

describe('replanning an overdue task moves or clears its block — never a stale one, never a duplicate', () => {
  it('Tomorrow (a date alone): the stuck block comes off; the task waits in tomorrow\'s list; Undo puts both back', () => {
    moveToTomorrowWithUndo([crypto()])
    expect(blocks()).toEqual([])
    expect(crypto().scheduled_start).toBeNull()
    expect(crypto().due_at).toBe(cairo('2026-10-08', '09:00'))
    toasts.at(-1)!.undo()
    expect(blocks().map((e) => e.starts_at)).toEqual([cairo(YESTERDAY, '20:00')])
    expect(crypto()).toMatchObject({ due_at: crypto0.due_at, scheduled_start: crypto0.scheduled_start })
  })

  it('No date: the block comes off', () => {
    rescheduleDue(crypto(), null)
    expect(blocks()).toEqual([])
  })

  it('a timed replan\'s Undo puts the block back where it was, and the due date', () => {
    const undo = rescheduleDue(crypto(), cairo(TODAY, '04:00'), true)
    undo()
    expect(blocks().map((e) => e.starts_at)).toEqual([cairo(YESTERDAY, '20:00')])
    expect(crypto()).toMatchObject({ due_at: crypto0.due_at, scheduled_start: crypto0.scheduled_start })
  })

  it('Plan ▸ Next free slot / a rail drop with Undo: one block moved, and Undo is exact', () => {
    scheduleTaskWithUndo(crypto(), cairo(TODAY, '16:00'), cairo(TODAY, '17:30'))
    expect(blocks().map((e) => [e.id, e.starts_at])).toEqual([['b-crypto', cairo(TODAY, '16:00')]])
    expect(toasts.at(-1)!.message).toBe('Scheduled · Crypto session')
    toasts.at(-1)!.undo()
    expect(blocks().map((e) => e.starts_at)).toEqual([cairo(YESTERDAY, '20:00')])
    expect(crypto()).toMatchObject({ due_at: crypto0.due_at, scheduled_start: crypto0.scheduled_start })
  })

  it('a duplicate left by the old behaviour is cleaned up by the next placement', () => {
    cache.set('calendar_events', [{ ...missed0 }, { ...missed0, id: 'b-dupe', starts_at: cairo('2026-10-05', '20:00'), ends_at: cairo('2026-10-05', '21:30') }])
    scheduleTask(crypto(), cairo(TODAY, '16:00'), cairo(TODAY, '17:30'))
    expect(blocks().map((e) => e.id)).toEqual(['b-crypto'])
  })
})
