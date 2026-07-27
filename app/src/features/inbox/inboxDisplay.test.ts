import { describe, expect, it } from 'vitest'
import { countWord, dayWord, daysAgo, dismissedAgo, isToday } from './inboxDisplay'

describe('countWord', () => {
  it('spells out zero through ten', () => {
    expect(countWord(0)).toBe('Zero')
    expect(countWord(3)).toBe('Three')
    expect(countWord(10)).toBe('Ten')
  })
  it('falls back to a numeral above ten', () => {
    expect(countWord(11)).toBe('11')
    expect(countWord(42)).toBe('42')
  })
})

describe('isToday', () => {
  it('matches the current calendar day', () => {
    expect(isToday(new Date().toISOString())).toBe(true)
  })
  it('rejects a day in the past', () => {
    expect(isToday(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe(false)
  })
})

describe('dismissedAgo', () => {
  it('renders recent dismissals in hours', () => {
    expect(dismissedAgo(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe('2h ago')
  })
  it('rounds up to at least 1h so "just now" never reads as 0h ago', () => {
    expect(dismissedAgo(new Date().toISOString())).toBe('1h ago')
  })
  it('switches to a weekday name after 24h', () => {
    const eightDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(dismissedAgo(eightDaysAgo)).not.toMatch(/ago/)
  })
})

// Punch 7 — the filing toast's date half. Cairo is UTC+2/+3, so a fixed `now` is passed in
// rather than trusting the runner's clock.
describe('dayWord', () => {
  const now = new Date('2026-08-01T09:00:00Z') // 11:00 Cairo
  it('names the same Cairo day "Today"', () => {
    expect(dayWord('2026-08-01T20:00:00Z', now)).toBe('Today')
  })
  it('names the next Cairo day "Tomorrow"', () => {
    expect(dayWord('2026-08-02T06:00:00Z', now)).toBe('Tomorrow')
  })
  it('spells out anything further off', () => {
    expect(dayWord('2026-08-05T06:00:00Z', now)).toBe('Wed, Aug 5')
  })
  it('reads late-evening UTC as the Cairo day it actually falls on', () => {
    // 23:30 UTC on the 1st is 01:30 Cairo on the 2nd — "Tomorrow", not "Today".
    expect(dayWord('2026-08-01T23:30:00Z', now)).toBe('Tomorrow')
  })
})

describe('daysAgo', () => {
  it('never returns negative for clock skew', () => {
    expect(daysAgo(new Date(Date.now() + 60_000).toISOString())).toBe(0)
  })
  it('floors to whole days', () => {
    expect(daysAgo(new Date(Date.now() - 3 * 86_400_000 - 3600_000).toISOString())).toBe(3)
  })
})
