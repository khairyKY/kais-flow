import type { Cadence, Routine, RoutineCompletion } from '../../lib/types'

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

function scheduledAndDone(cadence: Cadence, completedDates: string[], days: number, today: Date): { scheduled: number; done: number } {
  const completed = new Set(completedDates)
  let scheduled = 0
  let done = 0
  for (let n = 0; n < days; n++) {
    const d = addDays(today, -n)
    if (!isScheduled(d, cadence)) continue
    scheduled++
    if (completed.has(localDateKey(d))) done++
  }
  return { scheduled, done }
}

/** Percent of scheduled days actually completed in the trailing `days`-day window (today
 * inclusive). 0 when the cadence never schedules a day in that window, rather than NaN. */
export function completionRate(completedDates: string[], cadence: Cadence, days: 7 | 30, today: Date = new Date()): number {
  const { scheduled, done } = scheduledAndDone(cadence, completedDates, days, today)
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
}

/** The header's all-routines rate: scheduled/done counts summed across every active routine
 * first, then divided once — a weighted rate, not an average of each routine's own percentage
 * (a daily routine and a once-a-week one shouldn't count equally). */
export function aggregateCompletionRate(routines: Routine[], completions: RoutineCompletion[], days: 7 | 30, today: Date = new Date()): number {
  let scheduled = 0
  let done = 0
  for (const routine of routines) {
    const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
    const w = scheduledAndDone(routine.cadence, dates, days, today)
    scheduled += w.scheduled
    done += w.done
  }
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
}

/** One ratio (0..1) per day, oldest first — the sparkline's path data. A day with nothing
 * scheduled across any routine reads as 0 rather than being skipped, so the line stays a fixed
 * length. */
export function dailyCompletionRatios(routines: Routine[], completions: RoutineCompletion[], days: number, today: Date = new Date()): number[] {
  const ratios: number[] = []
  for (let n = days - 1; n >= 0; n--) {
    const d = addDays(today, -n)
    const key = localDateKey(d)
    const scheduled = routines.filter((r) => isScheduled(d, r.cadence))
    if (scheduled.length === 0) {
      ratios.push(0)
      continue
    }
    const done = scheduled.filter((r) => completions.some((c) => c.routine_id === r.id && c.completed_on === key))
    ratios.push(done.length / scheduled.length)
  }
  return ratios
}

/** No `goal` field exists on a routine, so "streak vs. goal" is read as "streak vs. today":
 * flags the routine with the longest streak that's scheduled today, not yet done, and would
 * break if skipped. Null when nothing active is actually at risk right now. */
export function streakRiskMessage(routines: Routine[], completions: RoutineCompletion[], today: Date = new Date()): string | null {
  const todayKey = localDateKey(today)
  let worst: { name: string; current: number } | null = null
  for (const routine of routines) {
    if (!isScheduled(today, routine.cadence)) continue
    const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
    if (dates.includes(todayKey)) continue
    const { current } = computeStreak(dates, routine.cadence, today)
    if (current > 0 && (!worst || current > worst.current)) worst = { name: routine.name, current }
  }
  if (!worst) return null
  return `${worst.name}'s ${worst.current}-day streak is on the line — complete it today to keep it.`
}
