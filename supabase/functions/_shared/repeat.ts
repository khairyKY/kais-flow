// A repeating task's next copy, on the server (MCP complete_task) — the same rule as the app's
// features/tasks/recurrence.ts nextDue (Kai 2026-10-12 audit): roll from the LATER of the due date and
// today at the due's own time of day, on the user's wall clock, so a daily task finished five days
// late comes back tomorrow instead of four days overdue. Pure; rrule is injected by the caller.
import { dateKey, wallTime, wallToInstant } from './zone.ts'

/** The instant to roll the rule after: max(due, today at the due's wall-clock time). */
export function rollAfter(dueIso: string, now: Date, zone: string): Date {
  const due = new Date(dueIso)
  const [, hm] = wallTime(dueIso, zone).split(' ')
  const [h, m] = hm.split(':').map(Number)
  const todayAt = wallToInstant(dateKey(now, zone), h, m, zone)
  return todayAt > due ? todayAt : due
}

/** `at` as its wall-clock time on `zone`, written as UTC ("floating" time, rrule's convention). */
export function toWall(at: Date, zone: string): Date {
  const [d, hm] = wallTime(at.toISOString(), zone).split(' ')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, da, h, mi, at.getUTCSeconds(), at.getUTCMilliseconds()))
}

/** A floating wall-clock time back to the real instant on `zone`. */
export function fromWall(w: Date, zone: string): Date {
  const key = w.toISOString().slice(0, 10)
  const at = wallToInstant(key, w.getUTCHours(), w.getUTCMinutes(), zone)
  return new Date(at.getTime() + w.getUTCSeconds() * 1000 + w.getUTCMilliseconds())
}
