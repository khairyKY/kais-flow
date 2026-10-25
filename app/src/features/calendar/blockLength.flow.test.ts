import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'

// bugs-1023 (Kai 2026-10-23): every place a length or a time changes, through the real calendar/api +
// tasks/api writes, against an in-memory cache that behaves like the outbox's optimistic one
// (replan.flow.test's harness). One rule for all of them (_shared/blockLength.ts):
// a new length moves the end · a new end / a resize is a new length · a move keeps the length ·
// a task's duration_min, scheduled times and block stay in step.
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

const { moveOrResizeEvent, moveEventWithUndo, placeTask, resizeEvent, retimeEventWithUndo, updateEvent } = await import('./api')
const { editWithUndo, rescheduleDue, setDuration } = await import('../tasks/api')
const { eventSpan } = await import('./phoneGridMath')

const at = (hhmm: string, day = 23) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m)).toISOString()
}
const NOW = new Date(at('12:00'))

// "Pre workout": 15 minutes at 17:15, due at 17:15 (a task given a time is on the calendar).
const task0 = { id: 't', title: 'Pre workout', status: 'todo', someday: false, top3: false, due_at: at('17:15'), scheduled_start: at('17:15'), scheduled_end: at('17:30'), duration_min: 15, slot_id: null, reminder_at: null } as Task
const block0 = { id: 'b', task_id: 't', title: 'Pre workout', starts_at: at('17:15'), ends_at: at('17:30'), all_day: false, type: 'task', busy: true, deleted_at: null } as CalendarEvent
// A Time slot holding one task with its own 20-minute estimate.
const slot0 = { id: 's', task_id: null, title: 'Gym', starts_at: at('18:00'), ends_at: at('19:00'), all_day: false, type: 'time_block', busy: true, deleted_at: null } as CalendarEvent
const held0 = { id: 'h', title: 'Stretch', status: 'todo', someday: false, top3: false, due_at: null, scheduled_start: at('18:00'), scheduled_end: at('19:00'), slot_id: 's', slot_date: '2026-10-23', duration_min: 20, reminder_at: null } as Task

const task = () => (cache.get('tasks') as Task[]).find((t) => t.id === 't')!
const held = () => (cache.get('tasks') as Task[]).find((t) => t.id === 'h')!
const rows = () => (cache.get('calendar_events') as CalendarEvent[]).filter((e) => !e.deleted_at)
const block = () => rows().find((e) => e.task_id === 't')!
const slot = () => rows().find((e) => e.id === 's')!
const span = () => [block().starts_at, block().ends_at]
/** The promise: the block, the task's schedule and its estimate say the same thing. */
function inStep(from: string, to: string, minutes: number) {
  expect(span()).toEqual([at(from), at(to)])
  expect([task().scheduled_start, task().scheduled_end]).toEqual([at(from), at(to)])
  expect(task().duration_min).toBe(minutes)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  cache.set('tasks', [{ ...task0 }, { ...held0 }])
  cache.set('calendar_events', [{ ...block0 }, { ...slot0 }])
  toasts.length = 0
})
afterEach(() => vi.useRealTimers())

describe('a new length moves the end, keeping the start', () => {
  it('the task sheet / popover / editor Duration chip stretches the block (it used to change only the number)', () => {
    editWithUndo([task()], 'Duration · 1h', (t) => setDuration(t, 60))
    inStep('17:15', '18:15', 60)
    toasts.at(-1)!.undo()
    inStep('17:15', '17:30', 15)
  })
  it('the block popover’s / phone sheet’s length row (retime, same start)', () => {
    retimeEventWithUndo(block(), eventSpan(block()), { ...eventSpan(block()), end: eventSpan(block()).start + 45 })
    inStep('17:15', '18:00', 45)
  })
  it('the task sheet’s length chips under its card (a bottom resize)', () => {
    moveEventWithUndo(block(), eventSpan(block()), { ...eventSpan(block()), end: eventSpan(block()).start + 30 }, 'bottom')
    inStep('17:15', '17:45', 30)
  })
  it('Duration “None” leaves the block as it is', () => {
    setDuration(task(), null)
    expect(span()).toEqual([at('17:15'), at('17:30')])
  })
})

describe('a new end, or a resize, is a new length', () => {
  it('a bottom-edge resize (desktop and phone)', () => {
    resizeEvent(block(), at('17:15'), at('18:45'))
    inStep('17:15', '18:45', 90)
  })
  it('a top-edge resize: the due time that was the block’s start moves with it', () => {
    const undo = resizeEvent(block(), at('17:00'), at('17:30'))
    inStep('17:00', '17:30', 30)
    expect(task().due_at).toBe(at('17:00'))
    undo()
    inStep('17:15', '17:30', 15)
    expect(task().due_at).toBe(at('17:15'))
  })
  it('the block’s own end field (updateEvent)', () => {
    updateEvent(block(), { ends_at: at('18:00') })
    inStep('17:15', '18:00', 45)
  })
  it('the Time sheet: a new start and a new length at once', () => {
    retimeEventWithUndo(block(), eventSpan(block()), { ...eventSpan(block()), start: 16 * 60, end: 17 * 60 })
    inStep('16:00', '17:00', 60)
    expect(task().due_at).toBe(at('16:00'))
  })
})

describe('a move keeps the length', () => {
  it('a drag (desktop) — the due time follows the block, so the date chip and the block agree', () => {
    const undo = moveOrResizeEvent(block(), at('19:00'), at('19:15'))
    inStep('19:00', '19:15', 15)
    expect(task().due_at).toBe(at('19:00'))
    undo()
    inStep('17:15', '17:30', 15)
    expect(task().due_at).toBe(at('17:15'))
  })
  it('a drag on the phone', () => {
    const s = eventSpan(block())
    moveEventWithUndo(block(), s, { ...s, start: s.start + 60, end: s.end + 60 }, 'move')
    inStep('18:15', '18:30', 15)
  })
  it('a replan to a new time (the task sheet’s date, the editor, ⋯ Pick date & time)', () => {
    rescheduleDue(task(), at('20:00'), true)
    inStep('20:00', '20:15', 15)
  })
  it('an all-day drop keeps the estimate', () => {
    moveOrResizeEvent(block(), '2026-10-23T00:00:00.000Z', '2026-10-24T00:00:00.000Z', true)
    expect(task().duration_min).toBe(15)
  })
})

describe('Plan / Next free slot / Spread — placing a task', () => {
  it('a block placed at a length is the estimate', () => {
    placeTask(task(), at('21:00'), at('21:45'))
    inStep('21:00', '21:45', 45)
  })
  it('a task with no estimate gets the block’s 30 minutes', () => {
    cache.set('tasks', [{ ...task0, duration_min: null, scheduled_start: null, scheduled_end: null }, { ...held0 }])
    cache.set('calendar_events', [{ ...slot0 }])
    placeTask(task(), at('21:00'), at('21:30'))
    inStep('21:00', '21:30', 30)
  })
})

describe('a Time slot: its length is its times; the tasks it holds keep their own estimates', () => {
  it('resized, it holds its task at its new times and the task’s 20 minutes stay', () => {
    resizeEvent(slot(), at('18:00'), at('20:00'))
    expect([slot().starts_at, slot().ends_at]).toEqual([at('18:00'), at('20:00')])
    expect([held().scheduled_start, held().scheduled_end, held().duration_min]).toEqual([at('18:00'), at('20:00'), 20])
  })
  it('moved, the same', () => {
    moveOrResizeEvent(slot(), at('07:00'), at('08:00'))
    expect([held().scheduled_start, held().duration_min]).toEqual([at('07:00'), 20])
  })
})
