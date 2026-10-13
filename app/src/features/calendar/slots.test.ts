import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'

// Time Slots (Kai 2026-10-13, parity audit B2 → a; migration 0073): the pure rules (slots.ts) and the
// real calendar/api + tasks/api writes against an in-memory cache that behaves like the outbox's.
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

const { inSlot, intoSlot, slotAt, slotFill, slotTasks } = await import('./slots')
const { deleteEventWithUndo, moveOrResizeEvent, outOfSlotWithUndo, putInSlotWithUndo, resizeEvent } = await import('./api')
const { rescheduleDue } = await import('../tasks/api')
const { railBuckets } = await import('./replan')
const { expandEvents } = await import('./series')

const ZONE = 'Africa/Cairo'
const cairo = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 3, m)).toISOString()
}
const MON = '2026-10-12'
const TUE = '2026-10-13'
const NOW = new Date(cairo(MON, '08:00'))

const ev = (id: string, day: string, from: string, to: string, over: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: id, starts_at: cairo(day, from), ends_at: cairo(day, to), all_day: false, task_id: null, type: 'time_block', busy: true, deleted_at: null, ...over }) as CalendarEvent
const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: 'todo', someday: false, top3: false, due_at: cairo(MON, '09:00'), scheduled_start: null, scheduled_end: null, duration_min: 30, slot_id: null, slot_date: null, deleted_at: null, ...over }) as Task

const CODE = ev('code', MON, '10:00', '12:00', { title: 'Code block' })
// "Shaheen" every weekday at 14:00–16:00: one row, two occurrences in the window.
const SHAHEEN = ev('shaheen', MON, '14:00', '16:00', { title: 'Shaheen', recurrence_rule: 'FREQ=DAILY' })
const occ = (day: string) => expandEvents([SHAHEEN], new Date(cairo(day, '00:00')), new Date(cairo(day, '23:59')), ZONE)[0]

describe('slots: the pure rules', () => {
  it('slotAt: the Time block a drop lands in — timed, end exclusive, never an event, the dragged one skipped', () => {
    const lunch = ev('lunch', MON, '10:30', '11:00', { type: 'event' })
    const inner = ev('inner', MON, '10:30', '11:30')
    expect(slotAt([CODE, lunch], cairo(MON, '10:45'))?.id).toBe('code')
    expect(slotAt([CODE], cairo(MON, '12:00'))).toBeUndefined()
    expect(slotAt([lunch], cairo(MON, '10:45'))).toBeUndefined()
    expect(slotAt([{ ...CODE, all_day: true }], cairo(MON, '10:45'))).toBeUndefined()
    expect(slotAt([CODE, inner], cairo(MON, '10:45'))?.id).toBe('inner') // the latest-starting of two
    expect(slotAt([CODE], cairo(MON, '10:45'), 'code')).toBeUndefined()
  })

  it('assignment: a one-off slot is its own row; an occurrence names its series row and its day', () => {
    expect(intoSlot(CODE, ZONE)).toEqual({ slot_id: 'code', slot_date: MON, scheduled_start: CODE.starts_at, scheduled_end: CODE.ends_at })
    const tue = occ(TUE)
    expect(tue.seriesId).toBe('shaheen')
    expect(intoSlot(tue, ZONE)).toEqual({ slot_id: 'shaheen', slot_date: TUE, scheduled_start: cairo(TUE, '14:00'), scheduled_end: cairo(TUE, '16:00') })
  })

  it('occurrence matching: a task shows only in the occurrence it was put in', () => {
    const t = task('t', intoSlot(occ(TUE), ZONE))
    expect(inSlot(t, occ(TUE), ZONE)).toBe(true)
    expect(inSlot(t, occ(MON), ZONE)).toBe(false)
    expect(slotTasks(occ(MON), [t], ZONE)).toEqual([])
    // Replanned elsewhere by a build that never clears slot_id: not drawn in the slot it left.
    expect(inSlot({ ...t, scheduled_start: cairo(TUE, '18:00') }, occ(TUE), ZONE)).toBe(false)
    expect(inSlot({ ...t, deleted_at: cairo(MON, '08:00') }, occ(TUE), ZONE)).toBe(false)
  })

  it('a moved slot: its tasks re-stamped there are in the new place, not the old', () => {
    const t = task('t', intoSlot(CODE, ZONE))
    const moved = { ...CODE, starts_at: cairo(TUE, '09:00'), ends_at: cairo(TUE, '11:00') }
    const after = { ...t, ...intoSlot(moved, ZONE) }
    expect([after.slot_date, after.scheduled_start, after.scheduled_end]).toEqual([TUE, cairo(TUE, '09:00'), cairo(TUE, '11:00')])
    expect(inSlot(after, moved, ZONE)).toBe(true)
    expect(inSlot(after, CODE, ZONE)).toBe(false)
  })

  it('fill: "N tasks · Xm of Ym", 30 minutes for a task with no estimate', () => {
    expect(slotFill(CODE, [{ duration_min: 15 }, { duration_min: null }])).toBe('2 tasks · 45m of 2h')
    expect(slotFill(CODE, [{ duration_min: 90 }])).toBe('1 task · 1h30m of 2h')
  })
})

describe('slots: the writes', () => {
  const tasks = () => cache.get('tasks') as Task[]
  const rows = () => cache.get('calendar_events') as CalendarEvent[]
  const get = (id: string) => tasks().find((t) => t.id === id)!
  const slotOf = (id: string) => (({ slot_id, slot_date, scheduled_start, scheduled_end }) => ({ slot_id, slot_date, scheduled_start, scheduled_end }))(get(id))
  const MISSED: CalendarEvent = ev('b-a', '2026-10-11', '20:00', '20:30', { type: 'task', task_id: 'a', title: 'a' })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    cache.set('tasks', [task('a', { scheduled_start: MISSED.starts_at, scheduled_end: MISSED.ends_at }), task('b')])
    cache.set('calendar_events', [{ ...CODE }, { ...SHAHEEN }, { ...MISSED }])
    toasts.length = 0
  })

  it('a task dropped in a slot is IN it — no block of its own (its missed one comes off); Undo puts it all back', () => {
    putInSlotWithUndo(get('a'), CODE)
    expect(slotOf('a')).toEqual(intoSlot(CODE, ZONE))
    expect(rows().filter((e) => e.task_id === 'a' && !e.deleted_at)).toEqual([])
    expect(toasts.at(-1)?.message).toBe('In Code block · a')
    // Planned: out of the rail's Today/Overdue.
    const rail = railBuckets(tasks(), rows(), NOW)
    expect([...rail.overdue, ...rail.today].map((r) => r.task.id)).not.toContain('a')
    toasts.at(-1)!.undo()
    expect(slotOf('a')).toEqual({ slot_id: null, slot_date: null, scheduled_start: MISSED.starts_at, scheduled_end: MISSED.ends_at })
    expect(rows().find((e) => e.id === 'b-a')?.deleted_at).toBeNull()
  })

  it('moving or resizing the slot moves its tasks; Undo moves them back', () => {
    putInSlotWithUndo(get('b'), CODE)
    const undoMove = moveOrResizeEvent(rows().find((e) => e.id === 'code')!, cairo(TUE, '09:00'), cairo(TUE, '11:00'))
    expect(slotOf('b')).toEqual({ slot_id: 'code', slot_date: TUE, scheduled_start: cairo(TUE, '09:00'), scheduled_end: cairo(TUE, '11:00') })
    undoMove()
    expect(slotOf('b')).toEqual(intoSlot(CODE, ZONE))
    resizeEvent(rows().find((e) => e.id === 'code')!, cairo(MON, '10:00'), cairo(MON, '13:00'))
    expect(slotOf('b').scheduled_end).toBe(cairo(MON, '13:00'))
  })

  it('one occurrence of a repeating slot dragged out: its tasks go with the detached copy; the other days stay', () => {
    putInSlotWithUndo(get('a'), occ(MON))
    putInSlotWithUndo(get('b'), occ(TUE))
    const undo = moveOrResizeEvent(occ(MON), cairo(MON, '17:00'), cairo(MON, '19:00'))
    const copy = rows().find((e) => e.series_id === 'shaheen')!
    expect(slotOf('a')).toEqual({ slot_id: copy.id, slot_date: MON, scheduled_start: cairo(MON, '17:00'), scheduled_end: cairo(MON, '19:00') })
    expect(slotOf('b')).toEqual(intoSlot(occ(TUE), ZONE))
    undo()
    expect(slotOf('a')).toEqual(intoSlot(occ(MON), ZONE))
  })

  it('deleting the slot leaves its tasks unscheduled; Undo brings both back', () => {
    putInSlotWithUndo(get('b'), CODE)
    deleteEventWithUndo(rows().find((e) => e.id === 'code')!, 'Deleted')
    expect(slotOf('b')).toEqual({ slot_id: null, slot_date: null, scheduled_start: null, scheduled_end: null })
    expect(railBuckets(tasks(), rows().filter((e) => !e.deleted_at), NOW).today.map((r) => r.task.id)).toContain('b')
    toasts.at(-1)!.undo()
    expect(slotOf('b')).toEqual(intoSlot(CODE, ZONE))
    expect(rows().find((e) => e.id === 'code')?.deleted_at).toBeNull()
  })

  it('Out of the slot: back to the rail, unscheduled, with Undo', () => {
    putInSlotWithUndo(get('b'), CODE)
    outOfSlotWithUndo(get('b'))
    expect(slotOf('b')).toEqual({ slot_id: null, slot_date: null, scheduled_start: null, scheduled_end: null })
    expect(toasts.at(-1)?.message).toBe('Out of the slot · b')
    toasts.at(-1)!.undo()
    expect(slotOf('b')).toEqual(intoSlot(CODE, ZONE))
  })

  it('replanned (Plan, Tomorrow…), a task leaves its slot; the Undo puts it back in', () => {
    putInSlotWithUndo(get('b'), CODE)
    const undo = rescheduleDue(get('b'), cairo(TUE, '09:00'))
    expect(slotOf('b')).toEqual({ slot_id: null, slot_date: null, scheduled_start: null, scheduled_end: null })
    undo()
    expect(slotOf('b')).toEqual(intoSlot(CODE, ZONE))
  })
})
