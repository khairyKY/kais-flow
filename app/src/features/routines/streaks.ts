import type { Cadence } from '../../lib/types'

/** YYYY-MM-DD in LOCAL time — never UTC, or midnight-adjacent completions land on the wrong day. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isScheduled(d: Date, cadence: Cadence): boolean {
  return cadence.weekdays.includes(d.getDay())
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export interface StreakResult {
  current: number
  best: number
}

const MAX_LOOKBACK_DAYS = 3650 // ~10 years safety bound against pathological cadences

/**
 * completedDates: local YYYY-MM-DD strings the routine was checked off.
 * Only days the cadence schedules count toward a streak; unscheduled days are skipped over
 * without breaking anything. Today, if scheduled but not yet completed, doesn't break the
 * current streak — it just isn't counted yet (the day isn't over).
 */
export function computeStreak(completedDates: string[], cadence: Cadence, today: Date = new Date()): StreakResult {
  const completed = new Set(completedDates)

  let current = 0
  if (cadence.weekdays.length > 0) {
    let cursor = new Date(today)
    if (isScheduled(cursor, cadence) && !completed.has(localDateKey(cursor))) {
      cursor = addDays(cursor, -1)
    }
    let steps = 0
    while (steps < MAX_LOOKBACK_DAYS) {
      if (isScheduled(cursor, cadence)) {
        if (completed.has(localDateKey(cursor))) {
          current++
        } else {
          break
        }
      }
      cursor = addDays(cursor, -1)
      steps++
    }
  }

  let best = 0
  if (completed.size > 0 && cadence.weekdays.length > 0) {
    const earliest = Array.from(completed).sort()[0]
    let cursor = new Date(`${earliest}T00:00:00`)
    let run = 0
    let steps = 0
    while (cursor <= today && steps < MAX_LOOKBACK_DAYS) {
      if (isScheduled(cursor, cadence)) {
        if (completed.has(localDateKey(cursor))) {
          run++
          best = Math.max(best, run)
        } else {
          run = 0
        }
      }
      cursor = addDays(cursor, 1)
      steps++
    }
  }

  return { current, best }
}
