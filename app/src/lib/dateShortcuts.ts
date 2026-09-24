// B2 (audit 2026-08-01, Kai ruled yes 2026-09-24): the app's one day boundary is Cairo's,
// not the device's — "Today"/"Overdue" used device-local days while every date beside them
// rendered in Cairo. One cached formatter: grouping calls this thousands of times a render.
const cairoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })

/** YYYY-MM-DD of the Cairo calendar day `d` falls on. */
export function cairoDateKey(d: Date): string {
  return cairoDay.format(d)
}

function atHour(base: Date, hour: number): Date {
  const d = new Date(base)
  d.setHours(hour, 0, 0, 0)
  return d
}

/** Shared "1/2/3 = today/tomorrow/next week" math — also backs the row context menu's
 * Schedule today/tomorrow so keyboard and mouse always land on the same time. */
export function scheduleToday(now: Date = new Date()): string {
  return atHour(now, 9).toISOString()
}

export function scheduleTomorrow(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  return atHour(d, 9).toISOString()
}

/** Day-offset to the coming Monday (7 if today already is one) — the one place this math
 * lives, so the planning board's "This week"/"Next week" bucket boundary can share it and
 * never drift from what this shortcut actually schedules. */
export function daysUntilNextMonday(now: Date = new Date()): number {
  return ((1 - now.getDay() + 7) % 7) || 7
}

export function scheduleNextWeek(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + daysUntilNextMonday(now))
  return atHour(d, 9).toISOString()
}

/** Planning board's "This week" column drop target — a fixed 2-day-out placeholder date
 * (not today/tomorrow, which have their own columns) that the task can be dragged off of later. */
export function scheduleThisWeek(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 2)
  return atHour(d, 9).toISOString()
}
