import { RRule } from 'rrule'
import { appZone, perZone } from '../../lib/appZone'
import { zoneDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'

// Rules run on the user's wall clock (app_settings.timezone), not UTC: rrule steps in UTC, so a daily
// 09:00 Cairo task drifted to 08:00 across a DST change, and BYDAY / BYMONTHDAY read the UTC weekday
// and date (a Tokyo 08:00 Monday is a UTC Sunday). Each instant goes in as its wall-clock time
// written as UTC ("floating" time, rrule's own convention) and comes back through the tz database.
const wallFmt = perZone(
  (timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }),
)
function toWall(at: Date, zone: string): Date {
  const p: Record<string, number> = {}
  for (const { type, value } of wallFmt(zone).formatToParts(at)) p[type] = Number(value)
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second, at.getUTCMilliseconds()))
}
function fromWall(w: Date, zone: string): Date {
  const iso = zoneWallTimeToIso(zone, w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds())
  return new Date(Date.parse(iso) + w.getUTCMilliseconds())
}

/**
 * The next occurrence strictly after `after` (default: the start itself) of a stored RRULE string
 * (e.g. "FREQ=MONTHLY") whose series starts at `fromDate`, on the user's wall clock. Per RFC 5545,
 * if a monthly rule's anchor day doesn't exist in a given month (e.g. day 31 in February), that
 * occurrence is skipped entirely — not clamped to the month's last day. Returns null if the rule
 * produces no further occurrences.
 */
export function nextOccurrence(recurrenceRule: string, fromDate: Date, zone: string = appZone(), after: Date = fromDate): Date | null {
  const { until, ...options } = RRule.parseString(recurrenceRule.replace(/^RRULE:/, ''))
  const rule = new RRule({ ...options, ...(until ? { until: toWall(until, zone) } : null), dtstart: toWall(fromDate, zone) })
  const next = rule.after(toWall(after, zone), false)
  return next ? fromWall(next, zone) : null
}

/**
 * Where a repeat's next copy goes (Kai 2026-10-12 audit): the rule's next date after the LATER of
 * its due date and today — a daily task finished five days late comes back tomorrow, not four days
 * overdue — at the series' own time of day and on its own weekdays (the rule keeps its start).
 * Completing early still rolls from the due date.
 */
export function nextDue(recurrenceRule: string, dueIso: string, now: Date, zone: string = appZone()): Date | null {
  // "Ends after N times" (p7e A13): the count rides on the copies (ruleAfterThis), so the step itself
  // ignores it — read from each copy's own due date, COUNT=3 restarted at every copy and never ended.
  if (ruleAfterThis(recurrenceRule) === null) return null
  const step = recurrenceRule.split(';').filter((p) => !/^COUNT=/i.test(p)).join(';')
  const due = new Date(dueIso)
  const [y, m, d] = zoneDateKey(now, zone).split('-').map(Number)
  const wall = toWall(due, zone)
  const todayAt = new Date(Date.parse(zoneWallTimeToIso(zone, y, m, d, wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds())) + wall.getUTCMilliseconds())
  return nextOccurrence(step, due, zone, todayAt > due ? todayAt : due)
}

/** A task's "Ends after N times": its COUNT is how many are left, this one included — so the next
 * copy carries one fewer, and COUNT=1 is the last (null: the series ends here). Any other rule
 * carries over as it is. */
export function ruleAfterThis(recurrenceRule: string): string | null {
  const n = Number(/(?:^|;)COUNT=(\d+)/i.exec(recurrenceRule)?.[1] ?? 0)
  if (!n) return recurrenceRule
  return n > 1 ? recurrenceRule.replace(/COUNT=\d+/i, `COUNT=${n - 1}`) : null
}

/**
 * Polish F2a (2026-09-26 decision): a repeat's next occurrence keeps its reminder. The reminder
 * sits as far before the NEW due time as the original's sat before its own ("15 min before"
 * stays 15 min before; a reminder set after the due time keeps that too). No reminder → none.
 * The copy used to carry the original's already-past `reminder_at` and `reminder_sent: true`,
 * and the notify sweep (reminder_sent = false, reminder_at within the last 10 min) never fired it.
 */
export function nextReminderAt(reminderAt: string | null, fromDue: string, toDue: Date): string | null {
  if (!reminderAt) return null
  const lead = new Date(fromDue).getTime() - new Date(reminderAt).getTime()
  return new Date(toDue.getTime() - lead).toISOString()
}
