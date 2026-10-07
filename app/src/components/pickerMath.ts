import { cairoDateKey, daysUntilNextWeek, scheduleNextWeek, scheduleToday, scheduleTomorrow } from '../lib/dateShortcuts'
import { daysToWeekend, weekendDays as weekendDaysSetting } from '../lib/weekend'
import { cairoTimeKey, cairoToIso } from '../features/calendar/eventTime'
import type { CalendarEvent, Task } from '../lib/types'

// ── The date and time pickers' pure half (MK Date Picker / MK Time Picker, DS-CHANGELOG §3).
// Days are "YYYY-MM-DD" keys on the Cairo calendar (B2), times are "HH:mm" Cairo wall-clock.
// Calendar math runs on UTC dates, so it never sees the device's zone or a DST jump; instants go
// through lib/dateShortcuts' tz-database helpers. ──

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (n: number) => String(n).padStart(2, '0')
const utc = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** `key` ± `n` calendar days. */
export function addDays(key: string, n: number): string {
  const d = utc(key)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: string): number {
  return utc(key).getUTCDay()
}

export interface Month {
  y: number
  /** 1–12 */
  m: number
}

export function monthOf(key: string): Month {
  const [y, m] = key.split('-').map(Number)
  return { y, m }
}

export function shiftMonth({ y, m }: Month, n: number): Month {
  const i = y * 12 + (m - 1) + n
  return { y: Math.floor(i / 12), m: (i % 12) + 1 }
}

/** The same day-of-month `n` months on, clamped to that month's length (31 Jan + 1 = 28/29 Feb). */
export function shiftDay(key: string, n: number): string {
  const { y, m } = shiftMonth(monthOf(key), n)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad(m)}-${pad(Math.min(Number(key.slice(8)), last))}`
}

/** Monday-first weeks of a month, as MK Date Picker draws them: blanks (null) before the 1st, the
 * next month's first days (faint) filling the last week. 4–6 rows. */
export function monthGrid({ y, m }: Month): (string | null)[][] {
  const first = `${y}-${pad(m)}-01`
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = Array((weekday(first) + 6) % 7).fill(null)
  for (let i = 0; i < days; i++) cells.push(addDays(first, i))
  for (let i = days; cells.length % 7; i++) cells.push(addDays(first, i))
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** "Sun 27" inside `today`'s month, else "Sat 3 Oct" — the quick picks' hints. */
export function dayHint(key: string, today: string): string {
  const d = utc(key)
  const short = `${WD[d.getUTCDay()]} ${d.getUTCDate()}`
  return key.slice(0, 7) === today.slice(0, 7) ? short : `${short} ${MON[d.getUTCMonth()]}`
}

/** "Mon 28 Sep" */
export function dayShort(key: string): string {
  const d = utc(key)
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

/** "Tomorrow · Mon 28 Sep" — the time sheet's meta line. */
export function dayTitle(key: string, today: string): string {
  const rel = key === today ? 'Today' : key === addDays(today, 1) ? 'Tomorrow' : key === addDays(today, -1) ? 'Yesterday' : null
  return rel ? `${rel} · ${dayShort(key)}` : dayShort(key)
}

/** "Monday 28 September 2026" — a day cell's accessible name. */
export function dayLabel(key: string): string {
  const d = utc(key)
  return `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** A picked day as an instant: `time` Cairo wall-clock, 09:00 when no time was set — so picking
 * tomorrow's date is exactly Tomorrow. */
export function atDay(day: string, time = '09:00'): string {
  return cairoToIso(day, time)
}

export type QuickKey = 'today' | 'tomorrow' | 'weekend' | 'nextweek'
export interface QuickPick {
  key: QuickKey
  label: string
  day: string
  /** The instant it schedules (09:00 Cairo on `day`) — the app's one Today / Tomorrow / Next week. */
  iso: string
  hint: string
}

/** MK Date Picker's dated quick picks (up to four, one per day). This weekend = the first day of the
 * user's weekend (lib/weekend; none when they have no weekend). `withTime` adds "· 09:00" to
 * Tomorrow's hint where the caller stores an instant. */
export function quickPicks(now: Date, withTime: boolean, weekendDays: readonly number[] = weekendDaysSetting()): QuickPick[] {
  const today = cairoDateKey(now)
  const toWeekend = daysToWeekend(weekday(today), weekendDays)
  const weekend = toWeekend == null ? null : addDays(today, toWeekend)
  const tomorrow = addDays(today, 1)
  const nextWeek = addDays(today, daysUntilNextWeek(now))
  const picks: QuickPick[] = [
    { key: 'today', label: 'Today', day: today, iso: scheduleToday(now), hint: dayHint(today, today) },
    { key: 'tomorrow', label: 'Tomorrow', day: tomorrow, iso: scheduleTomorrow(now), hint: dayHint(tomorrow, today) + (withTime ? ' · 09:00' : '') },
    ...(weekend ? [{ key: 'weekend' as const, label: 'This weekend', day: weekend, iso: atDay(weekend), hint: dayHint(weekend, today) }] : []),
    { key: 'nextweek', label: 'Next week', day: nextWeek, iso: scheduleNextWeek(now), hint: dayHint(nextWeek, today) },
  ]
  // Kai 2026-10-03: a pick landing on the same day as one above it is noise — This weekend is Today
  // on a Saturday and Tomorrow on a Friday — so only the first pick for each day stays.
  return picks.filter((p, i) => picks.findIndex((q) => q.day === p.day) === i)
}

/** Days holding an open task (due or scheduled) or a live event — the grid's 4px dots. */
export function daysWithItems(tasks: readonly Task[], events: readonly CalendarEvent[]): Set<string> {
  const days = new Set<string>()
  for (const t of tasks) {
    if (t.deleted_at || t.completed_at || t.status === 'done') continue
    for (const at of [t.due_at, t.scheduled_start]) if (at) days.add(cairoDateKey(new Date(at)))
  }
  for (const e of events) if (!e.deleted_at) days.add(cairoDateKey(new Date(e.starts_at)))
  return days
}

// ── Time ──

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const fromMin = (n: number): string => `${pad(Math.floor(n / 60) % 24)}:${pad(n % 60)}`

/** 00:00 … 23:45 — the time sheet's rows and TimeField's list. */
export const QUARTERS: string[] = Array.from({ length: 96 }, (_, i) => fromMin(i * 15))

export interface Busy {
  /** Minutes into the Cairo day, [start, end). */
  start: number
  end: number
  title: string
}

/** The day's busy blocks: timed, busy, live events on Cairo day `day`, clipped to it (an event
 * over midnight counts from 00:00 / until 24:00). Sorted by start. */
export function busyOnDay(events: readonly CalendarEvent[], day: string): Busy[] {
  const out: Busy[] = []
  for (const e of events) {
    if (e.deleted_at || e.all_day || e.busy === false) continue
    const s = new Date(e.starts_at)
    const en = new Date(e.ends_at)
    const sd = cairoDateKey(s)
    const ed = cairoDateKey(en)
    if (sd > day || ed < day) continue
    const start = sd < day ? 0 : toMin(cairoTimeKey(s))
    const end = ed > day ? 1440 : toMin(cairoTimeKey(en))
    if (end > start) out.push({ start, end, title: e.title })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** The busy block over the quarter starting at minute `m`, if any. */
export function busyAt(busy: readonly Busy[], m: number): Busy | undefined {
  return busy.find((b) => b.start < m + 15 && b.end > m)
}

// ponytail: fixed 08:00–20:00 window — there is no working-hours setting yet; read it here when one lands.
export const FREE_FROM = 8 * 60
export const FREE_TO = 20 * 60

export interface Slot {
  start: number
  end: number
}

/** "Free on your calendar": the gaps of at least `min` minutes (30 unless the caller has a duration)
 * between the day's busy blocks inside 08:00–20:00, on the quarter grid (so every pill is a row of
 * the list), starting no earlier than the next quarter when `day` is today; none for a past day.
 * At most `limit`, earliest first. */
export function freeSlots(busy: readonly Busy[], day: string, now: Date, min = 30, limit = 4): Slot[] {
  const today = cairoDateKey(now)
  if (day < today) return []
  const up = (m: number) => Math.ceil(m / 15) * 15
  let cur = day === today ? Math.max(FREE_FROM, up(toMin(cairoTimeKey(now)))) : FREE_FROM
  const out: Slot[] = []
  for (const b of [...busy, { start: FREE_TO, end: FREE_TO, title: '' }]) {
    const end = Math.floor(Math.min(b.start, FREE_TO) / 15) * 15
    if (end - cur >= min) out.push({ start: cur, end })
    cur = up(Math.max(cur, b.end))
    if (cur >= FREE_TO || out.length === limit) break
  }
  return out
}

export interface FreeStart {
  day: string
  start: number
}

/** "Next free slot" (Kai 2026-10-07, his "ASAP"): every start that fits `dur` in the free hours
 * (freeSlots: 08:00–20:00, not before now), today first, then each day after for `days` days —
 * stepping through a gap by the duration on the quarter grid (the task sheet's Suggest a time
 * steps the same way), so a long gap offers more than one. At most `limit`, earliest first. */
export function freeStarts(events: readonly CalendarEvent[], now: Date, dur: number, limit = 12, days = 14): FreeStart[] {
  const today = cairoDateKey(now)
  const step = Math.max(15, Math.ceil(dur / 15) * 15)
  const out: FreeStart[] = []
  for (let i = 0; i < days && out.length < limit; i++) {
    const day = addDays(today, i)
    for (const gap of freeSlots(busyOnDay(events, day), day, now, dur, Infinity)) {
      for (let t = gap.start; t + dur <= gap.end && out.length < limit; t += step) out.push({ day, start: t })
    }
  }
  return out
}

/** The duration chips (minutes). */
export const DURATIONS = [15, 30, 45, 60, 90, 120]
/** 15m · 1h · 1h30 — MK Time Picker's chip labels. */
export const durationLabel = (m: number): string => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}`)
