import { localDateKey } from '../routines/streaks'

// Punch 23 — THE once-per-day gate for the day-complete celebration (Effects 2d).
// One key, one dwell, one implementation. TasksPage currently carries a duplicate
// gate on its own key (`kf_day_complete`); do NOT edit it from WA-4 — the
// orchestrator points it at this module after the parallel tasks workstream merges.

export const DAY_DONE_KEY = 'kf.dayDoneShown'
export const DAY_DONE_DWELL_MS = 3000 // spec: 3s dwell (DRIFT-AUDIT P0 #14)

/** True exactly once per calendar day — and marks the day claimed as a side effect. */
export function claimDayComplete(now = new Date()): boolean {
  const today = localDateKey(now)
  try {
    if (localStorage.getItem(DAY_DONE_KEY) === today) return false
    localStorage.setItem(DAY_DONE_KEY, today)
  } catch {
    return false // storage unavailable — skip the celebration rather than repeat it
  }
  return true
}
