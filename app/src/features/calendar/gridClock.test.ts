import { describe, it, expect } from 'vitest'
import { dayStamp, headerDay, msUntilNextDay, scrollTimeNear, SCROLL_LEAD_DESKTOP_MIN } from './gridClock'

// The grid runs on the user's zone (CalendarGrid `timeZone`, ./zonePlugin), not the device's: every
// instant below is UTC ISO and the zone is explicit, so these hold under UTC, Cairo, Los Angeles and
// Tokyo alike — the device zone must never move a label.
const CAIRO = 'Africa/Cairo'
const LA = 'America/Los_Angeles'

describe('headerDay (J-15)', () => {
  const now = new Date('2026-09-26T05:13:00Z') // Sat 26 Sep 2026, 08:13 Cairo (+3)
  /** What FullCalendar passes dayHeaderContent: the column's midnight on the grid's clock. */
  const cairoMidnight = (day: number, month = 9) => new Date(Date.UTC(2026, month - 1, day, -3))

  it("labels today's column with today's weekday and date", () => {
    expect(headerDay(cairoMidnight(26), now, CAIRO)).toEqual({ delta: 0, weekday: 'Sat', day: '26' })
  })

  it('counts neighbouring columns in whole days', () => {
    expect(headerDay(cairoMidnight(25), now, CAIRO)).toEqual({ delta: -1, weekday: 'Fri', day: '25' })
    expect(headerDay(cairoMidnight(27), now, CAIRO)).toEqual({ delta: 1, weekday: 'Sun', day: '27' })
    expect(headerDay(cairoMidnight(2, 10), now, CAIRO).delta).toBe(6)
  })

  it('stays whole-day across a DST change (Cairo leaves summer time on 29 Oct 2026)', () => {
    // 31 Oct midnight is +2 by then; "now" is 28 Oct 23:30 (+3).
    expect(headerDay(new Date('2026-10-30T22:00:00Z'), new Date('2026-10-28T20:30:00Z'), CAIRO).delta).toBe(3)
  })

  it('is right just after midnight, when the UTC date is still yesterday in Cairo', () => {
    expect(headerDay(cairoMidnight(26), new Date('2026-09-25T21:05:00Z'), CAIRO)).toEqual({ delta: 0, weekday: 'Sat', day: '26' })
  })

  it("reads the user's zone, not the device's: the same instants in Los Angeles are the day before", () => {
    // 26 Sep 00:00 Cairo = 25 Sep 14:00 in LA; "now" (05:13Z) is 25 Sep 22:13 there.
    expect(headerDay(cairoMidnight(26), now, LA)).toEqual({ delta: 0, weekday: 'Fri', day: '25' })
  })
})

describe('scrollTimeNear (J-15)', () => {
  const cairo = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return new Date(Date.UTC(2026, 8, 26, h - 3, m))
  }

  it('opens two hours above now, floored to the 30-min slot', () => {
    expect(scrollTimeNear(cairo('08:19'), undefined, CAIRO)).toBe('06:00:00')
    expect(scrollTimeNear(cairo('14:45'), undefined, CAIRO)).toBe('12:30:00')
    expect(scrollTimeNear(cairo('21:00'), undefined, CAIRO)).toBe('19:00:00')
  })

  it('never scrolls before midnight', () => {
    expect(scrollTimeNear(cairo('01:10'), undefined, CAIRO)).toBe('00:00:00')
  })

  it('a shorter lead floors the same way; the default is the 2h lead', () => {
    expect(scrollTimeNear(cairo('08:19'), 60, CAIRO)).toBe('07:00:00')
    expect(scrollTimeNear(cairo('00:40'), 60, CAIRO)).toBe('00:00:00')
    expect(scrollTimeNear(cairo('14:45'), SCROLL_LEAD_DESKTOP_MIN, CAIRO)).toBe(scrollTimeNear(cairo('14:45'), undefined, CAIRO))
  })

  it("is the user's clock: 14:45 Cairo is 04:45 in Los Angeles", () => {
    expect(scrollTimeNear(cairo('14:45'), undefined, LA)).toBe('02:30:00')
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
