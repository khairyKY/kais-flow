import { describe, expect, it } from 'vitest'
import {
  cairoDateKey,
  cairoOffsetMinutes,
  cairoWallTimeToIso,
  daysUntilNextMonday,
  scheduleNextWeek,
  scheduleThisWeek,
  scheduleToday,
  scheduleTomorrow,
} from './dateShortcuts'

// T-2: every `now` below is an explicit instant and every expectation an explicit UTC ISO, so
// these hold on any device timezone. 09:00 Cairo is 06:00Z in summer time (UTC+3) and 07:00Z
// in winter time (UTC+2). 2026 switches: summer from Fri Apr 24 00:00 (clocks jump to 01:00),
// winter from Thu Oct 29 24:00 (clocks fall back to 23:00 Thursday).

describe('schedule shortcuts on a normal summer day (UTC+3)', () => {
  const wednesday = new Date('2026-07-08T14:00:00+03:00')

  it('today lands at 09:00 Cairo the same Cairo day', () => {
    expect(scheduleToday(wednesday)).toBe('2026-07-08T06:00:00.000Z')
  })
  it('tomorrow lands at 09:00 Cairo the next Cairo day', () => {
    expect(scheduleTomorrow(wednesday)).toBe('2026-07-09T06:00:00.000Z')
  })
  it('this week lands 2 Cairo days out at 09:00', () => {
    expect(scheduleThisWeek(wednesday)).toBe('2026-07-10T06:00:00.000Z')
  })
  it('next week lands on the coming Monday 09:00 Cairo', () => {
    expect(scheduleNextWeek(wednesday)).toBe('2026-07-13T06:00:00.000Z')
  })
  it('next week rolls a full 7 days when today is already Monday', () => {
    expect(scheduleNextWeek(new Date('2026-07-06T09:00:00+03:00'))).toBe('2026-07-13T06:00:00.000Z')
  })
})

describe('schedule shortcuts on a winter day (UTC+2)', () => {
  const wednesday = new Date('2026-01-14T14:00:00+02:00')

  it('every shortcut lands at 09:00 Cairo = 07:00Z', () => {
    expect(scheduleToday(wednesday)).toBe('2026-01-14T07:00:00.000Z')
    expect(scheduleTomorrow(wednesday)).toBe('2026-01-15T07:00:00.000Z')
    expect(scheduleThisWeek(wednesday)).toBe('2026-01-16T07:00:00.000Z')
    expect(scheduleNextWeek(wednesday)).toBe('2026-01-19T07:00:00.000Z')
  })
  it('rolls over month and year on Cairo days', () => {
    const newYearsEve = new Date('2026-12-31T20:00:00+02:00') // a Thursday
    expect(scheduleTomorrow(newYearsEve)).toBe('2027-01-01T07:00:00.000Z')
    expect(scheduleNextWeek(newYearsEve)).toBe('2027-01-04T07:00:00.000Z')
  })
})

describe('schedule shortcuts when the Cairo day differs from the UTC day', () => {
  // 22:30Z on Thu Sep 24 is already 01:30 on Fri Sep 25 in Cairo.
  const lateUtc = new Date('2026-09-24T22:30:00Z')

  it('uses the Cairo calendar day, not the UTC one', () => {
    expect(scheduleToday(lateUtc)).toBe('2026-09-25T06:00:00.000Z')
    expect(scheduleTomorrow(lateUtc)).toBe('2026-09-26T06:00:00.000Z')
    expect(scheduleThisWeek(lateUtc)).toBe('2026-09-27T06:00:00.000Z')
  })
  it('uses the Cairo weekday (Friday → 3 days to Monday, not Thursday → 4)', () => {
    expect(daysUntilNextMonday(lateUtc)).toBe(3)
    expect(scheduleNextWeek(lateUtc)).toBe('2026-09-28T06:00:00.000Z')
  })
  it('does the same in winter', () => {
    // 22:30Z on Wed Jan 14 is 00:30 on Thu Jan 15 in Cairo.
    expect(scheduleToday(new Date('2026-01-14T22:30:00Z'))).toBe('2026-01-15T07:00:00.000Z')
  })
})

describe('schedule shortcuts across the spring DST switch (Fri 2026-04-24)', () => {
  it('from the Monday before, next week lands at 09:00 summer time', () => {
    const monday = new Date('2026-04-20T10:00:00+02:00')
    expect(scheduleToday(monday)).toBe('2026-04-20T07:00:00.000Z')
    expect(scheduleThisWeek(monday)).toBe('2026-04-22T07:00:00.000Z')
    expect(scheduleNextWeek(monday)).toBe('2026-04-27T06:00:00.000Z')
  })
  it('in the last winter half-hour, today is still UTC+2 and tomorrow already UTC+3', () => {
    const lastWinterHalfHour = new Date('2026-04-23T23:30:00+02:00')
    expect(scheduleToday(lastWinterHalfHour)).toBe('2026-04-23T07:00:00.000Z')
    expect(scheduleTomorrow(lastWinterHalfHour)).toBe('2026-04-24T06:00:00.000Z')
    expect(scheduleThisWeek(lastWinterHalfHour)).toBe('2026-04-25T06:00:00.000Z')
    expect(scheduleNextWeek(lastWinterHalfHour)).toBe('2026-04-27T06:00:00.000Z')
  })
  it('just after the jump it is Friday in Cairo while still Thursday in UTC', () => {
    const justAfter = new Date('2026-04-24T01:30:00+03:00') // 22:30Z Thu
    expect(scheduleToday(justAfter)).toBe('2026-04-24T06:00:00.000Z')
    expect(daysUntilNextMonday(justAfter)).toBe(3)
  })
})

describe('schedule shortcuts across the autumn DST switch (Thu 2026-10-29 24:00)', () => {
  it('from the Monday before, next week lands at 09:00 winter time', () => {
    const monday = new Date('2026-10-26T10:00:00+03:00')
    expect(scheduleToday(monday)).toBe('2026-10-26T06:00:00.000Z')
    expect(scheduleNextWeek(monday)).toBe('2026-11-02T07:00:00.000Z')
  })
  it('both runs of the repeated 23:30 Thursday schedule the same instants', () => {
    for (const repeated of [new Date('2026-10-29T23:30:00+03:00'), new Date('2026-10-29T23:30:00+02:00')]) {
      expect(scheduleToday(repeated)).toBe('2026-10-29T06:00:00.000Z')
      expect(scheduleTomorrow(repeated)).toBe('2026-10-30T07:00:00.000Z')
      expect(scheduleThisWeek(repeated)).toBe('2026-10-31T07:00:00.000Z')
      expect(daysUntilNextMonday(repeated)).toBe(4)
      expect(scheduleNextWeek(repeated)).toBe('2026-11-02T07:00:00.000Z')
    }
  })
  it('the first winter half-hour is Friday in Cairo while still Thursday in UTC', () => {
    const firstWinterHalfHour = new Date('2026-10-30T00:30:00+02:00') // 22:30Z Thu
    expect(scheduleToday(firstWinterHalfHour)).toBe('2026-10-30T07:00:00.000Z')
    expect(daysUntilNextMonday(firstWinterHalfHour)).toBe(3)
  })
})

describe('daysUntilNextMonday (Cairo weekday)', () => {
  it('counts down Mon→Sun as 7,6,5,4,3,2,1', () => {
    const counts = [6, 7, 8, 9, 10, 11, 12].map((day) =>
      daysUntilNextMonday(new Date(`2026-07-${String(day).padStart(2, '0')}T12:00:00+03:00`)),
    )
    expect(counts).toEqual([7, 6, 5, 4, 3, 2, 1])
  })
  it('Sunday is 1 for its whole Cairo day, including the minutes that are Saturday in UTC', () => {
    expect(daysUntilNextMonday(new Date('2026-07-12T00:00:00+03:00'))).toBe(1) // 21:00Z Sat
    expect(daysUntilNextMonday(new Date('2026-07-12T23:59:00+03:00'))).toBe(1)
    expect(scheduleNextWeek(new Date('2026-07-12T00:00:00+03:00'))).toBe('2026-07-13T06:00:00.000Z')
  })
  it('Monday is 7 for its whole Cairo day, including the minutes that are Sunday in UTC', () => {
    expect(daysUntilNextMonday(new Date('2026-07-13T00:00:00+03:00'))).toBe(7) // 21:00Z Sun
    expect(daysUntilNextMonday(new Date('2026-07-13T23:59:00+03:00'))).toBe(7)
    expect(scheduleNextWeek(new Date('2026-07-13T00:00:00+03:00'))).toBe('2026-07-20T06:00:00.000Z')
  })
})

describe('cairoDateKey (B2)', () => {
  it('buckets on the Cairo calendar day, not the device day or UTC', () => {
    // 22:30 UTC on Sep 24 is already 01:30 on Sep 25 in Cairo (UTC+3).
    expect(cairoDateKey(new Date('2026-09-24T22:30:00Z'))).toBe('2026-09-25')
    expect(cairoDateKey(new Date('2026-09-24T20:30:00Z'))).toBe('2026-09-24')
  })
})

// T-4 (Polish E): the command bar turns a typed "10am" into an instant with these.
describe('Cairo wall-clock helpers', () => {
  it('reads the offset from the tz database: +180 in summer time, +120 after the October switch', () => {
    expect(cairoOffsetMinutes(new Date('2026-09-26T06:00:00Z'))).toBe(180)
    expect(cairoOffsetMinutes(new Date('2026-11-05T08:00:00Z'))).toBe(120)
  })

  it('turns a Cairo wall-clock time into its instant, with that date’s own offset', () => {
    expect(cairoWallTimeToIso(2026, 9, 26, 10, 0)).toBe('2026-09-26T07:00:00.000Z')
    expect(cairoWallTimeToIso(2026, 11, 5, 10, 0)).toBe('2026-11-05T08:00:00.000Z')
    expect(cairoWallTimeToIso(2026, 9, 27, 0, 30)).toBe('2026-09-26T21:30:00.000Z')
  })
})
