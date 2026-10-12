import { describe, expect, it } from 'vitest'
import { startOfWeek } from './WeeklyReviewPage'

// The review week starts Sunday 00:00 on the user's clock (Africa/Cairo by default), on any device.
describe('the review week', () => {
  it('a Wednesday afternoon belongs to the week that began the Sunday before, at Cairo midnight', () => {
    expect(startOfWeek(new Date('2026-10-14T15:00:00+03:00')).toISOString()).toBe('2026-10-10T21:00:00.000Z')
  })
  it('00:30 on a Sunday is already the new week', () => {
    expect(startOfWeek(new Date('2026-10-18T00:30:00+03:00')).toISOString()).toBe('2026-10-17T21:00:00.000Z')
  })
  it('a week across the October clock change still starts at Cairo midnight', () => {
    // Egypt falls back on Thu 29 Oct 2026; the week of Sun 1 Nov starts at 00:00 UTC+2.
    expect(startOfWeek(new Date('2026-11-03T12:00:00+02:00')).toISOString()).toBe('2026-10-31T22:00:00.000Z')
  })
})
