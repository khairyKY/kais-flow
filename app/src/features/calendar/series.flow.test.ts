import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../../lib/types'

// Repeating events end to end (decision 2026-10-12): the real calendar/api writes against an
// in-memory cache that behaves like the outbox's optimistic one, read back the way every reader
// sees them (series.expandEvents). One-off writes must never see an occurrence id.
const cache = new Map<string, unknown>()
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({
  queryClient: { getQueryData: (key: string[]) => cache.get(key[0]), setQueryData: (key: string[], v: unknown) => cache.set(key[0], v) },
}))
const written: { table: string; id: string; op: string }[] = []
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: { id: string }, op = 'upsert') => {
    written.push({ table, id: row.id, op })
    const rows = (cache.get(table) as { id: string }[] | undefined) ?? []
    cache.set(table, op === 'delete' ? rows.filter((r) => r.id !== row.id) : rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row])
  },
}))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
const toasts: { message: string; undo: () => void }[] = []
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))

const api = await import('./api')
const { expandEvents } = await import('./series')
const { setAppZone } = await import('../../lib/appZone')

const ROW: CalendarEvent = {
  id: 'standup', title: 'Standup', starts_at: '2026-10-12T06:00:00.000Z', ends_at: '2026-10-12T06:30:00.000Z', all_day: false, task_id: null,
  source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: [],
  created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
}
const rows = () => (cache.get('calendar_events') as CalendarEvent[]).filter((e) => !e.deleted_at)
const shown = () => expandEvents(rows(), new Date('2026-10-12T00:00:00Z'), new Date('2026-11-03T00:00:00Z'), 'Africa/Cairo')
const occ = (start: string) => shown().find((e) => e.starts_at === start)!
const WEEK2 = '2026-10-19T06:00:00.000Z'

beforeEach(() => {
  setAppZone('Africa/Cairo')
  cache.set('calendar_events', [{ ...ROW }])
  cache.set('tasks', [])
  toasts.length = 0
  written.length = 0
})

describe('a weekly series', () => {
  it('dragging one occurrence moves just it: the series skips that week, a one-off lands there; one Undo puts both back', () => {
    const undo = api.moveOrResizeEvent(occ(WEEK2), '2026-10-20T08:00:00.000Z', '2026-10-20T08:30:00.000Z')
    expect(shown().map((e) => e.starts_at)).toEqual(['2026-10-12T06:00:00.000Z', '2026-10-20T08:00:00.000Z', '2026-10-26T06:00:00.000Z', '2026-11-02T07:00:00.000Z'])
    const copy = rows().find((r) => r.series_id === 'standup')!
    expect(copy).toMatchObject({ title: 'Standup', recurrence_rule: null })
    expect('seriesId' in copy).toBe(false)
    undo()
    expect(shown().map((e) => e.starts_at)).toEqual(['2026-10-12T06:00:00.000Z', WEEK2, '2026-10-26T06:00:00.000Z', '2026-11-02T07:00:00.000Z'])
    expect(rows()).toHaveLength(1)
    // never an occurrence id on the wire
    expect(written.every((w) => !w.id.includes('::'))).toBe(true)
  })

  it('Delete → This event skips one week; Undo brings it back', () => {
    api.deleteEventWithUndo(occ(WEEK2), 'Deleted')
    expect(shown().map((e) => e.starts_at)).not.toContain(WEEK2)
    expect(rows()[0].deleted_at ?? null).toBeNull()
    toasts.at(-1)!.undo()
    expect(shown().map((e) => e.starts_at)).toContain(WEEK2)
  })

  it('Delete → All events trashes the series and its moved-out occurrences; Undo restores all', () => {
    api.moveOrResizeEvent(occ(WEEK2), '2026-10-20T08:00:00.000Z', '2026-10-20T08:30:00.000Z')
    api.deleteSeriesWithUndo(occ('2026-10-26T06:00:00.000Z'))
    expect(shown()).toEqual([])
    expect(toasts.at(-1)!.message).toBe('Deleted all · Standup')
    toasts.at(-1)!.undo()
    expect(shown()).toHaveLength(4)
  })

  it('title, colour and project edits from any occurrence change the whole series; its times do not', () => {
    api.updateEvent(occ(WEEK2), { title: 'Team standup', color: '#9AB4BE', project_id: 'p1', starts_at: 'x', ends_at: 'y' })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ title: 'Team standup', color: '#9AB4BE', project_id: 'p1', starts_at: ROW.starts_at })
    expect(new Set(shown().map((e) => e.title))).toEqual(new Set(['Team standup']))
  })

  it('a new time of day / length from the popover moves every week, with one Undo', () => {
    api.retimeEventWithUndo(occ(WEEK2), { day: '2026-10-19', start: 540, end: 570 }, { day: '2026-10-19', start: 600, end: 660 })
    expect(shown().map((e) => e.starts_at)).toEqual(['2026-10-12T07:00:00.000Z', '2026-10-19T07:00:00.000Z', '2026-10-26T07:00:00.000Z', '2026-11-02T08:00:00.000Z'])
    expect(shown().every((e) => Date.parse(e.ends_at) - Date.parse(e.starts_at) === 3_600_000)).toBe(true)
    toasts.at(-1)!.undo()
    expect(rows()[0].starts_at).toBe(ROW.starts_at)
  })

  it('Repeat: a one-off starts repeating; Does not repeat from an occurrence keeps that block where it is', () => {
    cache.set('calendar_events', [{ ...ROW, recurrence_rule: null }])
    api.setEventRepeat(rows()[0], 'FREQ=DAILY')
    expect(shown().length).toBeGreaterThan(20)
    cache.set('calendar_events', [{ ...ROW }])
    api.setEventRepeat(occ(WEEK2), null)
    expect(shown().map((e) => [e.id, e.starts_at])).toEqual([['standup', WEEK2]])
  })

  it('task blocks never repeat; Link a task skips a repeat', () => {
    cache.set('calendar_events', [{ ...ROW, recurrence_rule: null, task_id: 't1', type: 'task' }])
    api.setEventRepeat(rows()[0], 'FREQ=WEEKLY')
    expect(rows()[0].recurrence_rule).toBeNull()
    cache.set('calendar_events', [{ ...ROW }])
    api.linkTaskWithUndo(occ(WEEK2), { id: 't9', title: 'x' } as never)
    expect(rows()[0].task_id).toBeNull()
  })

  it('an occurrence whose series row is gone writes nothing', () => {
    const ghost = occ(WEEK2)
    cache.set('calendar_events', [])
    api.deleteEvent(ghost)
    api.updateEvent(ghost, { title: 'x' })
    api.moveOrResizeEvent(ghost, '2026-10-20T08:00:00.000Z', '2026-10-20T08:30:00.000Z')()
    expect(written).toEqual([])
  })
})
