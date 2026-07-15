import { describe, expect, it } from 'vitest'
import { countWord, daysAgo, dismissedAgo, isToday } from './inboxDisplay'

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

describe('daysAgo', () => {
  it('never returns negative for clock skew', () => {
    expect(daysAgo(new Date(Date.now() + 60_000).toISOString())).toBe(0)
  })
  it('floors to whole days', () => {
    expect(daysAgo(new Date(Date.now() - 3 * 86_400_000 - 3600_000).toISOString())).toBe(3)
  })
})
