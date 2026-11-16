// Your own calendar link (v1.6.4 F5, migration 0096): the owner's events, Time blocks and scheduled tasks as an
// iCalendar feed (RFC 5545) for Apple Calendar / Outlook / Google Calendar. Pure and dependency-light, so the
// vitest suite (app/src/features/settings/calendarFeed.test.ts) runs it as is, and round-trips it through
// _shared/ics.ts parseFeed. index.ts does the database half.
//
// Repeats are written as their occurrences (_shared/series.ts expandSeries), not as RRULEs — simpler, and a
// calendar app can't misread an exception. Times are UTC ("…Z"); an all-day event is VALUE=DATE with an
// exclusive end, as the app stores it (a date in no zone, read at its noon — the MCP's firstDay / lastDay).
import { dateKey } from '../_shared/zone.ts'
import { expandSeries, type RuleBetween } from '../_shared/series.ts'

/** Per link, per hour. Calendar apps poll every hour or so and the answer is cached (max-age=300). */
export const HOURLY_LIMIT = 120
export const PAST_DAYS = 30
export const AHEAD_DAYS = 180

const DAY = 86_400_000

/** A `calendar_events` row as index.ts reads it (timestamps as ISO strings). */
export interface FeedRow {
  id: string
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  type: string
  task_id: string | null
  recurrence_rule: string | null
  recurrence_exdates: string[] | null
  updated_at: string
}

/** A task a Time block holds: its row, that occurrence's day (YYYY-MM-DD, the user's clock) and its title. */
export interface Held {
  slot_id: string
  slot_date: string
  title: string
}

export interface FeedEvent {
  uid: string
  summary: string
  description: string | null
  allDay: boolean
  /** ms: an instant, or an all-day event's first / exclusive end day at UTC midnight. */
  start: number
  end: number
  modified: number
}

export interface PlanOptions {
  zone: string
  from: Date
  to: Date
  /** false = every entry is "Busy", with no description. */
  titles: boolean
  /** "Include scheduled tasks": task blocks, and the tasks a Time block holds. */
  includeTasks: boolean
  between: RuleBetween
}

/** The window the feed covers around `now`. */
export const feedWindow = (now: Date) => ({ from: new Date(now.getTime() - PAST_DAYS * DAY), to: new Date(now.getTime() + AHEAD_DAYS * DAY) })

/** "20261018T235959Z". */
export const stamp = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '')
const dateOnly = (ms: number): string => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')

/** The rows as feed events: repeats expanded, task blocks only if asked, titles or "Busy". The rows are
 * already native only and live (index.ts's query); a block of a task that isn't open is dropped there too. */
export function planEvents(rows: readonly FeedRow[], held: readonly Held[], o: PlanOptions): FeedEvent[] {
  const kept = rows.filter((r) => o.includeTasks || !r.task_id)
  const occurrences = expandSeries(kept.map((r) => ({ ...r, deleted_at: null })), o.from, o.to, o.zone, o.between)
  // An all-day date is read at its noon (older rows hold the device's midnight); the end is exclusive.
  const day = (ms: number) => Math.floor((ms + DAY / 2) / DAY) * DAY
  return occurrences.map((e) => {
    const s = Date.parse(e.starts_at)
    const en = Date.parse(e.ends_at)
    const row = e.seriesId ?? e.id
    const first = day(s)
    const names = o.titles && o.includeTasks && e.type === 'time_block'
      ? held.filter((h) => h.slot_id === row && h.slot_date === dateKey(new Date(s), o.zone)).map((h) => h.title)
      : []
    return {
      uid: e.seriesId ? `${e.seriesId}-${stamp(s)}@kaisflow` : `${e.id}@kaisflow`,
      summary: o.titles ? e.title.trim() || 'Untitled' : 'Busy',
      description: names.length ? names.join('\n') : null,
      allDay: e.all_day,
      start: e.all_day ? first : s,
      end: e.all_day ? Math.max(day(en), first + DAY) : Math.max(en, s),
      modified: Date.parse(e.updated_at) || s,
    }
  })
}

/** RFC 5545 §3.3.11: `\`, `;`, `,` and line breaks escaped; other control characters dropped. */
export const escapeText = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')

const enc = new TextEncoder()

/** RFC 5545 §3.1: a line of at most 75 octets; the rest continues on lines starting with one space.
 * Never splits a character (a UTF-8 sequence, so Arabic survives). */
export function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let n = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (n + b > 75) {
      out.push(cur)
      cur = ' '
      n = 1
    }
    cur += ch
    n += b
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildCalendar(events: readonly FeedEvent[], zone: string, now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Kai's Flow//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    "X-WR-CALNAME:Kai's Flow",
    `X-WR-TIMEZONE:${zone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  const stampNow = stamp(now.getTime())
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stampNow}`,
      `LAST-MODIFIED:${stamp(e.modified)}`,
      e.allDay ? `DTSTART;VALUE=DATE:${dateOnly(e.start)}` : `DTSTART:${stamp(e.start)}`,
      e.allDay ? `DTEND;VALUE=DATE:${dateOnly(e.end)}` : `DTEND:${stamp(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    )
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    lines.push('TRANSP:OPAQUE', 'STATUS:CONFIRMED', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
