import { describe, it, expect } from 'vitest'
import { dayStamp, headerDay, msUntilNextDay, scrollTimeNear, SCROLL_LEAD_DESKTOP_MIN, SCROLL_LEAD_PHONE_MIN } from './gridClock'

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

// Polish F2b midnight rollover. Instants are UTC ISO so every assertion holds in any TZ; the
// suite runs under UTC, Africa/Cairo and America/Los_Angeles.
describe('msUntilNextDay / dayStamp (midnight rollover)', () => {
  const MIN = 60_000
  /** ms to the device's own next midnight — the other bound msUntilNextDay may pick. */
  const toLocalMidnight = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()

  it('one minute before Cairo midnight (23:59 EEST = 20:59Z) is one minute from a new day, in every zone', () => {
    // UTC and LA reach their own midnight later than Cairo, so Cairo's comes first everywhere.
    expect(msUntilNextDay(new Date('2026-09-26T20:59:00Z'))).toBe(MIN)
  })

  it('is right on the night Cairo leaves summer time (Thu 29 Oct 2026: 24:00 EEST → 23:00 EET)', () => {
    // 23:30 EEST; the clock then repeats 23:00–24:00 as EET, so Friday starts at 22:00Z.
    expect(msUntilNextDay(new Date('2026-10-29T20:30:00Z'))).toBe(90 * MIN)
    // 23:30 EET, the second pass through that hour.
    expect(msUntilNextDay(new Date('2026-10-29T21:30:00Z'))).toBe(30 * MIN)
  })

  it('never waits past the device midnight either (off-Cairo devices)', () => {
    for (const iso of ['2026-09-26T06:59:00Z', '2026-09-26T12:00:00Z', '2026-09-26T23:59:00Z', '2026-09-27T06:30:00Z']) {
      const now = new Date(iso)
      const ms = msUntilNextDay(now)
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThanOrEqual(toLocalMidnight(now))
      expect(ms).toBeLessThanOrEqual(24 * 60 * MIN + 60 * MIN) // never more than a (DST-long) day
    }
  })

  it("dayStamp changes exactly when Cairo's day does", () => {
    expect(dayStamp(new Date('2026-09-26T20:59:59Z')).split('|')[0]).toBe('2026-09-26')
    expect(dayStamp(new Date('2026-09-26T21:00:00Z')).split('|')[0]).toBe('2026-09-27')
    expect(dayStamp(new Date('2026-09-26T21:00:00Z'))).not.toBe(dayStamp(new Date('2026-09-26T20:59:59Z')))
  })

  it("dayStamp stays put within one Cairo day on a Cairo device, and the device day is part of it", () => {
    const a = new Date('2026-09-26T05:00:00Z')
    expect(dayStamp(a).split('|')[1]).toBe(`${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`)
  })
})
