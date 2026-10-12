import { RRule } from 'rrule'
import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { expandSeries, rowIdOf, type RuleBetween } from '../../../../supabase/functions/_shared/series.ts'
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
