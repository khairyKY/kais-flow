import { describe, expect, it } from 'vitest'
import { daysFromToday, formatLastCompleted, formatNextDue, formatRecurrenceRule, getCadenceType } from './perennials'

// Zones are pinned per call, so the device's own zone never decides a day. 21:30Z on Mon 12 Oct 2026
// is already Tue 13 Oct 00:30 in Cairo (UTC+3) but still Mon 12 Oct 17:30 in New York (UTC-4).
const NOW = new Date('2026-10-12T21:30:00Z')
const CAIRO = 'Africa/Cairo'
const NY = 'America/New_York'

describe('Perennials days are the user’s, not the device’s', () => {
  it('counts calendar days in the given zone', () => {
    expect(daysFromToday('2026-10-12T20:00:00Z', NOW, CAIRO)).toBe(-1) // Cairo: 23:00 Mon, today is Tue
    expect(daysFromToday('2026-10-12T20:00:00Z', NOW, NY)).toBe(0)
    expect(daysFromToday('2026-11-01T10:00:00Z', NOW, CAIRO)).toBe(19) // across a month end
  })

  it('last done: today with the zone’s clock, yesterday, else the zone’s date', () => {
    expect(formatLastCompleted('2026-10-12T20:00:00Z', NOW, NY)).toBe('last done today 16:00')
    expect(formatLastCompleted('2026-10-12T20:00:00Z', NOW, CAIRO)).toBe('last done yesterday')
    expect(formatLastCompleted('2026-10-05T22:30:00Z', NOW, CAIRO)).toBe('last done Tue 06 Oct')
    expect(formatLastCompleted(null, NOW, CAIRO)).toBe('never done')
  })

  it('next due: today is urgent, then tomorrow, then the zone’s date', () => {
    expect(formatNextDue('2026-10-13T10:00:00Z', NOW, CAIRO)).toEqual({ text: 'Next: today', urgent: true })
    expect(formatNextDue('2026-10-13T10:00:00Z', NOW, NY)).toEqual({ text: 'Next: tomorrow', urgent: false })
    expect(formatNextDue('2026-10-15T23:00:00Z', NOW, CAIRO)).toEqual({ text: 'Next: Fri 16 Oct', urgent: false })
    expect(formatNextDue(null, NOW, CAIRO)).toEqual({ text: 'no date', urgent: false })
  })
})

describe('repeat rules', () => {
  it('groups by cadence and reads the rule', () => {
    expect(getCadenceType('FREQ=WEEKLY;BYDAY=MO')).toBe('weekly')
    expect(getCadenceType('FREQ=DAILY;INTERVAL=2')).toBe('custom')
    expect(formatRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,TH')).toBe('Every Mon, Thu')
    expect(formatRecurrenceRule('FREQ=MONTHLY;BYMONTHDAY=22')).toBe('Monthly on the 22nd')
  })
})
