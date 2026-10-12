// design-export/Calendar.dc.html 3e — the two layout cases where a block crosses a day boundary, as
// pure functions so the desktop grid (CalendarGrid, FullCalendar) and the phone grid (PhoneGrid) cut
// it the same way. Days are dates on the user's clock (lib/appZone), never the device's.
//
// · multi-day span — an all-day block over two or more dates, or a timed one lasting a day or more:
//   "One logical pill in three segment shapes: only outer corners round; open edges carry » / «.
//   Title on the first visible segment only." It lives in the all-day band, one piece per day.
// · spans midnight — a timed block shorter than a day that runs past 00:00 stays in the time grid,
//   cut at midnight: "Continues-into: bottom corners square, ⌄ <end> at the cut. Continues-from:
//   top square, ⌃ from <start>."

import { addDays } from '../../components/pickerMath'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'

const DAY_MS = 86_400_000

type Times = Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>

/** The first and last date a block covers. An all-day block's dates are in no zone, its end exclusive
 * (QuickCreate and a synced all-day event store T00:00Z); a timed one's are read on `zone`'s clock,
 * and a block ending exactly at midnight doesn't touch the day after. */
export function spanDays(e: Times, zone: string): { first: string; last: string } {
  if (e.all_day) {
    const first = e.starts_at.slice(0, 10)
    const end = e.ends_at.slice(0, 10)
    return { first, last: end > first ? addDays(end, -1) : first }
  }
  const start = Date.parse(e.starts_at)
  const end = Math.max(start, Date.parse(e.ends_at) - 1)
  return { first: zoneDateKey(new Date(start), zone), last: zoneDateKey(new Date(end), zone) }
}

/** 3e "multi-day span": all-day over 2+ dates, or timed for 24 hours or more — the all-day band's. */
export function isMultiDaySpan(e: Times, zone: string): boolean {
  if (e.all_day) {
    const { first, last } = spanDays(e, zone)
    return last > first
  }
  return Date.parse(e.ends_at) - Date.parse(e.starts_at) >= DAY_MS
}

export type SegShape = 'start' | 'middle' | 'end'

export interface BandSegment {
  day: string
  /** Which corners round: start = left, end = right, middle = none. */
  shape: SegShape
  /** "Offsite »" · "« »" · "« ends 3 PM" — the title on the first visible piece only. */
  label: string
}

/**
 * The pieces of a multi-day span on the `days` shown (sorted date keys), one per covered day.
 * `clock` writes a time of day the way the grid does (12/24h). Empty when none of it is in view.
 */
export function bandSegments(e: Times & Pick<CalendarEvent, 'title'>, days: readonly string[], zone: string, clock: (ms: number) => string): BandSegment[] {
  const { first, last } = spanDays(e, zone)
  const out: BandSegment[] = []
  for (const day of days) {
    if (day < first || day > last) continue
    const from = day > first
    const into = day < last
    const ends = !into && !e.all_day ? `ends ${clock(Date.parse(e.ends_at))}` : null
    const title = out.length === 0 ? e.title : null
    const label = [from && '«', title, title && ends ? `· ${ends}` : ends, into && '»'].filter(Boolean).join(' ')
    out.push({ day, shape: !from ? 'start' : !into ? 'end' : 'middle', label })
  }
  return out
}

/** The midnight cut of a timed block shorter than a day, on one of its days: what its open edges read.
 * `into` — it runs on past this day's midnight ("⌄ 1:30 AM"); `from` — it began the day before
 * ("⌃ from 11 PM"). Null on an edge that isn't cut. */
export function midnightCut(e: Times, day: string, zone: string, clock: (ms: number) => string): { into: string | null; from: string | null } {
  if (e.all_day) return { into: null, from: null }
  const { first, last } = spanDays(e, zone)
  return {
    into: day < last ? `⌄ ${clock(Date.parse(e.ends_at))}` : null,
    from: day > first ? `⌃ from ${clock(Date.parse(e.starts_at))}` : null,
  }
}

/** The phone's all-day chip row holds one chip per block for all the shown days: the span's marks
 * for the shown stretch as a whole — « it began before them, » it runs on after them, its end time
 * when it ends inside them. */
export function bandChipLabel(e: Times & Pick<CalendarEvent, 'title'>, days: readonly string[], zone: string, clock: (ms: number) => string): string {
  const segs = bandSegments(e, days, zone, clock)
  if (!segs.length) return e.title
  const from = segs[0].shape !== 'start'
  const into = segs[segs.length - 1].shape !== 'end'
  const ends = !into && !e.all_day ? `· ends ${clock(Date.parse(e.ends_at))}` : null
  return [from && '«', e.title, ends, into && '»'].filter(Boolean).join(' ')
}
