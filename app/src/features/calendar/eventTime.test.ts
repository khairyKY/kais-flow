import { describe, it, expect } from 'vitest'
import { cairoTimeKey, cairoToIso, localTimeKey, localToIso, slotFields } from './eventTime'
import { localDateKey } from '../routines/streaks'
import { cairoDateKey } from '../../lib/dateShortcuts'

describe('localTimeKey', () => {
  it('formats local hours/minutes with padding', () => {
    expect(localTimeKey(new Date(2026, 6, 4, 9, 5))).toBe('09:05')
  })

  it('handles midnight', () => {
    expect(localTimeKey(new Date(2026, 6, 4, 0, 0))).toBe('00:00')
  })
})

describe('localToIso', () => {
  it('round-trips a local date/time through the stored UTC instant', () => {
    const iso = localToIso('2026-07-04', '21:00')
    const back = new Date(iso)
    expect(localDateKey(back)).toBe('2026-07-04')
    expect(localTimeKey(back)).toBe('21:00')
  })

  it('a no-touch save must be a no-op: re-deriving from the same instant reproduces it exactly', () => {
    const original = new Date(2026, 6, 4, 0, 30)
    const iso = localToIso(localDateKey(original), localTimeKey(original))
    expect(iso).toBe(original.toISOString())
  })
})

// T-4 in the calendar's QuickCreate (Polish F2b). Exact UTC instants, so these hold in every zone
// the suite runs under (UTC, Africa/Cairo, America/Los_Angeles).
describe('cairoToIso / cairoTimeKey (QuickCreate reads typed times as Cairo)', () => {
  it('"10:00" typed on any device means 10:00 in Cairo', () => {
    expect(cairoToIso('2026-09-26', '10:00')).toBe('2026-09-26T07:00:00.000Z') // summer, UTC+3
    expect(cairoToIso('2026-11-05', '10:00')).toBe('2026-11-05T08:00:00.000Z') // winter, UTC+2
    expect(cairoToIso('2026-09-26', '00:30')).toBe('2026-09-25T21:30:00.000Z') // the day starts in Cairo
  })

  it('reads the Cairo clock whatever the device zone', () => {
    expect(cairoTimeKey(new Date('2026-09-26T07:00:00Z'))).toBe('10:00')
    expect(cairoTimeKey(new Date('2026-09-25T21:05:00Z'))).toBe('00:05')
    expect(cairoTimeKey(new Date('2026-11-05T21:59:00Z'))).toBe('23:59')
  })

  it("the form's display round-trips: slot instant → Cairo date + time fields → the same instant", () => {
    const repeatedHour = (t: number) => t >= Date.parse('2026-10-29T20:00:00Z') && t < Date.parse('2026-10-29T21:00:00Z')
    const spans = [
      ['2026-04-22T00:00:00Z', '2026-05-03T00:00:00Z'], // summer time starts (last Friday of April)
      ['2026-09-25T00:00:00Z', '2026-09-28T00:00:00Z'],
      ['2026-10-27T00:00:00Z', '2026-11-02T00:00:00Z'], // summer time ends (last Thursday of October)
      ['2026-12-31T12:00:00Z', '2027-01-01T12:00:00Z'], // year boundary
    ]
    let checked = 0
    for (const [from, to] of spans) {
      for (let t = Date.parse(from); t < Date.parse(to); t += 15 * 60_000) {
        if (repeatedHour(t)) continue // 23:xx EEST reads back as the EET pass of the same wall time
        const d = new Date(t)
        expect(cairoToIso(cairoDateKey(d), cairoTimeKey(d))).toBe(d.toISOString())
        checked++
      }
    }
    expect(checked).toBeGreaterThan(1500)
  })

  it('the repeated hour on the night summer time ends reads as its winter-time pass', () => {
    expect(cairoToIso('2026-10-29', '23:30')).toBe('2026-10-29T21:30:00.000Z')
  })
})

describe('slotFields (a grid slot → the QuickCreate form)', () => {
  it('a timed slot shows Cairo wall-clock and saves back to the same instant', () => {
    // FullCalendar's startStr for a timed select carries the device offset; any offset works.
    const f = slotFields('2026-09-26T14:00:00+03:00', '2026-09-26T14:30:00+03:00', false)
    expect(f).toEqual({ date: '2026-09-26', start: '14:00', end: '14:30', allDay: false })
    expect(cairoToIso(f.date, f.start)).toBe('2026-09-26T11:00:00.000Z')
    expect(cairoToIso(f.date, f.end)).toBe('2026-09-26T11:30:00.000Z')
    // the same instant clicked on a device in Los Angeles
    expect(slotFields('2026-09-26T04:00:00-07:00', '2026-09-26T04:30:00-07:00', false)).toEqual(f)
  })

  it('an all-day slot keeps the date the grid drew, in any zone', () => {
    expect(slotFields('2026-09-26', '2026-09-27', true)).toEqual({ date: '2026-09-26', start: '', end: '', allDay: true })
    // the right-click resolver's local midnight of that day
    expect(slotFields(new Date(2026, 8, 26).toISOString(), '', true).date).toBe('2026-09-26')
  })
})
