// Routine reminders (Kai 2026-10-12): the New Routine form's "Reminder — a gentle push notification"
// was saved as routines.clock_time and nothing ever read it. Now notify sends it on the 5-minute
// sweep (migration 0062) and the Windows/Android apps plan it themselves (app/src/features/
// notifications/plan.ts). Pure — no Deno APIs — so the app's vitest runs it
// (app/src/features/notifications/routine.test.ts), the ritual.ts pattern.
import { dateKey } from '../_shared/zone.ts'
import { minutesOf, wallMinutes } from './ritual.ts'

/** pg_cron calls notify with `{kind: 'routine'}` every TICK minutes (0062). */
export const ROUTINE_TICK_MIN = 5

export interface ReminderRoutine {
  id: string
  name: string
  /** 'HH:MM' (Postgres may read back 'HH:MM:SS'); null = no reminder. */
  clock_time: string | null
  /** 0 = Sunday … 6 = Saturday, as the app writes it. */
  cadence?: { weekdays?: number[] } | null
  active: boolean
}

export interface RoutineDone {
  routine_id: string
  /** YYYY-MM-DD, the day it was checked off. */
  completed_on: string
}

/** A 'YYYY-MM-DD' day's weekday, 0 = Sunday (the cadence's numbering). */
const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay()

/** Does `r` remind on day `key`: active, a time set, its cadence has that weekday (the app's
 * routines/streaks.ts routinesForToday), and not already checked off that day? */
export function routineDueOn(r: ReminderRoutine, key: string, done: readonly RoutineDone[]): boolean {
  return (
    r.active &&
    minutesOf(r.clock_time) !== null &&
    (r.cadence?.weekdays ?? []).includes(weekday(key)) &&
    !done.some((c) => c.routine_id === r.id && c.completed_on === key)
  )
}

/** The routines whose reminder falls on the tick at `now`: their time in (now − tick, now] on `zone`'s
 * wall clock, judged on the day that time belongs to (a 23:58 reminder sent on the 00:00 tick is
 * yesterday's). Earliest first. */
export function routinesDueAt<R extends ReminderRoutine>(routines: readonly R[], done: readonly RoutineDone[], now: Date, zone: string, tick = ROUTINE_TICK_MIN): R[] {
  const m = wallMinutes(now, zone)
  const since = (r: R) => (m - minutesOf(r.clock_time)! + 1440) % 1440
  return routines
    .filter((r) => minutesOf(r.clock_time) !== null && since(r) < tick && routineDueOn(r, dateKey(new Date(now.getTime() - since(r) * 60_000), zone), done))
    .sort((a, b) => since(b) - since(a))
}
