import { describe, it, expect } from 'vitest'
import { headerDay, scrollTimeNear, SCROLL_LEAD_DESKTOP_MIN, SCROLL_LEAD_PHONE_MIN } from './gridClock'

// Run under TZ=UTC and TZ=Africa/Cairo. The pre-fix header read local-midnight Dates through
// getUTC*, which only breaks east of Greenwich — the Cairo run is the one that caught it.
describe('headerDay (J-15)', () => {
  const now = new Date(2026, 8, 26, 8, 13) // Sat 26 Sep 2026, 08:13 local

  it("labels today's column with today's weekday and date", () => {
    // what FullCalendar passes dayHeaderContent: the column's local midnight
    expect(headerDay(new Date(2026, 8, 26), now)).toEqual({ delta: 0, weekday: 'Sat', day: '26' })
  })

  it('counts neighbouring columns in whole local days', () => {
    expect(headerDay(new Date(2026, 8, 25), now)).toEqual({ delta: -1, weekday: 'Fri', day: '25' })
    expect(headerDay(new Date(2026, 8, 27), now)).toEqual({ delta: 1, weekday: 'Sun', day: '27' })
    expect(headerDay(new Date(2026, 9, 2), now).delta).toBe(6)
  })

  it('stays whole-day across a DST change (Cairo leaves summer time on 29 Oct 2026)', () => {
    expect(headerDay(new Date(2026, 9, 31), new Date(2026, 9, 28, 23, 30)).delta).toBe(3)
  })

  it('is right just after local midnight, when the UTC date is still yesterday in Cairo', () => {
    const justAfter = new Date(2026, 8, 26, 0, 5)
    expect(headerDay(new Date(2026, 8, 26), justAfter)).toEqual({ delta: 0, weekday: 'Sat', day: '26' })
  })
})

describe('scrollTimeNear (J-15)', () => {
  it('opens two hours above now, floored to the 30-min slot', () => {
    expect(scrollTimeNear(new Date(2026, 8, 26, 8, 19))).toBe('06:00:00')
    expect(scrollTimeNear(new Date(2026, 8, 26, 14, 45))).toBe('12:30:00')
    expect(scrollTimeNear(new Date(2026, 8, 26, 21, 0))).toBe('19:00:00')
  })

  it('never scrolls before midnight', () => {
    expect(scrollTimeNear(new Date(2026, 8, 26, 1, 10))).toBe('00:00:00')
  })

  it('a phone opens one hour above now (Polish F2b), same flooring', () => {
    expect(SCROLL_LEAD_PHONE_MIN).toBe(60)
    expect(scrollTimeNear(new Date(2026, 8, 26, 8, 19), SCROLL_LEAD_PHONE_MIN)).toBe('07:00:00')
    expect(scrollTimeNear(new Date(2026, 8, 26, 14, 45), SCROLL_LEAD_PHONE_MIN)).toBe('13:30:00')
    expect(scrollTimeNear(new Date(2026, 8, 26, 0, 40), SCROLL_LEAD_PHONE_MIN)).toBe('00:00:00')
    // and the desktop default is still the 2h lead
    expect(scrollTimeNear(new Date(2026, 8, 26, 14, 45), SCROLL_LEAD_DESKTOP_MIN)).toBe(scrollTimeNear(new Date(2026, 8, 26, 14, 45)))
  })
})
