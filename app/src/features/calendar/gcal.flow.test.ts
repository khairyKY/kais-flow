import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../../lib/types'

// gcal-events: the real calendar/api and ./gcal against an in-memory cache and a fake google-sync. A Google event on a calendar
// we own is edited like any block and the change goes to Google; any other is read-only; a failed call puts the grid back.
const cache = new Map<string, unknown>()
const invoked: { fn: string; body: Record<string, unknown> }[] = []
let answer: (body: Record<string, unknown>) => { data?: unknown; error?: unknown } = () => ({ data: { ok: true, undo: { calendar: 'kai@gmail.com', ops: [{ op: 'patch', id: 'g1', body: { summary: 'before' } }] } } })
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: async (fn: string, o: { body: Record<string, unknown> }) => (invoked.push({ fn, body: o.body }), answer(o.body)) } } }))
vi.mock('../../lib/queryClient', () => ({
  queryClient: {
    getQueryData: (key: string[]) => cache.get(key[0]),
    setQueryData: (key: string[], f: unknown) => cache.set(key[0], typeof f === 'function' ? (f as (o: unknown) => unknown)(cache.get(key[0])) : f),
    cancelQueries: async () => {},
    invalidateQueries: async () => {},
  },
}))
const written: string[] = []
vi.mock('../../lib/outbox', () => ({ writeRow: (table: string) => void written.push(table) }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
const toasts: { message: string; undo?: () => void }[] = []
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))
const pushed: string[] = []
vi.mock('../../lib/toastStore', () => ({ useToastStore: { getState: () => ({ push: (t: { message: string }) => pushed.push(t.message) }) } }))

const api = await import('./api')
const { gcalLink, joinLink } = await import('./gcal')
const { setAppZone } = await import('../../lib/appZone')

const REF = { source: 'gcal', id: 'kai@gmail.com/g1', calendar: 'Kai', calendar_id: 'kai@gmail.com' }
const g = (id: string, start: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: 'Standup', starts_at: start, ends_at: new Date(Date.parse(start) + 30 * 60_000).toISOString(), all_day: false, task_id: null,
  source: 'gcal', gcal_id: `g-${id}`, gcal_etag: '"1"', busy: true, type: 'event', color: '#4986e7', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  external_ref: { ...REF, edit: true }, ...over,
})
const rows = () => cache.get('calendar_events') as CalendarEvent[]
const row = (id: string) => rows().find((r) => r.id === id)!
const MON = '2026-10-12T07:00:00.000Z'
const MON2 = '2026-10-19T07:00:00.000Z'
const MON3 = '2026-10-26T07:00:00.000Z'

beforeEach(() => {
  setAppZone('Africa/Cairo')
  cache.set('calendar_events', [g('one', MON), g('ro', MON, { external_ref: REF }), g('s1', MON, { external_ref: { ...REF, edit: true, master: 'series' } }), g('s2', MON2, { external_ref: { ...REF, edit: true, master: 'series' } }), g('s3', MON3, { external_ref: { ...REF, edit: true, master: 'series' } })])
  invoked.length = 0
  toasts.length = 0
  pushed.length = 0
  written.length = 0
  answer = () => ({ data: { ok: true, undo: { calendar: 'kai@gmail.com', ops: [{ op: 'patch', id: 'g1', body: { summary: 'before' } }] } } })
})

describe('a read-only Google event', () => {
  it('nothing writes it: not a move, a rename or a delete — and nothing goes to Google', () => {
    const e = row('ro')
    api.moveOrResizeEvent(e, '2026-10-13T08:00:00.000Z', '2026-10-13T08:30:00.000Z')
    api.updateEvent(e, { title: 'Mine now' })
    api.deleteEvent(e)
    expect(invoked).toEqual([])
    expect(written).toEqual([])
    expect(row('ro')).toEqual(e)
  })

  it('is no series block (no question), whatever its master', () => {
    expect(api.isSeriesBlock({ ...row('ro'), external_ref: { ...REF, master: 'series' } })).toBe(false)
  })
})

describe('a Google event on a calendar we own', () => {
  it('a drag moves it at once and tells google-sync: This, the new times', () => {
    api.moveOrResizeEvent(row('one'), '2026-10-13T08:00:00.000Z', '2026-10-13T08:45:00.000Z')
    expect(row('one')).toMatchObject({ starts_at: '2026-10-13T08:00:00.000Z', ends_at: '2026-10-13T08:45:00.000Z' })
    expect(invoked).toEqual([{ fn: 'google-sync', body: { action: 'edit', id: 'one', scope: 'this', change: { starts_at: '2026-10-13T08:00:00.000Z', ends_at: '2026-10-13T08:45:00.000Z' } } }])
    expect(written).toEqual([]) // not an outbox write: Google first, then google-sync re-reads the calendar
  })

  it('a rename sends just the title (the rest of the row isn’t ours)', () => {
    api.updateEvent(row('one'), { title: 'Retro', color: '#ff0000', remind_min: 5 })
    expect(row('one').title).toBe('Retro')
    expect(invoked[0].body.change).toEqual({ title: 'Retro' })
    api.updateEvent(row('one'), { color: '#00ff00' })
    expect(invoked).toHaveLength(1) // colour alone stays here
  })

  it('a delete goes to Google; its Undo runs the ops Google answered with', async () => {
    const undo = api.deleteEvent(row('one'))
    expect(undo()).toBeUndefined()
    expect(row('one').deleted_at).toBeTruthy()
    expect(invoked[0].body).toEqual({ action: 'edit', id: 'one', scope: 'this', change: { delete: true } })
    api.restoreEvent(row('one'))
    await vi.waitFor(() => expect(invoked).toHaveLength(2))
    expect(invoked[1]).toEqual({ fn: 'google-sync', body: { action: 'undo', calendar: 'kai@gmail.com', ops: [{ op: 'patch', id: 'g1', body: { summary: 'before' } }] } })
  })

  it('Google says no: the grid goes back as it was, with a sentence', async () => {
    const before = { ...row('one') }
    answer = () => ({ error: new Error('boom') })
    api.moveOrResizeEvent(row('one'), '2026-10-13T08:00:00.000Z', '2026-10-13T08:45:00.000Z')
    expect(row('one').starts_at).toBe('2026-10-13T08:00:00.000Z')
    await vi.waitFor(() => expect(pushed).toHaveLength(1))
    expect(row('one')).toEqual(before)
    expect(pushed[0]).toMatch(/put back$/)
  })

  it('multi-select moves and removes them too', () => {
    api.moveEventsByWithUndo([row('one')], 15 * 60_000)
    expect(invoked).toHaveLength(1)
    api.deleteEventsWithUndo([row('one'), row('ro')])
    expect(invoked).toHaveLength(2) // the read-only one is left alone
    expect(toasts.at(-1)?.message).toBe('Removed · 1 block')
  })
})

describe('a repeating Google event: This · This and following · All', () => {
  it('is a series block — the same question as ours', () => {
    expect(api.isSeriesBlock(row('s1'))).toBe(true)
    expect(api.isSeriesBlock(row('one'))).toBe(false)
  })

  it('"This and following" delete: this one and the later ones go from the grid, the earlier ones stay; Undo runs Google’s ops', async () => {
    api.applySeriesChange(row('s2'), 'following', { kind: 'delete' }, 'Deleted · Standup · this and following')
    expect(invoked[0].body).toEqual({ action: 'edit', id: 's2', scope: 'following', change: { delete: true } })
    expect(row('s1').deleted_at).toBeFalsy()
    expect(row('s2').deleted_at).toBeTruthy()
    expect(row('s3').deleted_at).toBeTruthy()
    toasts.at(-1)!.undo!()
    await vi.waitFor(() => expect(invoked).toHaveLength(2))
    expect(invoked[1].body).toMatchObject({ action: 'undo', calendar: 'kai@gmail.com' })
  })

  it('"All" rename changes every occurrence on screen; "This" only the one', () => {
    api.applySeriesChange(row('s2'), 'this', { kind: 'patch', patch: { title: 'Once' } }, 'Renamed')
    expect(rows().map((r) => r.title)).toEqual(['Standup', 'Standup', 'Standup', 'Once', 'Standup'])
    api.applySeriesChange(row('s1'), 'all', { kind: 'patch', patch: { title: 'Retro' } }, 'Renamed')
    expect(rows().filter((r) => r.external_ref?.master === 'series').map((r) => r.title)).toEqual(['Retro', 'Retro', 'Retro'])
    expect(invoked.map((i) => (i.body as { scope: string }).scope)).toEqual(['this', 'all'])
  })

  it('"All" move shifts every occurrence by the same time; "following" only from this one', () => {
    api.applySeriesChange(row('s2'), 'following', { kind: 'time', starts_at: '2026-10-20T08:00:00.000Z', ends_at: '2026-10-20T08:30:00.000Z' }, 'Moved')
    expect(row('s1').starts_at).toBe(MON)
    expect(row('s2').starts_at).toBe('2026-10-20T08:00:00.000Z') // a day and an hour later
    expect(row('s3').starts_at).toBe('2026-10-27T08:00:00.000Z')
  })

  it('a change that doesn’t reach Google (a colour) writes nothing', () => {
    api.applySeriesChange(row('s2'), 'all', { kind: 'patch', patch: { color: '#000000' } }, 'Colour')
    expect(invoked).toEqual([])
  })
})

describe('useCalendarEvents’ windowing and sharing', () => {
  const stored = (): CalendarEvent[] => [g('near', MON), g('far', '2026-03-02T07:00:00.000Z'), g('later', '2027-05-03T07:00:00.000Z'), g('long', '2026-10-01T07:00:00.000Z', { ends_at: '2026-10-20T07:00:00.000Z' })]
  const from = Date.parse('2026-10-11T21:00:00.000Z')
  const to = Date.parse('2026-10-18T21:00:00.000Z')

  it('a grid’s range is only what touches it (a one-off that spans in counts); an unranged reader keeps every one-off', () => {
    const data = stored()
    expect(api.expanded(data, from, to, 'Africa/Cairo', true).map((e) => e.id)).toEqual(['near', 'long'])
    expect(api.expanded(data, from, to, 'Africa/Cairo', false).map((e) => e.id).sort()).toEqual(['far', 'later', 'long', 'near'])
  })

  it('the same rows, window and zone are expanded once and shared', () => {
    const data = stored()
    const a = api.expanded(data, from, to, 'Africa/Cairo', true)
    expect(api.expanded(data, from, to, 'Africa/Cairo', true)).toBe(a)
    expect(api.expanded(data, from, to + 1, 'Africa/Cairo', true)).not.toBe(a)
    expect(api.expanded([...data], from, to, 'Africa/Cairo', true)).not.toBe(a) // new rows, new answer
  })

  it('trashed rows never show, series expand inside the window', () => {
    const series: CalendarEvent = { ...g('daily', '2026-10-05T07:00:00.000Z', { source: 'native', external_ref: null, recurrence_rule: 'FREQ=DAILY', recurrence_exdates: [] }) }
    const data = [series, g('gone', MON, { deleted_at: '2026-10-12T00:00:00.000Z' })]
    const out = api.expanded(data, from, to, 'Africa/Cairo', true)
    expect(out.map((e) => e.id.split('::')[0])).toEqual(Array(7).fill('daily'))
  })
})

describe('gcalLink / joinLink', () => {
  it('the link Google gave, else the address its eid makes; Join only for https', () => {
    expect(gcalLink({ gcal_id: 'g1', external_ref: { ...REF, link: 'https://www.google.com/calendar/event?eid=abc' } })).toBe('https://www.google.com/calendar/event?eid=abc')
    expect(gcalLink({ gcal_id: 'g1', external_ref: REF })).toBe(`https://calendar.google.com/calendar/event?eid=${btoa('g1 kai@gmail.com').replace(/=+$/, '')}`)
    expect(gcalLink({ gcal_id: null, external_ref: REF })).toBeNull()
    expect(joinLink({ external_ref: { ...REF, url: 'https://meet.google.com/abc-defg-hij' } })).toBe('https://meet.google.com/abc-defg-hij')
    expect(joinLink({ external_ref: { ...REF, url: 'javascript:alert(1)' } })).toBeNull()
    expect(joinLink({ external_ref: REF })).toBeNull()
  })
})
