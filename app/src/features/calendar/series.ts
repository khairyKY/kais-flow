import { RRule } from 'rrule'
import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { expandSeries, floatingRule, fromFloating, rowIdOf, splitSeries as sharedSplit, toFloating, withRuleParts, type RuleBetween, type SeriesSplit as SharedSplit } from '../../../../supabase/functions/_shared/series.ts'
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

// ── "This and following" (conductor decision 2026-10-12): the split itself is _shared/series.ts's (the MCP
// tools split the same way); here it runs on the user's zone with the app's rrule. ──

export { withRuleParts }
export type SeriesSplit = SharedSplit<CalendarEvent>

/** _shared splitSeries on the user's clock. Null when `occ` is the series' first live occurrence. */
export function splitSeries(row: CalendarEvent, occ: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, tailId: string, now: string, zone: string = appZone(), between: RuleBetween = ruleBetween): SeriesSplit | null {
  return sharedSplit(row, occ, tailId, now, zone, between)
}

/** An instant of `row` on the clock its rule runs in (floating wall time; an all-day row's stored date already is). */
const floatingOf = (row: Pick<CalendarEvent, 'all_day'>, at: string, zone: string) => (row.all_day ? Date.parse(at) : toFloating(Date.parse(at), zone))

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
