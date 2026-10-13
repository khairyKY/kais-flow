import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCommand } from './parseCommand'

// The bar's landings, on the real parse and the real task / event writes (outbox recorded).
const writes: { table: string; row: Record<string, unknown>; op?: string }[] = []
const toasts: { message: string; undo: () => void }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const calRows: Record<string, unknown>[] = []
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => (key[0] === 'calendar_events' ? calRows : []), cancelQueries: () => undefined } }))
vi.mock('../../lib/outbox', () => ({ writeRow: (table: string, row: Record<string, unknown>, op?: string) => writes.push({ table, row, op }) }))
vi.mock('../../lib/activity', () => ({ logActivity: () => undefined }))
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))
const pushed: string[] = []
const blocked: boolean[] = []
const enriched: string[] = []
vi.mock('../../lib/toastStore', () => ({ useToastStore: { getState: () => ({ push: ({ message }: { message: string }) => pushed.push(message) }) } }))
vi.mock('../../lib/sounds', () => ({ playSound: () => undefined }))
vi.mock('../capture/api', () => ({
  blockIfTimed: (_task: unknown, timed: boolean) => (blocked.push(timed), null),
  enrichTypedTask: async (_task: unknown, typed: string) => void enriched.push(`task:${typed}`),
  enrichTypedInboxItem: async (_item: unknown, typed: string) => void enriched.push(`inbox:${typed}`),
}))

const { addTypedEvent, captureTyped } = await import('./quickAdd')

const now = new Date('2026-10-12T07:00:00Z') // Mon 12 Oct, 10:00 Cairo (UTC+3)
const project = { id: 'p1', domain_id: 'd1', name: 'Shaheen', type: 'standard', status: 'active', created_at: '', updated_at: '' } as const
const parse = (typed: string) => parseCommand(typed, [], [project], { now, zone: 'cairo' })
const events = () => writes.filter((w) => w.table === 'calendar_events').map((w) => w.row)

describe('addTypedEvent (P7e A11: the bar can make an event)', () => {
  beforeEach(() => {
    writes.length = 0
    toasts.length = 0
  })

  it('a typed time and length: an event there, that long; the toast says when, Undo takes it to Trash', () => {
    const typed = 'Dinner with Reem tomorrow 8pm 1h30m'
    addTypedEvent(parse(typed), typed, now)
    expect(events()[0]).toMatchObject({ title: 'Dinner with Reem', starts_at: '2026-10-13T17:00:00.000Z', ends_at: '2026-10-13T18:30:00.000Z', all_day: false, type: 'event', task_id: null })
    expect(toasts[0].message).toBe('Added to Calendar · Tomorrow · 8:00 PM')
    toasts[0].undo()
    expect(events().at(-1)).toMatchObject({ id: events()[0].id, deleted_at: expect.any(String) })
  })

  it('a date with no time is all day; no day at all is today; no length is 30 minutes', () => {
    addTypedEvent(parse('Eid holiday friday'), 'Eid holiday friday', now)
    expect(events()[0]).toMatchObject({ title: 'Eid holiday', all_day: true, starts_at: '2026-10-16T00:00:00.000Z', ends_at: '2026-10-17T00:00:00.000Z' })
    addTypedEvent(parse('Gym 6pm'), 'Gym 6pm', now)
    expect(events().at(-1)).toMatchObject({ starts_at: '2026-10-12T15:00:00.000Z', ends_at: '2026-10-12T15:30:00.000Z' })
    addTypedEvent(parse('Open day'), 'Open day', now)
    expect(events().at(-1)).toMatchObject({ all_day: true, starts_at: '2026-10-12T00:00:00.000Z' })
  })

  it('"every monday" repeats it from its first Monday; #project files it', () => {
    const typed = 'Gym every monday 6pm #shaheen'
    addTypedEvent(parse(typed), typed, now)
    expect(events().at(-1)).toMatchObject({ title: 'Gym', starts_at: '2026-10-12T15:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', recurrence_exdates: [], project_id: 'p1' })
  })
})

// P7e A21: the bar's Enter and the tray's quick capture land through this one rule.
describe('captureTyped (the one capture rule)', () => {
  beforeEach(() => {
    writes.length = 0
    toasts.length = 0
    pushed.length = 0
    blocked.length = 0
    enriched.length = 0
  })
  const tasks = () => writes.filter((w) => w.table === 'tasks').map((w) => w.row)

  it('tokens: a task now, a typed time blocks the calendar, the toast names where, the AI fills after', () => {
    const typed = 'Call Omar tomorrow 3pm #shaheen !! *calls'
    captureTyped(parse(typed), typed)
    expect(tasks()[0]).toMatchObject({ title: 'Call Omar', due_at: '2026-10-13T12:00:00.000Z', project_id: 'p1', priority: 2, labels: ['calls'] })
    expect(blocked).toEqual([true])
    expect(toasts[0].message).toMatch(/^Added to .+ · Shaheen$/) // the day word reads the real clock
    expect(enriched).toEqual([`task:${typed}`])
  })

  it('a plain line: the Inbox at once, said so, and the AI reads it there', () => {
    captureTyped(parse('that idea about the hero image'), 'that idea about the hero image')
    expect(writes.map((w) => w.table)).toEqual(['inbox_items'])
    expect(pushed).toEqual(['Added to Inbox'])
    expect(enriched).toEqual(['inbox:that idea about the hero image'])
  })

  it('a repeat, notes and a link all reach the task', () => {
    const typed = 'Stretch every day 7am // ten minutes https://example.com/routine'
    captureTyped(parse(typed), typed)
    expect(tasks()[0]).toMatchObject({ title: 'Stretch', recurrence_rule: 'FREQ=DAILY', notes: 'ten minutes https://example.com/routine' })
    const linked = 'read https://example.com/essay friday'
    captureTyped(parse(linked), linked)
    expect(tasks().at(-1)).toMatchObject({ title: 'read', external_ref: { source: 'link', url: 'https://example.com/essay' } })
  })

  it('kind event: an event, not a task', () => {
    captureTyped(parse('Dinner 8pm'), 'Dinner 8pm', 'event')
    expect(writes.map((w) => w.table)).toEqual(['calendar_events'])
  })
})

describe('`>slot` (Time Slots, 0073): the task goes into the Time block’s next occurrence', () => {
  beforeEach(() => {
    writes.length = 0
    toasts.length = 0
    blocked.length = 0
    vi.useFakeTimers({ now, toFake: ['Date'] })
  })

  it('in the slot (no block of its own), one "Added to" toast (toastAdded: its Undo deletes it); a typed day picks that day’s occurrence', () => {
    // "Code block" every day 11:00–13:00 Cairo (08:00–10:00 UTC).
    calRows.splice(0, calRows.length, { id: 'code', title: 'Code block', type: 'time_block', all_day: false, deleted_at: null, starts_at: '2026-10-10T08:00:00.000Z', ends_at: '2026-10-10T10:00:00.000Z', recurrence_rule: 'FREQ=DAILY', recurrence_exdates: [] })
    const line = (typed: string) => parseCommand(typed, [], [project], { now, zone: 'cairo', slots: ['Code block'] })
    captureTyped(line('fix the login bug >code'), 'fix the login bug >code')
    const t = writes.filter((w) => w.table === 'tasks').at(-1)!.row
    expect(t).toMatchObject({ title: 'fix the login bug', slot_id: 'code', slot_date: '2026-10-12', scheduled_start: '2026-10-12T08:00:00.000Z', scheduled_end: '2026-10-12T10:00:00.000Z' })
    expect(blocked).toEqual([])
    expect(toasts.map((x) => x.message)).toEqual(['Added to Code block'])
    captureTyped(line('review it thursday >code'), 'review it thursday >code')
    expect(writes.filter((w) => w.table === 'tasks').at(-1)!.row).toMatchObject({ slot_date: '2026-10-15', scheduled_start: '2026-10-15T08:00:00.000Z' })
    vi.useRealTimers()
  })
})
