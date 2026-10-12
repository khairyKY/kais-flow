import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aggregateCompletionRate, challengeDays, completionRate, computeGraceStreak, computeStreak, computeTrellisDays, dailyCompletionRatios, localDateKey, routineStartKey, routineStreak, routinesForToday, streakOfGoal, todayTally } from './streaks'
import { addDays, weekday } from '../../components/pickerMath'
import { setAppZone } from '../../lib/appZone'
import { zoneWallTimeToIso } from '../../lib/dateShortcuts'
import type { Cadence, Routine, RoutineCompletion } from '../../lib/types'

const DAILY: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const NEVER: Cadence = { weekdays: [] }

// Routine days are the USER's days (app_settings.timezone), whatever zone the device — or this
// suite's TZ=… run — is in. The tests pin the user's zone and build instants on its clock, so
// they mean the same thing under UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo.
beforeEach(() => setAppZone('Africa/Cairo'))
afterEach(() => setAppZone('Africa/Cairo'))

/** `hh:mm` on the user's (Cairo's) clock on day `key`. */
function at(key: string, hh = 9, mm = 0): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(zoneWallTimeToIso('Africa/Cairo', y, m, d, hh, mm))
}

// Fixed "now" for the rate/sparkline/risk tests below: Wed 2026-07-08, mid-afternoon on the
// user's clock — same fixed-date convention grouping.test.ts uses.
const TODAY = '2026-07-08'
const NOW = at(TODAY, 15)

function dayKey(offset: number): string {
  return addDays(TODAY, offset)
}

/** Keys `n` days before `key`, for each n. */
const back = (key: string, ns: number[]) => ns.map((n) => addDays(key, -n))

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

describe('computeStreak', () => {
  const D = '2026-07-10'
  const today = at(D)

  it('counts a run of consecutive daily completions ending today', () => {
    const { current, best } = computeStreak(back(D, [0, 1, 2, 3, 4]), DAILY, today)
    expect(current).toBe(5)
    expect(best).toBe(5)
  })

  it("doesn't break the streak if today is scheduled but not completed yet", () => {
    const { current } = computeStreak(back(D, [1, 2, 3]), DAILY, today) // not today
    expect(current).toBe(3)
  })

  it('forgives one missed day per calendar month (Gentle Rain) — the run holds across it', () => {
    const { current, best } = computeStreak(back(D, [0, 1, 3, 4, 5]), DAILY, today) // gap at -2
    expect(current).toBe(5) // the miss rained; 5 completed days count
    expect(best).toBe(5)
  })

  it('breaks on the second miss in the same calendar month', () => {
    const { current } = computeStreak(back(D, [0, 1, 4, 5]), DAILY, today) // misses at -2 and -3
    expect(current).toBe(2) // today + yesterday; -2 rained, -3 snapped it
  })

  it('computeStreak.current and computeGraceStreak.current are the same number (one algorithm)', () => {
    const dates = back(D, [0, 1, 3, 4, 5, 6, 8])
    expect(computeStreak(dates, DAILY, today).current).toBe(computeGraceStreak(dates, DAILY, today).current)
  })

  it('best is never smaller than current', () => {
    const { current, best } = computeStreak(back(D, [0, 1, 3, 4, 5]), DAILY, today)
    expect(best).toBeGreaterThanOrEqual(current)
  })

  it('skips non-scheduled days without breaking the streak (arbitrary off-days)', () => {
    const offDays = [weekday(addDays(D, -2)), weekday(addDays(D, -3))]
    const cadence: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => !offDays.includes(w)) }
    const dates = back(D, [5, 4, 3, 2, 1, 0]).filter((k) => cadence.weekdays.includes(weekday(k)))
    const { current } = computeStreak(dates, cadence, today)
    expect(current).toBe(dates.length)
  })

  it('a missed off-cadence day does not count as a gap even if unmarked', () => {
    const offDay = weekday(addDays(D, -1))
    const cadence: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => w !== offDay) }
    // complete today and the day before the off-day, but never touch the off-day itself
    const { current } = computeStreak(back(D, [0, 2]), cadence, today)
    expect(current).toBe(2)
  })

  it('handles a month boundary correctly (Jan 30/31 -> Feb 1/2)', () => {
    const { current, best } = computeStreak(back('2026-02-02', [0, 1, 2, 3]), DAILY, at('2026-02-02'))
    expect(current).toBe(4)
    expect(best).toBe(4)
  })

  it('finds the best streak even when it is not the current one', () => {
    const D20 = '2026-07-20'
    const { current, best } = computeStreak([...back(D20, [15, 14, 13, 12, 11, 10, 9, 8]), ...back(D20, [0, 1])], DAILY, at(D20))
    expect(current).toBe(2)
    expect(best).toBe(8)
  })

  it('returns zeros for an empty history', () => {
    expect(computeStreak([], DAILY, today)).toEqual({ current: 0, best: 0 })
  })
})

// The day a routine is checked off on, and every streak walk, is the user's (app_settings
// .timezone) — not the device's. The suite runs under four device zones; these pin the user's.
describe("routine days are the user's days, not the device's", () => {
  it('one instant is a different day key in different user zones (the midnight bug)', () => {
    const instant = new Date('2026-07-04T21:30:00Z')
    setAppZone('Africa/Cairo') // 00:30 on the 5th
    expect(localDateKey(instant)).toBe('2026-07-05')
    setAppZone('America/Los_Angeles') // 14:30 on the 4th
    expect(localDateKey(instant)).toBe('2026-07-04')
    setAppZone('Asia/Tokyo') // 06:30 on the 5th
    expect(localDateKey(instant)).toBe('2026-07-05')
    setAppZone('UTC')
    expect(localDateKey(instant)).toBe('2026-07-04')
  })

  // Across both DST ends that fall in this window: Cairo's (last Thu of Oct, 2026-10-29) and the
  // US one (2026-11-01). A walk over day keys never skips or doubles the switch day.
  for (const zone of ['UTC', 'Africa/Cairo', 'America/Los_Angeles', 'Asia/Tokyo']) {
    it(`a daily streak across the DST switches is the same count in ${zone}`, () => {
      setAppZone(zone)
      const dates = back('2026-11-03', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) // Nov 3 … Oct 25
      const justAfterMidnight = new Date(zoneWallTimeToIso(zone, 2026, 11, 3, 0, 30))
      const lateTheNightBefore = new Date(zoneWallTimeToIso(zone, 2026, 11, 2, 23, 30))
      expect(localDateKey(justAfterMidnight)).toBe('2026-11-03')
      expect(localDateKey(lateTheNightBefore)).toBe('2026-11-02')
      expect(computeStreak(dates, DAILY, justAfterMidnight)).toEqual({ current: 10, best: 10 })
      // the night before, "tomorrow's" check-off doesn't exist yet: Oct 25 … Nov 2
      expect(computeStreak(dates.slice(1), DAILY, lateTheNightBefore).current).toBe(9)
      // a weekly cadence reads its weekday from the key: Mondays Oct 26 + Nov 2
      const mondays: Cadence = { weekdays: [1] }
      expect(computeStreak(['2026-10-26', '2026-11-02'], mondays, justAfterMidnight).current).toBe(2)
      expect(computeTrellisDays(dates, DAILY, 10, justAfterMidnight).map((d) => d.key)).toEqual([...dates].reverse())
    })
  }
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

  // Polish D: Weekly Review's "Routine consistency · last 30 days" row for a routine planted
  // three days ago and tended every day since read 10% (27 pre-planting days counted as misses).
  it('with `since`, days before the routine was planted are not counted against it', () => {
    const tended = [dayKey(-3), dayKey(-2), dayKey(-1)]
    const since = routineStartKey(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), tended)
    expect(completionRate(tended, DAILY, 30, NOW)).toBe(10) // the old reading: 3 of 30
    expect(completionRate(tended, DAILY, 30, NOW, since)).toBe(75) // 3 of 4 (today still open)
    // …and the trellis beside it agrees: nothing before `since` reads as rain or a break.
    const cells = computeTrellisDays(tended, DAILY, 30, NOW, since)
    expect(cells.slice(0, 26).every((c) => c.state === 'off')).toBe(true)
    expect(cells.slice(26).map((c) => c.state)).toEqual(['grew', 'grew', 'grew', 'off'])
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

// ── Polish B (audit-newuser, "Create routine"): a brand-new routine must start honest. NOW is
// Wed 2026-07-08; "planted today" = created_at at NOW. ──
const PLANTED_TODAY = NOW.toISOString()
const MON_WED_FRI: Cadence = { weekdays: [1, 3, 5] }
const MON_FRI: Cadence = { weekdays: [1, 5] } // not scheduled on NOW (a Wednesday)

describe('routineStreak — new vs lost', () => {
  it('a routine planted today with no history reads new, not lost', () => {
    expect(routineStreak([], DAILY, NOW)).toEqual({ current: 0, best: 0, status: 'new' })
  })

  it('a routine never tended (even weeks after planting) reads new — there was nothing to lose', () => {
    expect(routineStreak([], MON_WED_FRI, NOW).status).toBe('new')
  })

  it('a genuinely broken streak still reads lost', () => {
    const today = at('2026-07-20') // Mon Jul 20
    // tended Jul 8–14 (7 days), then missed Jul 15–19: the 19th rains, the 18th snaps it
    const dates = back('2026-07-20', [12, 11, 10, 9, 8, 7, 6])
    const s = routineStreak(dates, DAILY, today)
    expect(s.current).toBe(0)
    expect(s.best).toBe(7)
    expect(s.status).toBe('lost')
  })

  it('a live streak reads growing', () => {
    expect(routineStreak([dayKey(-1), dayKey(-2)], DAILY, NOW)).toEqual({ current: 2, best: 2, status: 'growing' })
  })

  it('checking off a brand-new routine today starts it growing at 1', () => {
    expect(routineStreak([dayKey(0)], DAILY, NOW)).toMatchObject({ current: 1, status: 'growing' })
  })
})

describe('todayTally — only routines whose day it is count', () => {
  it('a routine planted today and scheduled today is one left', () => {
    const r = routine({ cadence: DAILY, created_at: PLANTED_TODAY })
    expect(todayTally([r], [], NOW)).toEqual({ due: 1, done: 0, remaining: 1 })
  })

  it('a routine not scheduled today is not left before the day is done', () => {
    const r = routine({ cadence: MON_FRI, created_at: PLANTED_TODAY })
    expect(todayTally([r], [], NOW)).toEqual({ due: 0, done: 0, remaining: 0 })
  })

  it('mixes: done-today + open-today count, a resting one does not', () => {
    const doneOne = routine({ id: 'done', cadence: DAILY })
    const openOne = routine({ id: 'open', cadence: DAILY })
    const resting = routine({ id: 'resting', cadence: MON_FRI })
    const completions = completionsFor('done', [dayKey(0)])
    expect(todayTally([doneOne, openOne, resting], completions, NOW)).toEqual({ due: 2, done: 1, remaining: 1 })
  })

  it('a resting-day routine checked off anyway counts as tended, so done never exceeds due', () => {
    const r = routine({ id: 'bonus', cadence: MON_FRI })
    expect(todayTally([r], completionsFor('bonus', [dayKey(0)]), NOW)).toEqual({ due: 1, done: 1, remaining: 0 })
  })

  it('ignores archived routines and completions from other days', () => {
    const archived = routine({ id: 'arch', cadence: DAILY, active: false })
    const r = routine({ id: 'live', cadence: DAILY })
    expect(todayTally([archived, r], completionsFor('live', [dayKey(-1)]), NOW)).toEqual({ due: 1, done: 0, remaining: 1 })
  })
})

// Polish D: Today's rail lists routinesForToday under a todayTally header — the audit saw
// "Routines · 1/5" over five rows on a Saturday while Routines said "1 of 3".
describe('routinesForToday — the rows under the todayTally header', () => {
  const SUNDAY_ONLY: Cadence = { weekdays: [0] }
  const mixed = [
    routine({ id: 'daily', cadence: DAILY }),
    routine({ id: 'mwf', cadence: MON_WED_FRI }), // Wednesday is its day
    routine({ id: 'sunday', cadence: SUNDAY_ONLY }), // rests on a Wednesday
    routine({ id: 'monfri', cadence: MON_FRI }), // rests, but checked off anyway today
    routine({ id: 'archived', cadence: DAILY, active: false }),
  ]
  const completions = [...completionsFor('daily', [dayKey(0)]), ...completionsFor('monfri', [dayKey(0)]), ...completionsFor('sunday', [dayKey(-3)])]

  it('keeps the routines scheduled today plus any checked off today, in their order', () => {
    expect(routinesForToday(mixed, completions, NOW).map((r) => r.id)).toEqual(['daily', 'mwf', 'monfri'])
  })

  it('is exactly the set todayTally counts, so the header always matches the rows', () => {
    const rows = routinesForToday(mixed, completions, NOW)
    const tally = todayTally(mixed, completions, NOW)
    expect(tally).toEqual({ due: 3, done: 2, remaining: 1 })
    expect(tally.due).toBe(rows.length)
  })

  it('a day when every routine rests lists nothing and counts 0 due', () => {
    const resting = [routine({ id: 's', cadence: SUNDAY_ONLY }), routine({ id: 'mf', cadence: MON_FRI })]
    expect(routinesForToday(resting, [], NOW)).toEqual([])
    expect(todayTally(resting, [], NOW).due).toBe(0)
  })
})

describe('routineStartKey', () => {
  it('is the local day the routine was planted', () => {
    expect(routineStartKey(PLANTED_TODAY, [])).toBe(dayKey(0))
  })

  it('never hides history older than created_at (e.g. a backfilled check-off)', () => {
    expect(routineStartKey(PLANTED_TODAY, [dayKey(-3), dayKey(-1)])).toBe(dayKey(-3))
  })

  it('is undefined with no created_at and no history', () => {
    expect(routineStartKey('', [])).toBeUndefined()
  })
})

describe('days before a routine was planted are neither misses nor rain', () => {
  it('a routine planted today: its 7-day row is all off, not six misses', () => {
    const since = routineStartKey(PLANTED_TODAY, [])
    expect(computeTrellisDays([], DAILY, 7, NOW, since).map((d) => d.state)).toEqual(['off', 'off', 'off', 'off', 'off', 'off', 'off'])
    // without `since` the same empty history paints the pre-planting days as misses
    expect(computeTrellisDays([], DAILY, 7, NOW).some((d) => d.state === 'rained' || d.state === 'broke')).toBe(true)
  })

  it('a routine planted today holds no phantom rain', () => {
    const since = routineStartKey(PLANTED_TODAY, [])
    expect(computeGraceStreak([], DAILY, NOW, since)).toEqual({ current: 0, rainedDates: [] })
  })

  it('real misses after planting still show, and `since` never changes the current streak', () => {
    const plantedFiveDaysAgo = at(dayKey(-5), 15).toISOString()
    const dates = [dayKey(-5), dayKey(-4), dayKey(-2), dayKey(-1)] // missed -3
    const since = routineStartKey(plantedFiveDaysAgo, dates)
    expect(computeTrellisDays(dates, DAILY, 7, NOW, since).map((d) => d.state)).toEqual(['off', 'grew', 'grew', 'rained', 'grew', 'grew', 'off'])
    expect(computeGraceStreak(dates, DAILY, NOW, since).current).toBe(computeStreak(dates, DAILY, NOW).current)
    expect(computeGraceStreak(dates, DAILY, NOW, since).rainedDates).toEqual([dayKey(-3)])
  })
})

describe('the streak goal (migration 0046)', () => {
  it('a challenge window counts both ends, across a month and a DST change', () => {
    expect(challengeDays('2026-09-01', '2026-09-30')).toBe(30)
    expect(challengeDays('2026-10-03', '2026-10-03')).toBe(1)
    expect(challengeDays('2026-10-20', '2026-11-18')).toBe(30)
  })

  it('reads "12 / 30" against a goal, the bare count without one', () => {
    expect(streakOfGoal(12, 30)).toBe('12 / 30')
    expect(streakOfGoal(31, 30)).toBe('31 / 30')
    expect(streakOfGoal(12, null)).toBe('12')
    expect(streakOfGoal(0, undefined)).toBe('0')
  })
})
