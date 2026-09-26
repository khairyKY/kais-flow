import { describe, expect, it, vi } from 'vitest'

vi.mock('./outbox', () => ({ writeRow: vi.fn() }))

const { activityRow } = await import('./activity')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('activityRow (activity_log.entity_id is a uuid column)', () => {
  it('keeps a real uuid entity id and the payload as given', () => {
    const id = crypto.randomUUID()
    const row = activityRow('task.completed', 'task', id, { a: 1 })
    expect(row.entity_id).toBe(id)
    expect(row.payload).toEqual({ a: 1 })
  })

  it('keeps a null payload null for uuid ids', () => {
    expect(activityRow('task.completed', 'task', crypto.randomUUID()).payload).toBeNull()
  })

  it.each([
    ['ritual step', 'ritual.step_completed', 'morning-2026-09-26'],
    ['evening one-liner', 'journal.line_added', '2026-09-26'],
    ['close the week', 'review.week_closed', '2026-09-21T00:00:00.000Z'],
    ['empty id', 'project.update_logged', ''],
  ])('%s: a non-uuid key becomes a fresh uuid and moves to payload.entity_key', (_, event, key) => {
    const row = activityRow(event, 'ritual', key, { step: 'water' })
    expect(row.entity_id).toMatch(UUID)
    expect(row.payload).toEqual({ step: 'water', entity_key: key })
  })

  it('every row gets its own id', () => {
    expect(activityRow('x', 'y', 'k').id).not.toBe(activityRow('x', 'y', 'k').id)
  })
})
