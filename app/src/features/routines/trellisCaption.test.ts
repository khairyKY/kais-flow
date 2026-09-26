import { describe, expect, it } from 'vitest'
import { computeGraceStreak, computeTrellisDays, localDateKey, rainHeld, routineStartKey, routineStreak, trellisCaption } from './streaks'
import type { Cadence } from '../../lib/types'

// polish-f1 (conductor decision 2026-09-26): "1 rain held" / "it rained … — the vine held on" on
// a 0-day streak reads as a contradiction, so the trellis never tells the rain story then.
// Same fixed-date convention as streaks.test.ts: Wed 2026-07-08, mid-afternoon local.
const NOW = new Date('2026-07-08T15:00:00')
const DAILY: Cadence = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const MONDAYS: Cadence = { weekdays: [1] }

function dayKey(offset: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return localDateKey(d)
}

/** What StreakTrellis computes for one routine: header numbers + the caption's story. */
function trellis(dates: string[], cadence: Cadence, since?: string) {
  const { current, rainedDates } = computeGraceStreak(dates, cadence, NOW, since)
  const days = computeTrellisDays(dates, cadence, 14, NOW, since)
  const { status } = routineStreak(dates, cadence, NOW)
  return { current, rainedDates, held: rainHeld(current, rainedDates), story: trellisCaption(days, current, status) }
}

describe('the streak trellis on a 0-day streak (no rain story)', () => {
  it('a routine planted yesterday and never tended: the walk forgives yesterday, but nothing is "held"', () => {
    const t = trellis([], DAILY, dayKey(-1))
    expect(t.current).toBe(0)
    expect(t.rainedDates).toEqual([dayKey(-1)]) // the grace walk still rains it…
    expect(t.held).toEqual([]) // …but the header shows no "1 rain held"
    expect(t.story).toEqual({ kind: 'new' }) // "starts bare, grows with the streak ✿"
  })

  it('a lapsed streak with a rain and a later snap in view tells the snap, not the rain', () => {
    // Tended Jun 20–24, then nothing: Jun 25 rains, Jun 26 snaps, Jul 1 rains, Jul 2 snaps…
    const dates = [-18, -17, -16, -15, -14].map(dayKey)
    const t = trellis(dates, DAILY, routineStartKey(null, dates))
    expect(t.current).toBe(0)
    expect(t.rainedDates.length).toBeGreaterThan(0)
    expect(t.held).toEqual([])
    expect(t.story).toEqual({ kind: 'broke', key: dayKey(-1) })
  })

  it('a lapsed weekly routine whose snap is older than the window reads bare, never "held on"', () => {
    // Mondays Jun 1/8/15 tended, Jun 22 snapped (outside the 14 days), Jun 29 + Jul 6 both rained
    const dates = ['2026-06-01', '2026-06-08', '2026-06-15']
    const t = trellis(dates, MONDAYS, routineStartKey(null, dates))
    expect(t.current).toBe(0)
    expect(t.held).toEqual([])
    expect(t.story).toEqual({ kind: 'bare' })
  })
})

describe('the streak trellis on a live streak (unchanged)', () => {
  it('a rain inside a live streak is held and told', () => {
    // Daily for the last 14 days except Jul 3 (the month's one rain); today not yet done
    const dates = [-14, -13, -12, -11, -10, -9, -8, -7, -6, -4, -3, -2, -1].map(dayKey)
    const t = trellis(dates, DAILY, routineStartKey(null, dates))
    expect(t.current).toBe(13)
    expect(t.held).toEqual([dayKey(-5)])
    expect(t.story).toEqual({ kind: 'rained', key: dayKey(-5) })
  })

  it('a clean run says so', () => {
    const dates = [-13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0].map(dayKey)
    const t = trellis(dates, DAILY, routineStartKey(null, dates))
    expect(t.held).toEqual([])
    expect(t.story).toEqual({ kind: 'clean' })
  })
})

describe('rainHeld', () => {
  it('passes the rains through only while the streak lives', () => {
    expect(rainHeld(3, ['2026-07-03'])).toEqual(['2026-07-03'])
    expect(rainHeld(0, ['2026-07-03'])).toEqual([])
  })
})
