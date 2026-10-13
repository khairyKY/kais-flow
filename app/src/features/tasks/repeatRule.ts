// The Repeat picker's "Custom…" (Kai 2026-10-12: it opened the editor, whose Repeat had only Never /
// Daily / Weekly / Monthly — a dead end). A rule is edited as a small spec — every N days / weeks /
// months, which weekdays, which day of the month, when it ends — and stored as the RRULE string the
// recurrence engine (./recurrence) already reads. Pure, so the round trips are tested.
import { RRule, Weekday, type ByWeekday, type Options } from 'rrule'
import { zoneDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import { appZone } from '../../lib/appZone'

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type WeekdayCode = (typeof WEEKDAYS)[number]

export interface RepeatSpec {
  unit: RepeatUnit
  /** Every N units, 1–99. Yearly repeats on the start's own date (p7e A13). */
  every: number
  /** Weekly: on these days. */
  days: WeekdayCode[]
  /** Monthly: on day N of the month, or on the Nth weekday (nth −1 = the last). */
  monthly: { by: 'day'; day: number } | { by: 'weekday'; nth: number; day: WeekdayCode }
  /** Ends never, after the given day (in the user's zone), or after N times. */
  ends: { by: 'never' } | { by: 'date'; date: string } | { by: 'count'; count: number }
}

/** The day a rule hangs off — the task's due date, else today — in the user's zone. */
export interface RepeatStart {
  /** YYYY-MM-DD */
  date: string
  weekday: WeekdayCode
  /** Its weekday's place in the month: 1–4, or −1 when it's the month's last. */
  nth: number
}

export function repeatStart(at: Date, zone: string = appZone()): RepeatStart {
  const date = zoneDateKey(at, zone)
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]
  const monthDays = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { date, weekday, nth: d + 7 > monthDays ? -1 : Math.ceil(d / 7) }
}

const FREQ: Record<RepeatUnit, number> = { day: RRule.DAILY, week: RRule.WEEKLY, month: RRule.MONTHLY, year: RRule.YEARLY }
const UNIT: Partial<Record<number, RepeatUnit>> = { [RRule.DAILY]: 'day', [RRule.WEEKLY]: 'week', [RRule.MONTHLY]: 'month', [RRule.YEARLY]: 'year' }
const dayOfMonth = (start: RepeatStart) => Number(start.date.slice(8))

/** The spec a rule opens with in the editor; no rule (or one the editor can't show) → weekly on the start's day. */
export function parseRule(rule: string | null, start: RepeatStart, zone: string = appZone()): RepeatSpec {
  const spec: RepeatSpec = { unit: 'week', every: 1, days: [start.weekday], monthly: { by: 'day', day: dayOfMonth(start) }, ends: { by: 'never' } }
  if (!rule) return spec
  let o: Partial<Options>
  try {
    o = RRule.parseString(rule.replace(/^RRULE:/, ''))
  } catch {
    return spec
  }
  const unit = o.freq != null ? UNIT[o.freq] : undefined
  if (!unit) return spec
  spec.unit = unit
  spec.every = Math.max(1, o.interval ?? 1)
  const byday = ([] as ByWeekday[]).concat(o.byweekday ?? []).map((w) => (typeof w === 'number' ? new Weekday(w) : typeof w === 'string' ? Weekday.fromStr(w) : w))
  if (unit === 'week' && byday.length) spec.days = WEEKDAYS.filter((_, i) => byday.some((w) => w.weekday === i))
  if (unit === 'month') {
    const monthDay = ([] as number[]).concat(o.bymonthday ?? [])[0]
    if (byday[0]?.n) spec.monthly = { by: 'weekday', nth: byday[0].n, day: WEEKDAYS[byday[0].weekday] }
    else if (monthDay) spec.monthly = { by: 'day', day: monthDay }
  }
  if (o.count) spec.ends = { by: 'count', count: o.count }
  else if (o.until) spec.ends = { by: 'date', date: zoneDateKey(o.until, zone) }
  return spec
}

/** The RRULE for a spec, as stored on the task ("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"). What the start
 * already implies is left out — weekly on the start's own day is plain FREQ=WEEKLY, the menu's Weekly —
 * so opening Custom… and pressing Done changes nothing. */
export function buildRule(spec: RepeatSpec, start: RepeatStart, zone: string = appZone()): string {
  const o: Partial<Options> = { freq: FREQ[spec.unit] }
  const every = Math.min(99, Math.max(1, Math.round(spec.every) || 1))
  if (every > 1) o.interval = every
  if (spec.unit === 'week') {
    const days = WEEKDAYS.filter((d) => spec.days.includes(d))
    if (days.length && !(days.length === 1 && days[0] === start.weekday)) o.byweekday = days.map((d) => RRule[d])
  }
  if (spec.unit === 'month') {
    const m = spec.monthly
    if (m.by === 'weekday') o.byweekday = [RRule[m.day].nth(m.nth)]
    else if (m.day !== dayOfMonth(start)) o.bymonthday = [Math.min(31, Math.max(1, Math.round(m.day)))]
  }
  if (spec.ends.by === 'count') o.count = Math.max(1, Math.round(spec.ends.count))
  if (spec.ends.by === 'date') {
    // ponytail: inclusive — the last second of that day on the user's clock.
    const [y, mo, d] = spec.ends.date.split('-').map(Number)
    o.until = new Date(zoneWallTimeToIso(zone, y, mo, d, 23, 59, 59))
  }
  return RRule.optionsToString(o).replace(/^RRULE:/, '')
}

/** "1st", "2nd", "3rd", "4th", "last" — the monthly "on the Nth weekday" words. */
export const nthLabel = (n: number) => (n === -1 ? 'last' : (['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`))
export const WEEKDAY_NAMES: Record<WeekdayCode, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' }
