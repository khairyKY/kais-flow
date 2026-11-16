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

/** "day 2 of 4" — which of a span's days `day` is, 1-based, and how many it covers. */
export function dayNumber(e: Times, day: string, zone: string): { n: number; of: number } {
  const { first, last } = spanDays(e, zone)
  const gap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
  return { n: gap(first, day) + 1, of: gap(first, last) + 1 }
}

/**
 * The pieces of a multi-day span on the `days` shown (sorted date keys), one per covered day.
 * `clock` writes a time of day the way the grid does (12/24h). Empty when none of it is in view.
 * F7: a timed span's first day reads "from 9 AM" and its last "until 5 PM"; a piece past the first
 * day counts itself ("« 2/4 »") so a day in the middle still says which of the days it is.
 */
export function bandSegments(e: Times & Pick<CalendarEvent, 'title'>, days: readonly string[], zone: string, clock: (ms: number) => string): BandSegment[] {
  const { first, last } = spanDays(e, zone)
  const out: BandSegment[] = []
  for (const day of days) {
    if (day < first || day > last) continue
    const from = day > first
    const into = day < last
    const note = e.all_day ? null : !from ? `from ${clock(Date.parse(e.starts_at))}` : !into ? `until ${clock(Date.parse(e.ends_at))}` : null
    const title = out.length === 0 ? e.title : null
    const count = from ? `${dayNumber(e, day, zone).n}/${dayNumber(e, day, zone).of}` : null
    const core = [title, count, note].filter(Boolean).join(' · ')
    out.push({ day, shape: !from ? 'start' : !into ? 'end' : 'middle', label: [from && '«', core, into && '»'].filter(Boolean).join(' ') })
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
 * for the shown stretch as a whole — « it began before them, » it runs on after them, "day 2 of 4" for
 * the first shown day (F7), and a timed span's times where they fall inside the view ("from 9 AM",
 * "until 5 PM"). One day shown and it's the middle of a timed span: "all day (Mon 9 AM – Wed 5 PM)". */
export function bandChipLabel(e: Times & Pick<CalendarEvent, 'title'>, days: readonly string[], zone: string, clock: (ms: number) => string): string {
  const segs = bandSegments(e, days, zone, clock)
  if (!segs.length) return e.title
  const from = segs[0].shape !== 'start'
  const into = segs[segs.length - 1].shape !== 'end'
  const { first, last } = spanDays(e, zone)
  const { n, of } = dayNumber(e, segs[0].day, zone)
  const dayName = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const notes = [
    of > 1 ? `day ${n} of ${of}` : null,
    e.all_day ? null : segs[0].day === first ? `from ${clock(Date.parse(e.starts_at))}` : null,
    e.all_day ? null : segs[segs.length - 1].day === last ? `until ${clock(Date.parse(e.ends_at))}` : null,
    !e.all_day && days.length === 1 && first < days[0] && days[0] < last ? `all day (${dayName(first)} ${clock(Date.parse(e.starts_at))} – ${dayName(last)} ${clock(Date.parse(e.ends_at))})` : null,
  ].filter(Boolean)
  return [from && '«', e.title, ...notes.map((x) => `· ${x}`), into && '»'].filter(Boolean).join(' ')
}
