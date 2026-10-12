import { describe, expect, it } from 'vitest'
import { IntlZone } from './zonePlugin'

// FullCalendar's named-zone contract on Intl (./zonePlugin): wall-clock arrays ↔ instants, DST-correct.
// Exact instants only — independent of the device zone the suite runs in.
describe('IntlZone', () => {
  const cairo = new IntlZone('Africa/Cairo')

  it('reads an instant as the zone’s wall clock', () => {
    expect(cairo.timestampToArray(Date.parse('2026-10-12T07:30:00Z'))).toEqual([2026, 9, 12, 10, 30, 0, 0]) // +3
    expect(cairo.timestampToArray(Date.parse('2026-11-02T07:30:00Z'))).toEqual([2026, 10, 2, 9, 30, 0, 0]) // +2
  })

  it('gives the offset at a wall-clock time, summer and winter', () => {
    expect(cairo.offsetForArray([2026, 9, 12, 10, 30, 0, 0])).toBe(180)
    expect(cairo.offsetForArray([2026, 10, 2, 9, 30, 0, 0])).toBe(120)
    expect(new IntlZone('America/Los_Angeles').offsetForArray([2026, 10, 7, 9, 0, 0, 0])).toBe(-480)
  })

  it('round-trips: wall → instant → wall', () => {
    const a = [2026, 9, 26, 9, 15, 0, 0]
    const instant = Date.UTC(2026, 9, 26, 9, 15) - cairo.offsetForArray(a) * 60_000
    expect(cairo.timestampToArray(instant)).toEqual(a)
  })
})
