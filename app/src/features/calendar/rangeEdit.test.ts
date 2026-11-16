import { describe, expect, it } from 'vitest'
import { clampRange, DEFAULT_END, DEFAULT_START, moveStart, pickRange, resizeEdge, rangeLabel, rangeOf, setEnd, shiftDays, spansDays, storeRange, toggleAllDay } from './rangeEdit'

// F7. Explicit zones and exact instants, so these hold under every TZ the suite runs in.
const CAIRO = 'Africa/Cairo'
const LA = 'America/Los_Angeles'

const trip = { all_day: true, starts_at: '2026-07-06T00:00:00.000Z', ends_at: '2026-07-10T00:00:00.000Z' } // Mon 6 – Thu 9
const conf = { all_day: false, starts_at: '2026-07-06T06:00:00.000Z', ends_at: '2026-07-08T14:00:00.000Z' } // Mon 09:00 – Wed 17:00 Cairo

describe('rangeOf / storeRange', () => {
  it('an all-day event: its last day is included, the stored end is the day after', () => {
    const r = rangeOf(trip, CAIRO)
    expect(r).toMatchObject({ all_day: true, startDay: '2026-07-06', endDay: '2026-07-09' })
    expect(storeRange(r, CAIRO)).toEqual(trip)
  })

  it('a timed span round-trips on the user’s zone, in any zone', () => {
    expect(rangeOf(conf, CAIRO)).toEqual({ all_day: false, startDay: '2026-07-06', startTime: '09:00', endDay: '2026-07-08', endTime: '17:00' })
    expect(storeRange(rangeOf(conf, CAIRO), CAIRO)).toEqual(conf)
    expect(storeRange(rangeOf(conf, LA), LA)).toEqual(conf)
  })

  it('a night event: Mon 22:00 – Tue 02:00', () => {
    const night = { all_day: false, starts_at: '2026-07-06T19:00:00.000Z', ends_at: '2026-07-06T23:00:00.000Z' }
    const r = rangeOf(night, CAIRO)
    expect(r).toMatchObject({ startDay: '2026-07-06', startTime: '22:00', endDay: '2026-07-07', endTime: '02:00' })
    expect(spansDays(r)).toBe(true)
    expect(rangeLabel(r)).toMatch(/^Mon 6 \d.*– Tue 7 \d/)
  })
})

describe('the end can’t be before the start', () => {
  it('an all-day end before the first day lands on it', () => {
    expect(setEnd(rangeOf(trip, CAIRO), '2026-07-03', undefined, CAIRO)).toMatchObject({ startDay: '2026-07-06', endDay: '2026-07-06' })
  })

  it('a timed end before the start is pushed to a quarter hour after it', () => {
    const r = setEnd(rangeOf(conf, CAIRO), '2026-07-05', '08:00', CAIRO)
    expect(r).toMatchObject({ startDay: '2026-07-06', startTime: '09:00', endDay: '2026-07-06', endTime: '09:15' })
  })

  it('editing the end to 03:00 on a night event works', () => {
    const night = rangeOf({ all_day: false, starts_at: '2026-07-06T19:00:00.000Z', ends_at: '2026-07-06T23:00:00.000Z' }, CAIRO)
    expect(setEnd(night, '2026-07-07', '03:00', CAIRO)).toMatchObject({ endDay: '2026-07-07', endTime: '03:00' })
  })

  it('clampRange is idempotent', () => {
    const r = rangeOf(conf, CAIRO)
    expect(clampRange(r, CAIRO)).toEqual(r)
  })
})

describe('moveStart keeps the length', () => {
  it('an all-day trip moves with its days', () => {
    expect(moveStart(rangeOf(trip, CAIRO), '2026-07-13', undefined, CAIRO)).toMatchObject({ startDay: '2026-07-13', endDay: '2026-07-16' })
  })

  it('a timed span moves with its length', () => {
    expect(moveStart(rangeOf(conf, CAIRO), '2026-07-13', '10:00', CAIRO)).toMatchObject({ startDay: '2026-07-13', startTime: '10:00', endDay: '2026-07-15', endTime: '18:00' })
  })
})

describe('the all-day switch', () => {
  it('on keeps the dates; a timed range ending at midnight doesn’t touch the next day', () => {
    expect(toggleAllDay(rangeOf(conf, CAIRO), true, undefined, CAIRO)).toMatchObject({ all_day: true, startDay: '2026-07-06', endDay: '2026-07-08' })
    const toMidnight = rangeOf({ all_day: false, starts_at: '2026-07-06T06:00:00.000Z', ends_at: '2026-07-07T21:00:00.000Z' }, CAIRO) // → Wed 00:00 Cairo
    expect(toggleAllDay(toMidnight, true, undefined, CAIRO)).toMatchObject({ startDay: '2026-07-06', endDay: '2026-07-07' })
  })

  it('off gives 09:00–10:00 on the first day, or the times it remembers', () => {
    const off = toggleAllDay(rangeOf(trip, CAIRO), false, undefined, CAIRO)
    expect(off).toEqual({ all_day: false, startDay: '2026-07-06', startTime: DEFAULT_START, endDay: '2026-07-06', endTime: DEFAULT_END })
    expect(toggleAllDay(rangeOf(trip, CAIRO), false, { startTime: '13:30', endTime: '15:00' }, CAIRO)).toMatchObject({ startTime: '13:30', endTime: '15:00', endDay: '2026-07-06' })
  })

  it('a no-op switch changes nothing', () => {
    const r = rangeOf(trip, CAIRO)
    expect(toggleAllDay(r, true)).toBe(r)
  })
})

describe('shiftDays — the band’s drag and resize', () => {
  it('all-day: by dates', () => {
    expect(shiftDays('2026-07-06T00:00:00.000Z', 3, true)).toBe('2026-07-09T00:00:00.000Z')
    expect(shiftDays('2026-07-09T00:00:00.000Z', -3, true)).toBe('2026-07-06T00:00:00.000Z')
  })

  it('timed: the wall clock stays across Cairo’s DST change (Fri 24 Apr 2026, UTC+2 → UTC+3)', () => {
    // Thu 23 Apr 09:00 Cairo (UTC+2 = 07:00Z) + 3 days = Sun 26 Apr 09:00 Cairo (UTC+3 = 06:00Z)
    expect(shiftDays('2026-04-23T07:00:00.000Z', 3, false, CAIRO)).toBe('2026-04-26T06:00:00.000Z')
    expect(shiftDays('2026-04-26T06:00:00.000Z', -3, false, CAIRO)).toBe('2026-04-23T07:00:00.000Z')
  })
})

describe('rangeLabel', () => {
  it('an all-day trip reads "Mon 6 – Thu 9", a one-day one just its day', () => {
    expect(rangeLabel(rangeOf(trip, CAIRO))).toBe('Mon 6 – Thu 9')
    expect(rangeLabel(rangeOf({ ...trip, ends_at: '2026-07-07T00:00:00.000Z' }, CAIRO))).toBe('Mon 6')
  })
})

describe('pickRange — what the date picker hands back', () => {
  it('all-day: a date key', () => {
    expect(pickRange(rangeOf(trip, CAIRO), 'end', '2026-07-10', undefined, CAIRO)).toMatchObject({ endDay: '2026-07-10' }) // resize to Fri
    expect(pickRange(rangeOf(trip, CAIRO), 'start', '2026-07-07', undefined, CAIRO)).toMatchObject({ startDay: '2026-07-07', endDay: '2026-07-10' })
  })

  it('timed: a day alone keeps the time of day, a Set-time pick brings its own', () => {
    const r = rangeOf(conf, CAIRO)
    const at = (day: string, time: string) => storeRange({ ...r, startDay: day, startTime: time }, CAIRO).starts_at
    expect(pickRange(r, 'end', at('2026-07-09', '09:00'), false, CAIRO)).toMatchObject({ endDay: '2026-07-09', endTime: '17:00' })
    expect(pickRange(r, 'end', at('2026-07-09', '12:30'), true, CAIRO)).toMatchObject({ endDay: '2026-07-09', endTime: '12:30' })
  })
})

describe('resizeEdge: the band grips', () => {
  it('the end grows to Fri and shrinks back; the start moves earlier', () => {
    const r = rangeOf(trip, CAIRO)
    expect(resizeEdge(r, 'end', 1, CAIRO)).toMatchObject({ startDay: '2026-07-06', endDay: '2026-07-10' })
    expect(resizeEdge(r, 'end', -2, CAIRO)).toMatchObject({ endDay: '2026-07-07' })
    expect(resizeEdge(r, 'start', -1, CAIRO)).toMatchObject({ startDay: '2026-07-05', endDay: '2026-07-09' })
  })

  it('can not be dragged past the other end', () => {
    const r = rangeOf(trip, CAIRO)
    expect(resizeEdge(r, 'end', -9, CAIRO)).toMatchObject({ startDay: '2026-07-06', endDay: '2026-07-06' })
    expect(resizeEdge(r, 'start', 9, CAIRO)).toMatchObject({ startDay: '2026-07-09', endDay: '2026-07-09' })
  })

  it('a timed span keeps its times of day', () => {
    expect(resizeEdge(rangeOf(conf, CAIRO), 'end', 1, CAIRO)).toMatchObject({ endDay: '2026-07-09', endTime: '17:00', startTime: '09:00' })
  })
})
