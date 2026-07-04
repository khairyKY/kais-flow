import { describe, expect, it } from 'vitest'
import { nextOccurrence } from './recurrence'

describe('nextOccurrence', () => {
  it('advances FREQ=DAILY by one calendar day', () => {
    const from = new Date(2026, 6, 4, 15, 0, 0)
    const next = nextOccurrence('FREQ=DAILY', from)
    expect(next).not.toBeNull()
    expect(next!.getFullYear()).toBe(2026)
    expect(next!.getMonth()).toBe(6)
    expect(next!.getDate()).toBe(5)
  })

  it('advances FREQ=WEEKLY by 7 days, same weekday', () => {
    const from = new Date(2026, 6, 4, 15, 0, 0) // Saturday
    const next = nextOccurrence('FREQ=WEEKLY', from)
    expect(next).not.toBeNull()
    expect(next!.getDay()).toBe(from.getDay())
    const diffDays = Math.round((next!.getTime() - from.getTime()) / 86_400_000)
    expect(diffDays).toBe(7)
  })

  it('FREQ=MONTHLY from a 31st skips months without a 31st day (RFC 5545 behavior)', () => {
    const from = new Date(2026, 0, 31, 9, 0, 0) // Jan 31, 2026
    const next = nextOccurrence('FREQ=MONTHLY', from)
    expect(next).not.toBeNull()
    // Should NOT be clamped to Feb 28 — RFC 5545 skips invalid dates entirely.
    // Confirms which month actually comes back so this documents real library behavior.
    expect(next!.getDate()).toBe(31)
    expect(next!.getMonth()).not.toBe(1) // not February
  })

  it('crosses a DST transition without losing a calendar day (checked by date parts, not raw ms)', () => {
    // 2026-03-08 is a US DST start date; regardless of the test runner's system timezone,
    // asserting on date components (not elapsed milliseconds) is what makes this DST-safe.
    const from = new Date(2026, 2, 7, 15, 0, 0) // Mar 7, 2026
    const next = nextOccurrence('FREQ=DAILY', from)
    expect(next).not.toBeNull()
    expect(next!.getMonth()).toBe(2)
    expect(next!.getDate()).toBe(8)
  })

  it('returns null for a rule with no further occurrences (COUNT=1)', () => {
    const from = new Date(2026, 6, 4, 15, 0, 0)
    const next = nextOccurrence('FREQ=DAILY;COUNT=1', from)
    expect(next).toBeNull()
  })
})
