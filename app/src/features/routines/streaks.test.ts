import { describe, expect, it } from 'vitest'
import { computeStreak, localDateKey } from './streaks'
import type { Cadence } from '../../lib/types'

const DAILY: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6] }

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

describe('computeStreak', () => {
  it('counts a run of consecutive daily completions ending today', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [0, 1, 2, 3, 4].map((n) => localDateKey(addDays(today, -n)))
    const { current, best } = computeStreak(dates, DAILY, today)
    expect(current).toBe(5)
    expect(best).toBe(5)
  })

  it("doesn't break the streak if today is scheduled but not completed yet", () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [1, 2, 3].map((n) => localDateKey(addDays(today, -n))) // not today
    const { current } = computeStreak(dates, DAILY, today)
    expect(current).toBe(3)
  })

  it('breaks the current streak at a gap but still finds the prior run as best', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [0, 1, 3, 4, 5].map((n) => localDateKey(addDays(today, -n))) // gap at -2
    const { current, best } = computeStreak(dates, DAILY, today)
    expect(current).toBe(2) // today + yesterday
    expect(best).toBe(3) // the -3,-4,-5 run
  })

  it('skips non-scheduled days without breaking the streak (arbitrary off-days)', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const offDays = [addDays(today, -2).getDay(), addDays(today, -3).getDay()]
    const cadence: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => !offDays.includes(w)) }
    const dates: string[] = []
    for (let n = 5; n >= 0; n--) {
      const d = addDays(today, -n)
      if (cadence.weekdays.includes(d.getDay())) dates.push(localDateKey(d))
    }
    const { current } = computeStreak(dates, cadence, today)
    const scheduledCount = [0, 1, 2, 3, 4, 5].filter((n) =>
      cadence.weekdays.includes(addDays(today, -n).getDay()),
    ).length
    expect(current).toBe(scheduledCount)
  })

  it('a missed off-cadence day does not count as a gap even if unmarked', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const offDay = addDays(today, -1).getDay()
    const cadence: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => w !== offDay) }
    // complete today and the day before the off-day, but never touch the off-day itself
    const dates = [0, 2].map((n) => localDateKey(addDays(today, -n)))
    const { current } = computeStreak(dates, cadence, today)
    expect(current).toBe(2)
  })

  it('handles a month boundary correctly (Jan 30/31 -> Feb 1/2)', () => {
    const today = new Date(2026, 1, 2, 9, 0, 0) // Feb 2, 2026
    const dates = [0, 1, 2, 3].map((n) => localDateKey(addDays(today, -n)))
    const { current, best } = computeStreak(dates, DAILY, today)
    expect(current).toBe(4)
    expect(best).toBe(4)
  })

  it('finds the best streak even when it is not the current one', () => {
    const today = new Date(2026, 6, 20, 9, 0, 0)
    const longRun = [15, 14, 13, 12, 11, 10, 9, 8].map((n) => localDateKey(addDays(today, -n)))
    const recentRun = [0, 1].map((n) => localDateKey(addDays(today, -n)))
    const { current, best } = computeStreak([...longRun, ...recentRun], DAILY, today)
    expect(current).toBe(2)
    expect(best).toBe(8)
  })

  it('local date keys are stable near midnight (the classic streak timezone bug)', () => {
    const lateNight = new Date(2026, 6, 4, 23, 45, 0)
    expect(localDateKey(lateNight)).toBe('2026-07-04')
    const justAfterMidnight = new Date(2026, 6, 5, 0, 15, 0)
    expect(localDateKey(justAfterMidnight)).toBe('2026-07-05')
  })

  it('returns zeros for an empty history', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    expect(computeStreak([], DAILY, today)).toEqual({ current: 0, best: 0 })
  })
})
