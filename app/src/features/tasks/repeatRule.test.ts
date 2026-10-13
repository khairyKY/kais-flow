import { describe, expect, it } from 'vitest'
import { nextOccurrence } from './recurrence'
import { buildRule, parseRule, repeatStart, type RepeatSpec } from './repeatRule'
import { repeatLabel } from './taskSheetMath'

const CAIRO = 'Africa/Cairo'
// Monday 12 Oct 2026, 09:00 in Cairo (UTC+3).
const MON = new Date('2026-10-12T06:00:00Z')
const start = repeatStart(MON, CAIRO)
const spec = (over: Partial<RepeatSpec>): RepeatSpec => ({ ...parseRule(null, start, CAIRO), ...over })

describe('repeatStart', () => {
  it('reads the day, weekday and its place in the month on the user clock', () => {
    expect(start).toEqual({ date: '2026-10-12', weekday: 'MO', nth: 2 })
  })
  it('the last such weekday of the month is nth −1', () => {
    expect(repeatStart(new Date('2026-10-26T06:00:00Z'), CAIRO).nth).toBe(-1)
  })
  it('a late-evening UTC instant is already the next day in Tokyo', () => {
    expect(repeatStart(new Date('2026-10-12T20:00:00Z'), 'Asia/Tokyo')).toMatchObject({ date: '2026-10-13', weekday: 'TU' })
  })
})

describe('buildRule / parseRule', () => {
  it('no rule opens as weekly on the start day, which is plain FREQ=WEEKLY', () => {
    expect(parseRule(null, start, CAIRO)).toMatchObject({ unit: 'week', every: 1, days: ['MO'], ends: { by: 'never' } })
    expect(buildRule(parseRule(null, start, CAIRO), start, CAIRO)).toBe('FREQ=WEEKLY')
  })
  it('the presets round-trip unchanged (Custom… then Done changes nothing)', () => {
    for (const rule of ['FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY']) expect(buildRule(parseRule(rule, start, CAIRO), start, CAIRO)).toBe(rule)
  })
  it('every 2 weeks on Monday and Wednesday', () => {
    const rule = buildRule(spec({ unit: 'week', every: 2, days: ['WE', 'MO'] }), start, CAIRO)
    expect(rule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    expect(parseRule(rule, start, CAIRO)).toMatchObject({ unit: 'week', every: 2, days: ['MO', 'WE'] })
  })
  it('every 3 days', () => {
    expect(buildRule(spec({ unit: 'day', every: 3 }), start, CAIRO)).toBe('FREQ=DAILY;INTERVAL=3')
  })
  it('monthly on day 15, and on the start day as plain monthly', () => {
    expect(buildRule(spec({ unit: 'month', monthly: { by: 'day', day: 15 } }), start, CAIRO)).toBe('FREQ=MONTHLY;BYMONTHDAY=15')
    expect(buildRule(spec({ unit: 'month', monthly: { by: 'day', day: 12 } }), start, CAIRO)).toBe('FREQ=MONTHLY')
    expect(parseRule('FREQ=MONTHLY;BYMONTHDAY=15', start, CAIRO).monthly).toEqual({ by: 'day', day: 15 })
  })
  it('monthly on the 2nd Tuesday / the last Friday', () => {
    const second = buildRule(spec({ unit: 'month', monthly: { by: 'weekday', nth: 2, day: 'TU' } }), start, CAIRO)
    expect(second).toBe('FREQ=MONTHLY;BYDAY=+2TU')
    expect(parseRule(second, start, CAIRO).monthly).toEqual({ by: 'weekday', nth: 2, day: 'TU' })
    expect(buildRule(spec({ unit: 'month', monthly: { by: 'weekday', nth: -1, day: 'FR' } }), start, CAIRO)).toBe('FREQ=MONTHLY;BYDAY=-1FR')
  })
  it('ends after N times', () => {
    const rule = buildRule(spec({ unit: 'day', ends: { by: 'count', count: 5 } }), start, CAIRO)
    expect(rule).toBe('FREQ=DAILY;COUNT=5')
    expect(parseRule(rule, start, CAIRO).ends).toEqual({ by: 'count', count: 5 })
  })
  it('ends on a date = the last second of that day on the user clock, read back as the same day', () => {
    const cairo = buildRule(spec({ unit: 'day', ends: { by: 'date', date: '2026-12-31' } }), start, CAIRO)
    expect(cairo).toBe('FREQ=DAILY;UNTIL=20261231T215959Z')
    const la = buildRule(spec({ unit: 'day', ends: { by: 'date', date: '2026-12-31' } }), start, 'America/Los_Angeles')
    expect(la).toBe('FREQ=DAILY;UNTIL=20270101T075959Z')
    expect(parseRule(la, start, 'America/Los_Angeles').ends).toEqual({ by: 'date', date: '2026-12-31' })
  })
  it('the built rule drives the recurrence engine: Mon → Wed → next Mon (every 2 weeks: the Mon after)', () => {
    const weekly = buildRule(spec({ unit: 'week', days: ['MO', 'WE'] }), start, CAIRO)
    const wed = nextOccurrence(weekly, MON)!
    expect(wed.toISOString()).toBe('2026-10-14T06:00:00.000Z')
    expect(nextOccurrence(weekly, wed)!.toISOString()).toBe('2026-10-19T06:00:00.000Z')
  })
  it('a rule the editor cannot show opens as the default', () => {
    expect(parseRule('FREQ=HOURLY', start, CAIRO).unit).toBe('week')
    expect(parseRule('not a rule', start, CAIRO).unit).toBe('week')
  })
  it('yearly (p7e A13): an imported FREQ=YEARLY opens as yearly, every 2 years round-trips, and it lands a year on', () => {
    expect(parseRule('FREQ=YEARLY', start, CAIRO)).toMatchObject({ unit: 'year', every: 1 })
    expect(buildRule(spec({ unit: 'year', every: 2 }), start, CAIRO)).toBe('FREQ=YEARLY;INTERVAL=2')
    expect(nextOccurrence('FREQ=YEARLY', MON, CAIRO)!.toISOString()).toBe('2027-10-12T06:00:00.000Z')
    expect(repeatLabel('FREQ=YEARLY')).toBe('Yearly')
  })
})

describe('repeatLabel', () => {
  it('names custom rules in words, the end date on the user calendar', () => {
    expect(repeatLabel('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')).toBe('Every 2 weeks on Monday, Wednesday')
    expect(repeatLabel('FREQ=DAILY;UNTIL=20261231T215959Z')).toBe('Every day until Thu 31 Dec')
    expect(repeatLabel('FREQ=WEEKLY')).toBe('Weekly')
  })
})
