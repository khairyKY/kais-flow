import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCommand } from './parseCommand'

// The bar's landings, on the real parse and the real task / event writes (outbox recorded).
const writes: { table: string; row: Record<string, unknown>; op?: string }[] = []
const toasts: { message: string; undo: () => void }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => [], cancelQueries: () => undefined } }))
vi.mock('../../lib/outbox', () => ({ writeRow: (table: string, row: Record<string, unknown>, op?: string) => writes.push({ table, row, op }) }))
vi.mock('../../lib/activity', () => ({ logActivity: () => undefined }))
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))
vi.mock('../capture/api', () => ({ blockIfTimed: () => null, enrichTypedTask: async () => undefined, enrichTypedInboxItem: async () => undefined }))

const { addTypedEvent } = await import('./quickAdd')

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
