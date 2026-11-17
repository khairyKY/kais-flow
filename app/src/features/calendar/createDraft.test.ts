import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'
import type { DraftKind, DraftSpan } from './createDraft'

// Add to the calendar, type in place (Kai 2026-11-16): the draft's state machine. A tap or a drag opens it, Enter
// saves, Esc discards, a press elsewhere saves a titled draft and drops an empty one, and the title names the
// kind, all against the real calendar and task writes on an in-memory outbox.
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
vi.mock('../projects/autoProject', () => ({ offerProject: vi.fn() }))
const toasts: { message: string; undo: () => void }[] = []
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))

const d = await import('./createDraft')
const { setAppZone } = await import('../../lib/appZone')

const ctx = { domains: [], projects: [] }
// Mon 16 Nov 2026, 10:00 Cairo (UTC+2) and the hour a tap makes from there
const START = '2026-11-16T08:00:00.000Z'
const HOUR_END = '2026-11-16T09:00:00.000Z'
const events = () => ((cache.get('calendar_events') as CalendarEvent[] | undefined) ?? []).filter((e) => !e.deleted_at)
const tasks = () => (cache.get('tasks') as Task[] | undefined) ?? []
const type = (text: string) => d.useDraft.getState().setText(text)
const open = (span: DraftSpan, kind: DraftKind = 'event') => d.useDraft.getState().open({ ...span, kind })

beforeEach(() => {
  setAppZone('Africa/Cairo')
  cache.clear()
  cache.set('calendar_events', [])
  cache.set('tasks', [])
  toasts.length = 0
  d.useDraft.getState().close()
})

describe('what opens a draft', () => {
  it('a tap is an hour from where it landed', () => {
    expect(d.tapSpan(START)).toEqual({ start: START, end: HOUR_END, allDay: false })
  })

  it('a drag keeps what was dragged: a quarter stays a quarter', () => {
    open({ start: START, end: '2026-11-16T08:15:00.000Z', allDay: false })
    type('Quick call')
    expect(d.finishDraft('enter', ctx)).toBe(true)
    expect(events()[0]).toMatchObject({ title: 'Quick call', starts_at: START, ends_at: '2026-11-16T08:15:00.000Z' })
  })
})

describe('Enter, Esc, and a press elsewhere', () => {
  it('Enter saves an event there and closes the draft, with one Undo', () => {
    open(d.tapSpan(START))
    type('Dinner with family')
    expect(d.finishDraft('enter', ctx)).toBe(true)
    expect(d.useDraft.getState().draft).toBeNull()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ title: 'Dinner with family', type: 'event', starts_at: START, ends_at: HOUR_END, all_day: false, color: null })
    expect(toasts.map((t) => t.message)).toEqual(['Added · Dinner with family'])
    toasts[0].undo()
    expect(events()).toHaveLength(0)
  })

  it('Enter on an empty title waits: the draft stays and nothing is written', () => {
    open(d.tapSpan(START))
    expect(d.finishDraft('enter', ctx)).toBe(false)
    type('   ')
    expect(d.finishDraft('enter', ctx)).toBe(false)
    expect(d.useDraft.getState().draft).not.toBeNull()
    expect(events()).toHaveLength(0)
  })

  it('Esc discards, typed or not', () => {
    open(d.tapSpan(START))
    type('Never mind')
    expect(d.finishDraft('escape', ctx)).toBe(true)
    expect(d.useDraft.getState().draft).toBeNull()
    expect(events()).toHaveLength(0)
    open(d.tapSpan(START))
    expect(d.finishDraft('escape', ctx)).toBe(true)
    expect(events()).toHaveLength(0)
    expect(toasts).toHaveLength(0)
  })

  it('a press outside an empty draft discards it', () => {
    open(d.tapSpan(START))
    expect(d.finishDraft('outside', ctx)).toBe(true)
    expect(d.useDraft.getState().draft).toBeNull()
    expect(events()).toHaveLength(0)
  })

  it('a press outside a titled draft saves it', () => {
    open(d.tapSpan(START))
    type('Gym')
    expect(d.finishDraft('outside', ctx)).toBe(true)
    expect(events().map((e) => e.title)).toEqual(['Gym'])
  })

  it('nothing open, nothing to settle', () => {
    expect(d.finishDraft('outside', ctx)).toBe(false)
    expect(d.finishDraft('enter', ctx)).toBe(false)
  })

  it('a second settle after the first does nothing (no double save)', () => {
    open(d.tapSpan(START))
    type('Once')
    d.finishDraft('enter', ctx)
    d.finishDraft('outside', ctx)
    expect(events()).toHaveLength(1)
  })

  it('the press that closed a draft is swallowed once, so it never opens the next', () => {
    d.markOutsidePress(1000)
    expect(d.takeOutsidePress(1200)).toBe(true)
    expect(d.takeOutsidePress(1300)).toBe(false)
    d.markOutsidePress(1000)
    expect(d.takeOutsidePress(2500)).toBe(false) // a press long gone
  })
})

describe('the title names the kind', () => {
  it('an event unless it says otherwise', () => {
    expect(d.readTitle('Study Crypto')).toEqual({ kind: 'event', text: 'Study Crypto' })
    expect(d.readTitle('Task force sync')).toEqual({ kind: 'event', text: 'Task force sync' })
    expect(d.readTitle('T-shirt order')).toEqual({ kind: 'event', text: 'T-shirt order' })
  })

  it('a trailing "task" or a leading "t " makes a task; a trailing "block" a Time block', () => {
    expect(d.readTitle('Study Crypto task')).toEqual({ kind: 'task', text: 'Study Crypto' })
    expect(d.readTitle('t Buy milk')).toEqual({ kind: 'task', text: 'Buy milk' })
    expect(d.readTitle('T Buy milk')).toEqual({ kind: 'task', text: 'Buy milk' })
    expect(d.readTitle('Deep work block')).toEqual({ kind: 'block', text: 'Deep work' })
  })

  it('a marker with nothing else is no title', () => {
    expect(d.readTitle('t ')).toEqual({ kind: 'event', text: 't' })
    expect(d.settle(d.readTitle('Study Crypto task').text, 'enter')).toBe('save')
  })

  it('a preset kind (a right-click, a ⌘-click) holds when the title is silent', () => {
    expect(d.readTitle('Plan', 'task')).toEqual({ kind: 'task', text: 'Plan' })
    expect(d.readTitle('Plan', 'block')).toEqual({ kind: 'block', text: 'Plan' })
  })

  it('"Study Crypto task" saves a task on the slot, due and blocked there, the marker off its title', () => {
    open(d.tapSpan(START))
    type('Study Crypto task')
    d.finishDraft('enter', ctx)
    expect(events().filter((e) => e.type === 'event')).toHaveLength(0)
    expect(tasks()).toHaveLength(1)
    expect(tasks()[0]).toMatchObject({ title: 'Study Crypto', due_at: START, duration_min: 60 })
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ task_id: tasks()[0].id, starts_at: START, ends_at: HOUR_END })
  })

  it('a task takes the quick parse (priority, label) but the slot, not a typed time, places it', () => {
    open(d.tapSpan(START))
    type('t Call Omar !! *calls tomorrow 3pm')
    d.finishDraft('enter', ctx)
    expect(tasks()[0]).toMatchObject({ title: 'Call Omar', priority: 2, labels: ['calls'], due_at: START })
    expect(events()[0]).toMatchObject({ task_id: tasks()[0].id, starts_at: START })
  })

  it('a Time block when the title ends in "block"', () => {
    open(d.tapSpan(START))
    type('Deep work block')
    d.finishDraft('enter', ctx)
    expect(events()[0]).toMatchObject({ title: 'Deep work', type: 'time_block', task_id: null })
  })

  it('an all-day drag saves an all-day event over its days', () => {
    open({ start: '2026-11-16', end: '2026-11-18', allDay: true })
    type('Trip')
    d.finishDraft('enter', ctx)
    expect(events()[0]).toMatchObject({ title: 'Trip', all_day: true, starts_at: '2026-11-16T00:00:00.000Z', ends_at: '2026-11-18T00:00:00.000Z' })
  })
})
