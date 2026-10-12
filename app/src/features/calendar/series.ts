import { RRule } from 'rrule'
import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { expandSeries, floatingRule, fromFloating, rowIdOf, ruleStamp, toFloating, type RuleBetween } from '../../../../supabase/functions/_shared/series.ts'
import { zoneToIso } from './eventTime'

// ── Repeating events, the app half (migration 0061; the expansion itself is the shared
// supabase/functions/_shared/series.ts, so the MCP and chat functions read a series the same way).
// Reads: `expandEvents` — features/calendar/api's useCalendarEvents and pickerMath's busy/marks run
// every reader through it. Writes: the pure row edits below, which calendar/api applies through the
// outbox. Editing rules (decision 2026-10-12): the popover's rows (title, colour, project, repeat,
// time of day, length) change the whole series; dragging one occurrence, or deleting "This event",
// skips just that start (an exdate) and, for a drag, leaves a detached copy at the new time. ──

/** rrule's half of the expansion (the MCP function hands in the same, from npm:rrule). */
export const ruleBetween: RuleBetween = (rule, dtstart, after, before) => new RRule({ ...RRule.parseString(rule), dtstart }).between(after, before, true)

/** The rows with every live series expanded into its occurrences overlapping [from, to), on `zone`'s
 * clock (the user's). Idempotent: occurrences pass through. */
export function expandEvents<E extends CalendarEvent>(events: readonly E[], from: Date, to: Date, zone: string = appZone()): E[] {
  return expandSeries(events, from, to, zone, ruleBetween)
}

const DAY = 86_400_000

/** What readers that don't page see: ~four months back (Weekly Review's 8-week trend, Overdue) to a
 * year ahead (Plan's next free slot, the date picker's dots). Day-granular, so it's stable all day. */
export function eventWindow(now: Date = new Date()): { from: Date; to: Date } {
  const day = Date.parse(`${zoneDateKey(now)}T00:00:00.000Z`)
  return { from: new Date(day - 120 * DAY), to: new Date(day + 370 * DAY) }
}

export const isRepeating = (e: Pick<CalendarEvent, 'recurrence_rule'>): boolean => !!e.recurrence_rule

/** The stored row an on-screen block belongs to: its series row for an occurrence, else itself. */
export function rowOf<E extends Pick<CalendarEvent, 'id' | 'seriesId'>>(e: E, rows: readonly CalendarEvent[]): CalendarEvent | undefined {
  const id = e.seriesId ?? rowIdOf(e.id)
  return rows.find((r) => r.id === id)
}

const iso = (s: string) => new Date(s).toISOString()

/** The series skips the occurrence starting at `start`. */
export function withExdate(row: CalendarEvent, start: string): CalendarEvent {
  const ex = row.recurrence_exdates ?? []
  return ex.some((x) => iso(x) === iso(start)) ? row : { ...row, recurrence_exdates: [...ex, iso(start)] }
}

/** …and stops skipping it (Undo). */
export function withoutExdate(row: CalendarEvent, start: string): CalendarEvent {
  return { ...row, recurrence_exdates: (row.recurrence_exdates ?? []).filter((x) => iso(x) !== iso(start)) }
}

/** One occurrence dragged out of its series: a one-off row of its own at the new time. */
export function detachedCopy(row: CalendarEvent, startsAt: string, endsAt: string, allDay: boolean, id: string, now: string): CalendarEvent {
  const { seriesId: _occ, ...rest } = row
  return { ...rest, id, starts_at: startsAt, ends_at: endsAt, all_day: allDay, recurrence_rule: null, recurrence_exdates: [], series_id: row.id, created_at: now, updated_at: now }
}

/** The whole series at a new time of day / length (`time` "HH:MM" on `zone`'s clock): the anchor
 * keeps its date, and every skipped start moves with it so it still names the same occurrence. */
export function retimeSeries(row: CalendarEvent, time: string, minutes: number, zone: string = appZone()): CalendarEvent {
  const at = (s: string) => zoneToIso(zoneDateKey(new Date(s), zone), time, zone)
  const starts = at(row.starts_at)
  const ends = new Date(Date.parse(starts) + minutes * 60_000).toISOString()
  return { ...row, starts_at: starts, ends_at: ends, recurrence_exdates: (row.recurrence_exdates ?? []).map(at) }
}

/** Repeat set from a block: `rule` null = does not repeat. From an occurrence, the series re-anchors
 * on it — the block that was clicked keeps its place (earlier repeats go, later skips stay). */
export function rerule(row: CalendarEvent, occ: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'seriesId'>, rule: string | null): CalendarEvent {
  if (!occ.seriesId) return { ...row, recurrence_rule: rule, recurrence_exdates: rule ? row.recurrence_exdates ?? [] : [] }
  const later = (row.recurrence_exdates ?? []).filter((x) => Date.parse(x) > Date.parse(occ.starts_at))
  return { ...row, starts_at: occ.starts_at, ends_at: occ.ends_at, recurrence_rule: rule, recurrence_exdates: rule ? later : [] }
}

// ── "This and following" (conductor decision 2026-10-12): a repeat changed — or the series re-timed —
// from a LATER occurrence must not erase or move the earlier ones. Google's split: the original row
// ends just before the clicked occurrence (UNTIL), and a new row starts the series there. ──

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

/** An instant of `row` on the clock its rule runs in (series.ts in _shared: floating wall time; an
 * all-day row's stored date is already that). */
const floatingOf = (row: Pick<CalendarEvent, 'all_day'>, at: string, zone: string) => (row.all_day ? Date.parse(at) : toFloating(Date.parse(at), zone))

/** The two rows a split leaves: the original, now ending before the occurrence, and the new series
 * starting on it (same rule — COUNT carries what was left of it — and the skips from there on). */
export interface SeriesSplit {
  head: CalendarEvent
  tail: CalendarEvent
}

/**
 * Splits `row` at its occurrence `occ`. Null when nothing of the series is left before `occ` (it is
 * the first live occurrence): the caller edits the row in place then — no earlier block to keep.
 */
export function splitSeries(
  row: CalendarEvent,
  occ: Pick<CalendarEvent, 'starts_at' | 'ends_at'>,
  tailId: string,
  now: string,
  zone: string = appZone(),
  between: RuleBetween = ruleBetween,
): SeriesSplit | null {
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
  const exdates = (row.recurrence_exdates ?? []).map(iso)
  const skip = new Set(exdates)
  const real = (f: Date) => new Date(row.all_day ? f.getTime() : fromFloating(f.getTime(), zone)).toISOString()
  if (!earlier.some((f) => !skip.has(real(f)))) return null
  const count = Number(rulePart(rule, 'COUNT'))
  const { seriesId: _occ, ...base } = row
  return {
    head: {
      ...base,
      // UNTIL is UTC (RFC 5545; _shared/series floatingRule reads it on the wall clock): a second before.
      recurrence_rule: withRuleParts(rule, { COUNT: null, UNTIL: ruleStamp(at - 1000) }),
      recurrence_exdates: exdates.filter((x) => Date.parse(x) < at),
      updated_at: now,
    },
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
    },
  }
}

/** A rule that doesn't fall on the series' own start (Saturday + "every weekday"): rrule never counts
 * that start, so the block that was clicked would vanish. Conductor 2026-10-13: the block stays where
 * it is as a one-off — detached from the series, like a moved occurrence (`keep`, series_id → the
 * series) — and the series starts at the rule's first start after it. Null when the start matches
 * (or the rule can't be read, or never fires within ~a year). */
export function alignToRule(
  row: CalendarEvent,
  keepId: string,
  now: string,
  zone: string = appZone(),
  between: RuleBetween = ruleBetween,
): { series: CalendarEvent; keep: CalendarEvent } | null {
  const rule = row.recurrence_rule
  if (!rule) return null
  const dtstart = new Date(floatingOf(row, row.starts_at, zone))
  let first: Date | undefined
  try {
    first = between(floatingRule(rule, zone, row.all_day), dtstart, dtstart, new Date(dtstart.getTime() + 400 * DAY))[0]
  } catch {
    return null
  }
  if (!first) return null
  const start = row.all_day ? first.getTime() : fromFloating(first.getTime(), zone)
  if (start === Date.parse(row.starts_at)) return null
  const len = Date.parse(row.ends_at) - Date.parse(row.starts_at)
  return {
    series: {
      ...row,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + len).toISOString(),
      recurrence_exdates: (row.recurrence_exdates ?? []).filter((x) => Date.parse(x) >= start),
      updated_at: now,
    },
    keep: detachedCopy(row, row.starts_at, row.ends_at, row.all_day, keepId, now),
  }
}

/** The block a popover / sheet is about, after an edit that may have changed it under it (a repeat
 * re-anchored or re-timed): by id, else the same series' occurrence nearest where it was. */
export function findBlock<E extends CalendarEvent>(events: readonly E[], id: string, start: string): E | undefined {
  const exact = events.find((e) => e.id === id)
  if (exact) return exact
  const row = rowIdOf(id)
  const at = Date.parse(start)
  const far = (e: E) => Math.abs(Date.parse(e.starts_at) - at)
  let best: E | undefined
  for (const e of events) if ((e.seriesId ?? e.id) === row && (!best || far(e) < far(best))) best = e
  return best
}
