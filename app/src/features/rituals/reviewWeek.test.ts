import { describe, expect, it } from 'vitest'
import { startOfWeek, weekStartDay } from './reviewWeek'

// The review week starts the day after the user's weekend, 00:00 on their clock (Africa/Cairo by
// default), on any device. Kai's weekend is Fri + Sat, so his week starts on Sunday.
describe('the review week', () => {
  it('a Wednesday afternoon belongs to the week that began the Sunday before, at Cairo midnight', () => {
    expect(startOfWeek(new Date('2026-10-14T15:00:00+03:00'), [5, 6]).toISOString()).toBe('2026-10-10T21:00:00.000Z')
  })
  it('00:30 on a Sunday is already the new week', () => {
    expect(startOfWeek(new Date('2026-10-18T00:30:00+03:00'), [5, 6]).toISOString()).toBe('2026-10-17T21:00:00.000Z')
  })
  it('a week across the October clock change still starts at Cairo midnight', () => {
    // Egypt falls back on Thu 29 Oct 2026; the week of Sun 1 Nov starts at 00:00 UTC+2.
    expect(startOfWeek(new Date('2026-11-03T12:00:00+02:00'), [5, 6]).toISOString()).toBe('2026-10-31T22:00:00.000Z')
  })
})

describe('the week follows the weekend', () => {
  it('Fri + Sat → Sunday, Sat + Sun → Monday, Sun only → Monday, no weekend → Sunday', () => {
    expect(weekStartDay([5, 6])).toBe(0)
    expect(weekStartDay([0, 6])).toBe(1)
    expect(weekStartDay([0])).toBe(1)
    expect(weekStartDay([])).toBe(0)
  })
  it('a Sat + Sun user on a Wednesday is in the week that began Monday', () => {
    expect(startOfWeek(new Date('2026-10-14T15:00:00+03:00'), [0, 6]).toISOString()).toBe('2026-10-11T21:00:00.000Z')
  })
})
