// B2 (audit 2026-08-01, Kai ruled yes 2026-09-24): the app's one day boundary is Cairo's,
// not the device's — "Today"/"Overdue" used device-local days while every date beside them
// rendered in Cairo. One cached formatter: grouping calls this thousands of times a render.
const cairoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })

/** YYYY-MM-DD of the Cairo calendar day `d` falls on. */
export function cairoDateKey(d: Date): string {
  return cairoDay.format(d)
}

/** The Cairo calendar day `now` falls on, as that date's UTC midnight in ms — pure day math. */
function cairoDayUtc(now: Date): number {
  const [y, m, d] = cairoDateKey(now).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// T-2: the shortcuts below schedule on that same Cairo day. Egypt has DST (UTC+2 winter,
// UTC+3 summer), so Cairo's offset is read from the tz database via Intl — never hardcoded.
const cairoClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/** Cairo's UTC offset in ms at instant `t` (whole seconds). */
function cairoOffsetMs(t: number): number {
  const p: Record<string, number> = {}
  for (const { type, value } of cairoClock.formatToParts(t)) p[type] = Number(value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - t
}

/** ISO instant of `hour`:00 Cairo wall-clock, `days` Cairo calendar days after the one `now`
 * falls on — the same day `cairoDateKey` (and so task grouping) sees, on any device. */
function cairoDayAt(now: Date, days: number, hour: number): string {
  const wall = cairoDayUtc(now) + days * 86400000 + hour * 3600000 // Cairo wall-clock, read as UTC
  // Second pass: the offset at the first guess can differ from the one at the real instant
  // when a DST switch falls between them.
  return new Date(wall - cairoOffsetMs(wall - cairoOffsetMs(wall))).toISOString()
}

/** Shared "1/2/3 = today/tomorrow/next week" math — also backs the row context menu's
 * Schedule today/tomorrow so keyboard and mouse always land on the same time. */
export function scheduleToday(now: Date = new Date()): string {
  return cairoDayAt(now, 0, 9)
}

export function scheduleTomorrow(now: Date = new Date()): string {
  return cairoDayAt(now, 1, 9)
}

/** Day-offset to the coming Monday (7 if today already is one), by the Cairo weekday — the one
 * place this math lives, so the planning board's "This week"/"Next week" bucket boundary can
 * share it and never drift from what this shortcut actually schedules. */
export function daysUntilNextMonday(now: Date = new Date()): number {
  const weekday = new Date(cairoDayUtc(now)).getUTCDay()
  return ((1 - weekday + 7) % 7) || 7
}

export function scheduleNextWeek(now: Date = new Date()): string {
  return cairoDayAt(now, daysUntilNextMonday(now), 9)
}

/** Planning board's "This week" column drop target — a fixed 2-day-out placeholder date
 * (not today/tomorrow, which have their own columns) that the task can be dragged off of later. */
export function scheduleThisWeek(now: Date = new Date()): string {
  return cairoDayAt(now, 2, 9)
}
