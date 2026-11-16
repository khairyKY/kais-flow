import { describe, expect, it } from 'vitest'
import { spansToday } from './spanLines'

const CAIRO = 'Africa/Cairo'
const row = (id: string, starts_at: string, ends_at: string, all_day = false) => ({ id, title: id, starts_at, ends_at, all_day, color: null })

describe('spansToday: "Trip · day 2 of 4"', () => {
  // Tue 7 Jul 2026, 11:00 Cairo
  const now = new Date('2026-07-07T08:00:00.000Z')

  it('an all-day trip covering today says which day it is', () => {
    expect(spansToday([row('Trip', '2026-07-06T00:00:00.000Z', '2026-07-10T00:00:00.000Z', true)], now, CAIRO)).toEqual([{ id: 'Trip', title: 'Trip', text: 'day 2 of 4', color: null }])
  })

  it('a conference Mon 09:00 – Wed 17:00 is day 2 of 3 on Tuesday', () => {
    expect(spansToday([row('Conf', '2026-07-06T06:00:00.000Z', '2026-07-08T14:00:00.000Z')], now, CAIRO)[0].text).toBe('day 2 of 3')
  })

  it('leaves out a one-day all-day event, a night event under 24 hours, a span that ended, and a deleted one', () => {
    expect(
      spansToday(
        [
          row('One day', '2026-07-07T00:00:00.000Z', '2026-07-08T00:00:00.000Z', true),
          row('Night', '2026-07-06T19:00:00.000Z', '2026-07-06T23:00:00.000Z'),
          row('Over', '2026-07-01T00:00:00.000Z', '2026-07-04T00:00:00.000Z', true),
          { ...row('Gone', '2026-07-06T00:00:00.000Z', '2026-07-10T00:00:00.000Z', true), deleted_at: '2026-07-06T10:00:00.000Z' },
        ],
        now,
        CAIRO,
      ),
    ).toEqual([])
  })

  it('the last day counts too, and the day after does not', () => {
    const trip = row('Trip', '2026-07-06T00:00:00.000Z', '2026-07-08T00:00:00.000Z', true) // Mon 6 – Tue 7
    expect(spansToday([trip], now, CAIRO)[0].text).toBe('day 2 of 2')
    expect(spansToday([trip], new Date('2026-07-08T08:00:00.000Z'), CAIRO)).toEqual([])
  })
})
