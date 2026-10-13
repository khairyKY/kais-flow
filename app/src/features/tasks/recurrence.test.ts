import { describe, expect, it } from 'vitest'
import { nextDue, nextOccurrence, nextReminderAt } from './recurrence'

describe('nextOccurrence', () => {
  it('advances FREQ=DAILY by one calendar day', () => {
    const from = new Date(2026, 6, 4, 15, 0, 0)
    const next = nextOccurrence('FREQ=DAILY', from)
    expect(next).not.toBeNull()
    expect(next!.getFullYear()).toBe(2026)
    expect(next!.getMonth()).toBe(6)
    expect(next!.getDate()).toBe(5)
  })

  it('advances FREQ=WEEKLY by 7 days, same weekday', () => {
    const from = new Date(2026, 6, 4, 15, 0, 0) // Saturday
    const next = nextOccurrence('FREQ=WEEKLY', from)
    expect(next).not.toBeNull()
    expect(next!.getDay()).toBe(from.getDay())
    const diffDays = Math.round((next!.getTime() - from.getTime()) / 86_400_000)
    expect(diffDays).toBe(7)
  })

  it('FREQ=MONTHLY from a 31st skips months without a 31st day (RFC 5545 behavior)', () => {
    const from = new Date(2026, 0, 31, 9, 0, 0) // Jan 31, 2026
    const next = nextOccurrence('FREQ=MONTHLY', from)
    expect(next).not.toBeNull()
    // Should NOT be clamped to Feb 28 — RFC 5545 skips invalid dates entirely.
    // Confirms which month actually comes back so this documents real library behavior.
    expect(next!.getDate()).toBe(31)
    expect(next!.getMonth()).not.toBe(1) // not February
  })

  it('crosses a DST transition without losing a calendar day (checked by date parts, not raw ms)', () => {
    // 2026-03-08 is a US DST start date; regardless of the test runner's system timezone,
    // asserting on date components (not elapsed milliseconds) is what makes this DST-safe.
    const from = new Date(2026, 2, 7, 15, 0, 0) // Mar 7, 2026
    const next = nextOccurrence('FREQ=DAILY', from)
    expect(next).not.toBeNull()
    expect(next!.getMonth()).toBe(2)
    expect(next!.getDate()).toBe(8)
  })

  it('returns null for a rule with no further occurrences (COUNT=1)', () => {
    const from = new Date(2026, 6, 4, 15, 0, 0)
    const next = nextOccurrence('FREQ=DAILY;COUNT=1', from)
    expect(next).toBeNull()
  })
})

describe('nextOccurrence on the user wall clock (not UTC)', () => {
  it('a daily 09:00 Cairo task stays 09:00 across the October DST change', () => {
    // Egypt leaves UTC+3 for UTC+2 at the end of Thu 29 Oct 2026.
    expect(nextOccurrence('FREQ=DAILY', new Date('2026-10-29T06:00:00Z'), 'Africa/Cairo')!.toISOString()).toBe('2026-10-30T07:00:00.000Z')
    // …and across April's change the other way (UTC+2 → UTC+3 on Fri 24 Apr).
    expect(nextOccurrence('FREQ=DAILY', new Date('2026-04-23T07:00:00Z'), 'Africa/Cairo')!.toISOString()).toBe('2026-04-24T06:00:00.000Z')
  })
  it('a daily 09:00 Los Angeles task stays 09:00 across November’s change', () => {
    expect(nextOccurrence('FREQ=DAILY', new Date('2026-10-31T16:00:00Z'), 'America/Los_Angeles')!.toISOString()).toBe('2026-11-01T17:00:00.000Z')
  })
  it('BYDAY reads the user’s weekday: Monday 08:00 in Tokyo is a UTC Sunday', () => {
    const monTokyo = new Date('2026-10-11T23:00:00Z') // Mon 12 Oct 08:00 JST
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO', monTokyo, 'Asia/Tokyo')!.toISOString()).toBe('2026-10-18T23:00:00.000Z')
  })
  it('UNTIL is honoured', () => {
    expect(nextOccurrence('FREQ=DAILY;UNTIL=20261012T235959Z', new Date('2026-10-12T06:00:00Z'), 'Africa/Cairo')).toBeNull()
  })
})

describe('nextDue — a repeat rolls from the later of its due date and today', () => {
  const zones = ['UTC', 'Africa/Cairo', 'America/Los_Angeles', 'Asia/Tokyo']
  it.each(zones)('a daily task due 09:00 five days ago, done today, comes back tomorrow 09:00 (%s)', (zone) => {
    // 09:00 on `day` Oct in `zone`, as an instant (found by search, so no offset is hard-coded).
    const wall9 = (day: number) => {
      for (let h = -14; h <= 14; h++) {
        const t = new Date(Date.UTC(2026, 9, day, 9 - h))
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: 'numeric', day: 'numeric' }).formatToParts(t)
        if (Number(parts.find((p) => p.type === 'hour')!.value) === 9 && Number(parts.find((p) => p.type === 'day')!.value) === day) return t
      }
      throw new Error('no 09:00')
    }
    const next = nextDue('FREQ=DAILY', wall9(7).toISOString(), new Date(wall9(12).getTime() + 3_600_000), zone)
    expect(next!.toISOString()).toBe(wall9(13).toISOString())
  })
  it('a weekly series keeps its weekday when it rolls (Sat/Tue, done late on a Thursday → Saturday)', () => {
    const next = nextDue('FREQ=WEEKLY;BYDAY=SA,TU', '2026-09-26T06:00:00Z', new Date('2026-10-08T07:00:00Z'), 'Africa/Cairo')
    expect(next!.toISOString()).toBe('2026-10-10T06:00:00.000Z')
  })
  it('done early, it still rolls from the due date', () => {
    expect(nextDue('FREQ=DAILY', '2026-10-20T06:00:00Z', new Date('2026-10-12T07:00:00Z'), 'Africa/Cairo')!.toISOString()).toBe('2026-10-21T06:00:00.000Z')
  })
  it('done on its day, before its time, the next is the next day', () => {
    expect(nextDue('FREQ=DAILY', '2026-10-12T15:00:00Z', new Date('2026-10-12T07:00:00Z'), 'Africa/Cairo')!.toISOString()).toBe('2026-10-13T15:00:00.000Z')
  })
})

describe('nextReminderAt (Polish F2a: a repeat keeps reminding)', () => {
  const due = '2026-09-26T06:00:00.000Z' // Sat 09:00 Cairo
  const nextDue = new Date('2026-09-29T06:00:00.000Z') // Tue 09:00 Cairo

  it('keeps the same lead before the new due time (15 min before stays 15 min before)', () => {
    expect(nextReminderAt('2026-09-26T05:45:00.000Z', due, nextDue)).toBe('2026-09-29T05:45:00.000Z')
  })
  it('a reminder at the due time stays at the new due time', () => {
    expect(nextReminderAt(due, due, nextDue)).toBe(nextDue.toISOString())
  })
  it('a day-before reminder stays a day before', () => {
    expect(nextReminderAt('2026-09-25T06:00:00.000Z', due, nextDue)).toBe('2026-09-28T06:00:00.000Z')
  })
  it('a reminder set after the due time stays after the new one', () => {
    expect(nextReminderAt('2026-09-26T06:30:00.000Z', due, nextDue)).toBe('2026-09-29T06:30:00.000Z')
  })
  it("reads the server's timestamp format (+00:00) the same", () => {
    expect(nextReminderAt('2026-09-26T05:45:00+00:00', '2026-09-26T06:00:00+00:00', nextDue)).toBe('2026-09-29T05:45:00.000Z')
  })
  it('no reminder on the original → none on the next occurrence', () => {
    expect(nextReminderAt(null, due, nextDue)).toBeNull()
  })
})
