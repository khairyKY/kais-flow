// B2 (audit 2026-08-01, Kai ruled yes 2026-09-24): the app's one day boundary is the app's zone,
// not the device's — "Today"/"Overdue" used device-local days while every date beside them
// rendered in the app's zone. User time zones (2026-10-04): that zone is each user's own
// app_settings.timezone (lib/appZone.ts, Africa/Cairo by default). The `cairo*` names below are
// historical — they read the user's zone; the `zone*` ones also take an explicit zone.
import { appZone, perZone } from './appZone'

// One cached formatter per zone: grouping calls this thousands of times a render.
const dayFmt = perZone((timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }))

/** YYYY-MM-DD of the calendar day `d` falls on in `zone` (the user's, by default). */
export function zoneDateKey(d: Date, zone: string = appZone()): string {
  return dayFmt(zone).format(d)
}

/** The user's calendar day `d` falls on — `zoneDateKey` in the user's zone. */
export function cairoDateKey(d: Date): string {
  return zoneDateKey(d)
}

/** The calendar day `now` falls on in `zone`, as that date's UTC midnight in ms — pure day math. */
function zoneDayUtc(now: Date, zone: string): number {
  const [y, m, d] = zoneDateKey(now, zone).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// T-2: the shortcuts below schedule on that same day. Zones have DST (Egypt: UTC+2 winter, UTC+3
// summer), so the offset is read from the tz database via Intl — never hardcoded.
const clockFmt = perZone(
  (timeZone) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }),
)

/** `zone`'s UTC offset in ms at instant `t` (whole seconds). */
function offsetMs(t: number, zone: string): number {
  const p: Record<string, number> = {}
  for (const { type, value } of clockFmt(zone).formatToParts(t)) p[type] = Number(value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - t
}

/** `zone`'s UTC offset in minutes at `at` (Cairo: +180 in summer, +120 in winter). */
export function zoneOffsetMinutes(at: Date, zone: string = appZone()): number {
  return Math.round(offsetMs(at.getTime(), zone) / 60000)
}

/** The user's UTC offset in minutes at `at`. */
export function cairoOffsetMinutes(at: Date): number {
  return zoneOffsetMinutes(at)
}

/** A wall-clock time in `zone`, given as ms read as if it were UTC, -> the real instant (ISO). */
function wallToIso(wall: number, zone: string): string {
  // Second pass: the offset at the first guess can differ from the one at the real instant
  // when a DST switch falls between them.
  return new Date(wall - offsetMs(wall - offsetMs(wall, zone), zone)).toISOString()
}

/** T-4: ISO instant of a wall-clock time in `zone` (`month` 1–12), on any device — "10am" typed on a
 * phone set to another zone still means 10:00 on the user's clock. DST-correct for the date itself. */
export function zoneWallTimeToIso(zone: string, year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string {
  return wallToIso(Date.UTC(year, month - 1, day, hour, minute, second), zone)
}

/** `zoneWallTimeToIso` on the user's clock. */
export function cairoWallTimeToIso(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string {
  return zoneWallTimeToIso(appZone(), year, month, day, hour, minute, second)
}

/** ISO instant of `hour`:00 on the user's wall clock, `days` calendar days after the one `now`
 * falls on — the same day `cairoDateKey` (and so task grouping) sees, on any device. */
function dayAt(now: Date, days: number, hour: number): string {
  const zone = appZone()
  return wallToIso(zoneDayUtc(now, zone) + days * 86400000 + hour * 3600000, zone) // wall-clock, read as UTC
}

/** Shared "1/2/3 = today/tomorrow/next week" math — also backs the row context menu's
 * Schedule today/tomorrow so keyboard and mouse always land on the same time. */
export function scheduleToday(now: Date = new Date()): string {
  return dayAt(now, 0, 9)
}

/** The app's one "Tomorrow" (Flow Audit §4): tomorrow 09:00 on the user's clock (B2) — the
 * row menus and swipe, the `2` key, the bulk bar, the rituals' push/roll, the snooze menu. It
 * replaced now+24h, "+1 device day at this time" and 09:00 device time. */
export function scheduleTomorrow(now: Date = new Date()): string {
  return dayAt(now, 1, 9)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Mon 09:00" — the hint beside every "Tomorrow" (MK Action Sheet, MK Swipe Row). */
export function tomorrowHint(now: Date = new Date()): string {
  return `${WEEKDAYS[new Date(zoneDayUtc(now, appZone()) + 86400000).getUTCDay()]} 09:00`
}

/** Day-offset to the coming Monday (7 if today already is one), by the user's weekday — the one
 * place this math lives, so the planning board's "This week"/"Next week" bucket boundary can
 * share it and never drift from what this shortcut actually schedules. */
export function daysUntilNextMonday(now: Date = new Date()): number {
  const weekday = new Date(zoneDayUtc(now, appZone())).getUTCDay()
  return ((1 - weekday + 7) % 7) || 7
}

/** Days to "Next week": the coming Monday — except on a Sunday, where that Monday is tomorrow and
 * "Next week" would just repeat Tomorrow, so it's the Monday after (MK Date Picker: Sun 27 → Mon 5). */
export function daysUntilNextWeek(now: Date = new Date()): number {
  const d = daysUntilNextMonday(now)
  return d === 1 ? 8 : d
}

export function scheduleNextWeek(now: Date = new Date()): string {
  return dayAt(now, daysUntilNextWeek(now), 9)
}

/** Planning board's "This week" column drop target — a fixed 2-day-out placeholder date
 * (not today/tomorrow, which have their own columns) that the task can be dragged off of later. */
export function scheduleThisWeek(now: Date = new Date()): string {
  return dayAt(now, 2, 9)
}
