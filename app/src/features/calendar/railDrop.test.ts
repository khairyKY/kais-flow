import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Area, CalendarEvent, InboxItem, Project, Task } from '../../lib/types'

// Kai 2026-10-12 — "I wanted to drag an event from the calendar into the left side — Overdue /
// Inbox / Today. It didn't accept any of them and wiggled." The decision table, then the real
// inbox/api + calendar/api + tasks/api writes against an in-memory optimistic cache.
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

const { railDropAction, scopeTarget, eventMinutes } = await import('./railDrop')
const { eventToRail } = await import('../inbox/api')
const { railBuckets } = await import('./replan')

const cairo = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 3, m)).toISOString()
}
const TODAY = '2026-10-12'
const NOW = new Date(cairo(TODAY, '15:00'))

const meeting0 = { id: 'ev', task_id: null, title: 'Call Sam', starts_at: cairo(TODAY, '16:00'), ends_at: cairo(TODAY, '16:45'), all_day: false, type: 'event', busy: true, color: '#B5654A', deleted_at: null } as CalendarEvent
const write0 = { id: 'write', title: 'Write', status: 'todo', someday: false, top3: false, due_at: cairo('2026-10-14', '09:00'), scheduled_start: cairo(TODAY, '17:00'), scheduled_end: cairo(TODAY, '18:00'), duration_min: 60, reminder_at: null, project_id: null, area_id: null, domain_id: null } as Task
const block0 = { ...meeting0, id: 'b-write', task_id: 'write', title: 'Write', type: 'task', starts_at: cairo(TODAY, '17:00'), ends_at: cairo(TODAY, '18:00'), color: null } as CalendarEvent

const events = () => cache.get('calendar_events') as CalendarEvent[]
const live = () => events().filter((e) => !e.deleted_at)
const tasks = () => (cache.get('tasks') as Task[] | undefined) ?? []
const inbox = () => (cache.get('inbox_items') as InboxItem[] | undefined) ?? []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  cache.clear()
  cache.set('tasks', [{ ...write0 }])
  cache.set('calendar_events', [{ ...meeting0 }, { ...block0 }])
  cache.set('inbox_items', [])
  toasts.length = 0
})
afterEach(() => vi.useRealTimers())

describe('railDropAction — section × kind', () => {
  it('Overdue is a computed bucket: it never takes anything', () => {
    expect(railDropAction('overdue', true)).toBe('soft-no')
    expect(railDropAction('overdue', false)).toBe('soft-no')
  })
  it('a task block comes off the calendar anywhere else; onto Today it is also due today', () => {
    expect(railDropAction('inbox', true)).toBe('unschedule')
    expect(railDropAction('lists', true)).toBe('unschedule')
    expect(railDropAction(null, true)).toBe('unschedule')
    expect(railDropAction('today', true)).toBe('unschedule-today')
  })
  it('a plain event turns into what the section holds; off any section it is still the soft-no', () => {
    expect(railDropAction('inbox', false)).toBe('to-inbox')
    expect(railDropAction('today', false)).toBe('to-today')
    expect(railDropAction('lists', false)).toBe('to-list')
    expect(railDropAction(null, false)).toBe('soft-no')
    expect(railDropAction('elsewhere', false)).toBe('soft-no')
  })
})

describe('scopeTarget / eventMinutes', () => {
  const projects = [{ id: 'p1', name: 'Site', domain_id: 'd1' }] as Project[]
  const areas = [{ id: 'a1', name: 'Health', domain_id: 'd2' }] as Area[]
  it('a project or area scope brings its domain; a smart list is no place', () => {
    expect(scopeTarget({ kind: 'project', id: 'p1' }, projects, areas)).toMatchObject({ kind: 'project', id: 'p1', domainId: 'd1' })
    expect(scopeTarget({ kind: 'area', id: 'a1' }, projects, areas)).toMatchObject({ kind: 'area', id: 'a1', domainId: 'd2' })
    expect(scopeTarget({ kind: 'domain', id: 'd3' }, projects, areas)).toMatchObject({ kind: 'domain', id: 'd3' })
    expect(scopeTarget({ kind: 'smart', id: 'week' }, projects, areas).kind).toBe('none')
    expect(scopeTarget({ kind: 'project', id: 'gone' }, projects, areas).kind).toBe('none')
  })
  it('an event\'s length is its estimate; all-day has none', () => {
    expect(eventMinutes(meeting0)).toBe(45)
    expect(eventMinutes({ ...meeting0, all_day: true })).toBeNull()
  })
})

describe('eventToRail — the writes, and one Undo for all of them', () => {
  it('Overdue: nothing is written', () => {
    expect(eventToRail(meeting0, 'soft-no')).toBe(false)
    expect(live()).toHaveLength(2)
    expect(toasts).toHaveLength(0)
  })

  it('a plain event onto Inbox: an inbox capture, the event in Trash; Undo takes the capture back', () => {
    expect(eventToRail(meeting0, 'to-inbox', undefined, NOW)).toBe(true)
    expect(inbox()).toMatchObject([{ raw_text: 'Call Sam', status: 'pending' }])
    expect(live().map((e) => e.id)).toEqual(['b-write'])
    expect(events().find((e) => e.id === 'ev')!.deleted_at).toBeTruthy()
    toasts.at(-1)!.undo()
    expect(inbox()).toEqual([])
    expect(live().map((e) => e.id).sort()).toEqual(['b-write', 'ev'])
  })

  it('a plain event onto Today: a task due today, no time, its length as the estimate — in the rail\'s Today', () => {
    eventToRail(meeting0, 'to-today', undefined, NOW)
    const made = tasks().find((t) => t.title === 'Call Sam')!
    expect(made).toMatchObject({ duration_min: 45, due_at: cairo(TODAY, '09:00'), scheduled_start: null, project_id: null })
    expect(railBuckets(tasks(), live(), NOW).today.map((r) => r.task.id)).toContain(made.id)
    expect(live().map((e) => e.id)).toEqual(['b-write'])
    expect(toasts.at(-1)!.message).toBe('Now a task · Tasks · Today')
    toasts.at(-1)!.undo()
    expect(tasks().map((t) => t.id)).toEqual(['write'])
    expect(live().map((e) => e.id).sort()).toEqual(['b-write', 'ev'])
  })

  it('a plain event onto Lists scoped to a project: a task in that project, no date', () => {
    eventToRail(meeting0, 'to-list', { kind: 'project', id: 'p1', domainId: 'd1', name: 'Site' }, NOW)
    expect(tasks().find((t) => t.title === 'Call Sam')).toMatchObject({ project_id: 'p1', domain_id: 'd1', area_id: null, due_at: null })
  })

  it('…scoped to an area: a task in that area', () => {
    eventToRail(meeting0, 'to-list', { kind: 'area', id: 'a1', domainId: 'd2', name: 'Health' }, NOW)
    expect(tasks().find((t) => t.title === 'Call Sam')).toMatchObject({ project_id: null, area_id: 'a1', domain_id: 'd2' })
  })

  it('a task block onto Inbox or Lists: unscheduled, the task stays as it was', () => {
    eventToRail(block0, 'unschedule', undefined, NOW)
    expect(live().map((e) => e.id)).toEqual(['ev'])
    expect(tasks()).toMatchObject([{ id: 'write', scheduled_start: null, due_at: write0.due_at }])
    expect(toasts.at(-1)!.message).toBe('Unscheduled · Write')
  })

  it('a task block onto Today: unscheduled and due today, no time; Undo puts the block and the date back', () => {
    eventToRail(block0, 'unschedule-today', undefined, NOW)
    expect(live().map((e) => e.id)).toEqual(['ev'])
    expect(tasks()).toMatchObject([{ id: 'write', scheduled_start: null, due_at: cairo(TODAY, '09:00') }])
    expect(railBuckets(tasks(), live(), NOW).today.map((r) => r.task.id)).toEqual(['write'])
    toasts.at(-1)!.undo()
    expect(live().map((e) => e.id).sort()).toEqual(['b-write', 'ev'])
    expect(tasks()).toMatchObject([{ id: 'write', scheduled_start: write0.scheduled_start, due_at: write0.due_at }])
  })
})
