import { describe, expect, it } from 'vitest'
import { aggregateCompletionRate, completionRate, computeGraceStreak, computeStreak, computeTrellisDays, dailyCompletionRatios, localDateKey, streakRiskMessage } from './streaks'
import type { Cadence, Routine, RoutineCompletion } from '../../lib/types'

const DAILY: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const NEVER: Cadence = { weekdays: [] }
// Fixed "now" for the rate/sparkline/risk tests below: Wed 2026-07-08, mid-afternoon local —
// same fixed-date convention grouping.test.ts uses.
const NOW = new Date('2026-07-08T15:00:00')

function dayKey(offset: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return localDateKey(d)
}

function routine(over: Partial<Routine>): Routine {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: 'Routine',
    time_of_day: null,
    clock_time: null,
    cadence: DAILY,
    challenge_start: null,
    challenge_end: null,
    active: true,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function completionsFor(routineId: string, dateKeys: string[]): RoutineCompletion[] {
  return dateKeys.map((d) => ({ id: crypto.randomUUID(), routine_id: routineId, completed_on: d, created_at: '' }))
}

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

  it('forgives one missed day per calendar month (Gentle Rain) — the run holds across it', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [0, 1, 3, 4, 5].map((n) => localDateKey(addDays(today, -n))) // gap at -2
    const { current, best } = computeStreak(dates, DAILY, today)
    expect(current).toBe(5) // the miss rained; 5 completed days count
    expect(best).toBe(5)
  })

  it('breaks on the second miss in the same calendar month', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [0, 1, 4, 5].map((n) => localDateKey(addDays(today, -n))) // misses at -2 and -3
    const { current } = computeStreak(dates, DAILY, today)
    expect(current).toBe(2) // today + yesterday; -2 rained, -3 snapped it
  })

  it('computeStreak.current and computeGraceStreak.current are the same number (one algorithm)', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [0, 1, 3, 4, 5, 6, 8].map((n) => localDateKey(addDays(today, -n)))
    expect(computeStreak(dates, DAILY, today).current).toBe(computeGraceStreak(dates, DAILY, today).current)
  })

  it('best is never smaller than current', () => {
    const today = new Date(2026, 6, 10, 9, 0, 0)
    const dates = [0, 1, 3, 4, 5].map((n) => localDateKey(addDays(today, -n)))
    const { current, best } = computeStreak(dates, DAILY, today)
    expect(best).toBeGreaterThanOrEqual(current)
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

describe('completionRate', () => {
  it('rounds completed/scheduled over the trailing window, today inclusive', () => {
    // 7-day window = offsets -6..0 (7 days). Complete 5, miss 2.
    const completed = [dayKey(-6), dayKey(-5), dayKey(-4), dayKey(-3), dayKey(0)]
    expect(completionRate(completed, DAILY, 7, NOW)).toBe(Math.round((5 / 7) * 100))
  })

  it('returns 0 (not NaN) when the cadence never schedules a day in the window', () => {
    expect(completionRate([], NEVER, 7, NOW)).toBe(0)
  })

  it('returns 100 when every scheduled day in the window was completed', () => {
    const completed = [dayKey(-6), dayKey(-5), dayKey(-4), dayKey(-3), dayKey(-2), dayKey(-1), dayKey(0)]
    expect(completionRate(completed, DAILY, 7, NOW)).toBe(100)
  })
})

describe('aggregateCompletionRate', () => {
  it('sums scheduled/done across routines before dividing (weighted, not averaged)', () => {
    const daily = routine({ id: 'daily', cadence: DAILY })
    const weekdayOnly = routine({ id: 'weekday', cadence: { weekdays: [1, 2, 3, 4, 5] } })
    // daily: 7 scheduled days in window, complete all 7. weekdayOnly: fewer scheduled days,
    // complete none. A naive average of the two routines' own rates would be 50%.
    const completions = completionsFor('daily', [dayKey(-6), dayKey(-5), dayKey(-4), dayKey(-3), dayKey(-2), dayKey(-1), dayKey(0)])
    const rate = aggregateCompletionRate([daily, weekdayOnly], completions, 7, NOW)
    expect(rate).toBeGreaterThan(50)
    expect(rate).toBeLessThan(100)
  })

  it('returns 0 for an empty routine list', () => {
    expect(aggregateCompletionRate([], [], 7, NOW)).toBe(0)
  })
})

describe('dailyCompletionRatios', () => {
  it('returns one ratio per day, oldest first, fixed length', () => {
    expect(dailyCompletionRatios([routine({ cadence: DAILY })], [], 14, NOW)).toHaveLength(14)
  })

  it('a day with nothing scheduled reads as 0, not skipped', () => {
    expect(dailyCompletionRatios([routine({ cadence: NEVER })], [], 3, NOW)).toEqual([0, 0, 0])
  })

  it('computes the fraction of scheduled routines done on the most recent day', () => {
    const r1 = routine({ id: 'r1', cadence: DAILY })
    const r2 = routine({ id: 'r2', cadence: DAILY })
    const completions = completionsFor('r1', [dayKey(0)])
    expect(dailyCompletionRatios([r1, r2], completions, 1, NOW)).toEqual([0.5])
  })
})

describe('computeTrellisDays', () => {
  it("draws today's leaf the moment today is completed", () => {
    const days = computeTrellisDays([dayKey(0)], DAILY, 3, NOW)
    expect(days[2].state).toBe('grew')
  })

  it("today scheduled but not yet done stays 'off' — never a miss while the day is open", () => {
    const days = computeTrellisDays([dayKey(-1)], DAILY, 3, NOW)
    expect(days[2].state).toBe('off')
    expect(days[1].state).toBe('grew')
  })
})

describe('streakRiskMessage', () => {
  it('flags a scheduled-today routine with an active streak not yet done today', () => {
    const r = routine({ name: 'Meditate', cadence: DAILY })
    const completions = completionsFor(r.id, [dayKey(-1), dayKey(-2), dayKey(-3)])
    const msg = streakRiskMessage([r], completions, NOW)
    expect(msg).toContain('Meditate')
    expect(msg).toContain('3-day')
  })

  it('returns null once the routine is already done today', () => {
    const r = routine({ name: 'Meditate', cadence: DAILY })
    const completions = completionsFor(r.id, [dayKey(-1), dayKey(0)])
    expect(streakRiskMessage([r], completions, NOW)).toBeNull()
  })

  it('returns null when nothing is scheduled today', () => {
    const r = routine({ name: 'Weekly review', cadence: { weekdays: [1] } }) // Monday only; NOW is Wednesday
    expect(streakRiskMessage([r], [], NOW)).toBeNull()
  })

  it('returns null when there is no streak to lose', () => {
    expect(streakRiskMessage([routine({ name: 'Fresh habit', cadence: DAILY })], [], NOW)).toBeNull()
  })
})
