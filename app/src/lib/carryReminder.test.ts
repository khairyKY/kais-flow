import { describe, expect, it } from 'vitest'
import { carryReminder } from './carryReminder'

const row = (over: Partial<Parameters<typeof carryReminder>[1]> = {}) => ({
  due_at: '2026-10-03T12:00:00.000Z', scheduled_start: null, reminder_at: '2026-10-03T11:50:00.000Z', reminder_sent: false, ...over,
})
const NOW = Date.parse('2026-10-03T08:00:00.000Z')

describe('carryReminder — the lead time moves with the task', () => {
  it('Tomorrow keeps "10 min before"', () => {
    expect(carryReminder(row(), row({ due_at: '2026-10-04T06:00:00.000Z' }), NOW).reminder_at).toBe('2026-10-04T05:50:00.000Z')
  })
  it('follows scheduled_start when there is no due date (a calendar drag)', () => {
    const prev = row({ due_at: null, scheduled_start: '2026-10-03T12:00:00.000Z' })
    expect(carryReminder(prev, { ...prev, scheduled_start: '2026-10-03T13:15:00.000Z' }, NOW).reminder_at).toBe('2026-10-03T13:05:00.000Z')
  })
  it('re-arms a fired reminder that moved into the future, and leaves a past one alone', () => {
    const fired = row({ reminder_sent: true })
    expect(carryReminder(fired, { ...fired, due_at: '2026-10-04T12:00:00.000Z' }, NOW).reminder_sent).toBe(false)
    const later = Date.parse('2026-10-05T00:00:00.000Z')
    expect(carryReminder(fired, { ...fired, due_at: '2026-10-04T12:00:00.000Z' }, later).reminder_sent).toBe(true)
  })
  it('stays out of the way: no reminder, the write sets it, no anchor, nothing moved, no previous row', () => {
    const moved = row({ due_at: '2026-10-04T12:00:00.000Z' })
    expect(carryReminder(row({ reminder_at: null }), { ...moved, reminder_at: null }, NOW).reminder_at).toBeNull()
    expect(carryReminder(row(), { ...moved, reminder_at: '2026-10-04T09:00:00.000Z' }, NOW).reminder_at).toBe('2026-10-04T09:00:00.000Z')
    expect(carryReminder(row(), row({ due_at: null }), NOW).reminder_at).toBe('2026-10-03T11:50:00.000Z')
    expect(carryReminder(row(), row(), NOW)).toEqual(row())
    expect(carryReminder(undefined, moved, NOW)).toBe(moved)
  })
})
