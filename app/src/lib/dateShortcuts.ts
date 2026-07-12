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
