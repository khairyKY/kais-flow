// Repeating calendar events (migration 0061): one stored row is a whole series — `recurrence_rule`
// (an RRULE body, "FREQ=WEEKLY") on the user's WALL clock, anchored at `starts_at`, minus the
// starts in `recurrence_exdates`. This turns such rows into the occurrences a reader draws or counts.
// Shared, pure and dependency-free so the app (features/calendar/series.ts), the MCP tools and the
// chat snapshot expand a series the same way. rrule itself is handed in (`RuleBetween`): Deno needs
// `npm:rrule`, the app bundles `rrule` — the notify/copy.ts pattern of one file, two runtimes.
//
// How: the rule runs in FLOATING time — the anchor's wall clock read as UTC fields — so "every Monday
// 09:00" stays 09:00 across a DST switch; each floating start is then placed on the zone's clock (the
// tz database via Intl, never the device's zone). An all-day row is a calendar date in no zone
// (stored as that date's UTC midnight), so its floating time IS its stored time.

export interface SeriesRow {
  id: string
  starts_at: string
  ends_at: string
  all_day: boolean
  recurrence_rule?: string | null
  recurrence_exdates?: readonly string[] | null
  deleted_at?: string | null
  /** Set on an occurrence this module made: it is passed through, never expanded again. */
  seriesId?: string
}

/** rrule's `between(after, before, inclusive)` for `rule` from `dtstart`, all in floating time. */
export type RuleBetween = (rule: string, dtstart: Date, after: Date, before: Date) => Date[]

const DAY = 86_400_000

const clocks = new Map<string, Intl.DateTimeFormat>()
function wallFields(t: number, zone: string): number {
  let f = clocks.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    clocks.set(zone, f)
  }
  const p: Record<string, number> = {}
  for (const { type, value } of f.formatToParts(t)) p[type] = Number(value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
}

/** Instant `t` on `zone`'s wall clock, as ms read as UTC (floating). */
export function toFloating(t: number, zone: string): number {
  return wallFields(t, zone) + (t % 1000)
}

/** A floating time (wall clock as UTC fields) -> the real instant in `zone`. Two passes, as
 * app/src/lib/dateShortcuts.ts wallToIso: the offset at the first guess can differ across a switch. */
export function fromFloating(wall: number, zone: string): number {
  const offset = (t: number) => wallFields(t, zone) - Math.floor(t / 1000) * 1000
  return wall - offset(wall - offset(wall))
}

/** RRULE's UTC stamp: "20261018T235959Z". */
export const ruleStamp = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '')

/** The rule as rrule must run it here. UNTIL is a real UTC instant (RFC 5545 for a zoned start — what
 * Google sends, what the Repeat editor and a split write); the rule runs in floating wall time, so a
 * timed row's UNTIL moves onto that clock. A date-only UNTIL, and an all-day row's, already is. */
export function floatingRule(rule: string, zone: string, allDay: boolean): string {
  if (allDay) return rule
  return rule.replace(/(^|;)UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/i, (_, sep, y, mo, d, h, mi, s) =>
    `${sep}UNTIL=${ruleStamp(toFloating(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), zone))}`)
}

/** Occurrence id: the series row's id + the occurrence's start. */
export const occurrenceId = (rowId: string, startIso: string): string => `${rowId}::${startIso}`

/** The series row id behind an occurrence id (or the id itself). */
export const rowIdOf = (id: string): string => id.split('::')[0]

/**
 * Every row as stored, except each live series row, which becomes its occurrences overlapping
 * [from, to): `{ ...row, id: "<row id>::<start ISO>", starts_at, ends_at, seriesId: row.id }`.
 * One-off rows (and rows already expanded) pass through untouched, in or out of the range — so a
 * reader sees exactly what it saw before, plus the repeats. Sorted by start when anything expanded.
 * A rule rrule can't read leaves its row as a one-off rather than break the reader.
 */
export function expandSeries<E extends SeriesRow>(rows: readonly E[], from: Date, to: Date, zone: string, between: RuleBetween): (E & { seriesId?: string })[] {
  if (!rows.some((r) => r.recurrence_rule && !r.seriesId)) return rows as E[]
  const lo = from.getTime()
  const hi = to.getTime()
  const out: (E & { seriesId?: string })[] = []
  for (const r of rows) {
    if (!r.recurrence_rule || r.seriesId) {
      out.push(r)
      continue
    }
    if (r.deleted_at) continue
    const start = Date.parse(r.starts_at)
    const dur = Math.max(0, Date.parse(r.ends_at) - start)
    const skip = new Set((r.recurrence_exdates ?? []).map((x) => new Date(x).toISOString()))
    // Offsets stay within ±14h, so a day either side (plus the length) holds every floating start
    // whose real occurrence can touch the range.
    const dtstart = new Date(r.all_day ? start : toFloating(start, zone))
    let starts: Date[]
    try {
      starts = between(floatingRule(r.recurrence_rule, zone, r.all_day), dtstart, new Date(lo - dur - DAY), new Date(hi + DAY))
    } catch {
      out.push(r)
      continue
    }
    for (const f of starts) {
      const s = r.all_day ? f.getTime() : fromFloating(f.getTime(), zone)
      const e = s + dur
      if (!(s < hi && e > lo) && !(r.all_day && s < hi + DAY && e > lo - DAY)) continue
      const iso = new Date(s).toISOString()
      if (skip.has(iso)) continue
      out.push({ ...r, id: occurrenceId(r.id, iso), starts_at: iso, ends_at: new Date(e).toISOString(), seriesId: r.id })
    }
  }
  return out.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// ── "This and following" (conductor decision 2026-10-12; cal-clicks 2026-10-26 made it one of the three answers
// every series change asks — app and MCP alike): the original row ends just before the occurrence (UNTIL) and a
// new row starts the series there. Google's split. Shared so features/calendar and the MCP tools split alike. ──

const ruleParts = (rule: string) => rule.split(';').map((p) => p.trim()).filter(Boolean)
const partKey = (p: string) => p.split('=')[0].toUpperCase()

/** The rule body with `set`'s parts replaced (null drops one), the rest in their order. */
export function withRuleParts(rule: string, set: Record<string, string | null>): string {
  const keys = new Set(Object.keys(set))
  const out = ruleParts(rule).filter((p) => !keys.has(partKey(p)))
  for (const [k, v] of Object.entries(set)) if (v != null) out.push(`${k}=${v}`)
  return out.join(';')
}

const rulePart = (rule: string, key: string) => ruleParts(rule).find((p) => partKey(p) === key)?.split('=')[1]

/** An instant of `row` on the clock its rule runs in (floating wall time; an all-day row's stored date already is). */
const floatingOf = (row: Pick<SeriesRow, 'all_day'>, at: string, zone: string) => (row.all_day ? Date.parse(at) : toFloating(Date.parse(at), zone))

/** The two rows a split leaves: the original, now ending before the occurrence, and the new series starting on it
 * (same rule — COUNT carries what was left of it — and the skips from there on). */
export interface SeriesSplit<E> {
  head: E
  tail: E
}

/**
 * Splits `row` at its occurrence `occ`. Null when nothing of the series is left before `occ` (it is the first live
 * occurrence): the caller edits the row in place then — no earlier block to keep.
 */
export function splitSeries<E extends SeriesRow>(row: E, occ: Pick<SeriesRow, 'starts_at' | 'ends_at'>, tailId: string, now: string, zone: string, between: RuleBetween): SeriesSplit<E> | null {
  const rule = row.recurrence_rule
  if (!rule) return null
  const at = Date.parse(occ.starts_at)
  const dtstart = new Date(floatingOf(row, row.starts_at, zone))
  let earlier: Date[]
  try {
    earlier = between(floatingRule(rule, zone, row.all_day), dtstart, dtstart, new Date(floatingOf(row, occ.starts_at, zone) - 1))
  } catch {
    return null
  }
  const exdates = (row.recurrence_exdates ?? []).map((x) => new Date(x).toISOString())
  const skip = new Set(exdates)
  const real = (f: Date) => new Date(row.all_day ? f.getTime() : fromFloating(f.getTime(), zone)).toISOString()
  if (!earlier.some((f) => !skip.has(real(f)))) return null
  const count = Number(rulePart(rule, 'COUNT'))
  const { seriesId: _occ, ...base } = row
  return {
    head: {
      ...base,
      // UNTIL is UTC (RFC 5545; floatingRule reads it on the wall clock): a second before.
      recurrence_rule: withRuleParts(rule, { COUNT: null, UNTIL: ruleStamp(at - 1000) }),
      recurrence_exdates: exdates.filter((x) => Date.parse(x) < at),
      updated_at: now,
    } as unknown as E,
    tail: {
      ...base,
      id: tailId,
      starts_at: occ.starts_at,
      ends_at: occ.ends_at,
      // COUNT counts every start the rule makes, skipped or not (RFC 5545) — what's left after the head's.
      recurrence_rule: count > 0 ? withRuleParts(rule, { COUNT: String(Math.max(1, count - earlier.length)) }) : rule,
      recurrence_exdates: exdates.filter((x) => Date.parse(x) >= at),
      // A series of its own: "All events" on either half leaves the other; Google's id stays on the head.
      series_id: null,
      gcal_id: null,
      gcal_etag: null,
      source: 'native',
      created_at: now,
      updated_at: now,
    } as unknown as E,
  }
}
