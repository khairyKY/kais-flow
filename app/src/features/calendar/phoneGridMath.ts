// The phone calendar's pure half (Calendar Phone.dc.html 7a–7n, SCREENS-2026-09-28-sheets §Calendar
// (phone)). Days are Cairo date keys and times minutes into the Cairo day (B2), like the pickers, so
// the grid reads the same on any device zone. Geometry: 64px hours, 15-min snap (16px).

import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { addDays, busyOnDay, dayHint, durationLabel, freeSlots, fromMin, toMin } from '../../components/pickerMath'
import { suggestTimes } from '../tasks/taskSheetMath'
import { FLICK_VELOCITY, SWIPE_COMMIT } from '../tasks/swipe'
import { cairoTimeKey, cairoToIso } from './eventTime'
import { isMultiDaySpan, spanDays } from './daySpans'
import { appZone } from '../../lib/appZone'
import { clockRange, clockText } from '../../lib/clock'

export const HOUR_PX = 64
export const SNAP_MIN = 15
export const DAY_MIN = 1440
export const minToPx = (m: number): number => (m * HOUR_PX) / 60
export const pxToMin = (px: number): number => (px * 60) / HOUR_PX
export const snap = (m: number): number => Math.round(m / SNAP_MIN) * SNAP_MIN

export type PhoneView = 'day' | '3day' | 'week' | 'month'
const VIEW_DAYS: Record<Exclude<PhoneView, 'month'>, number> = { day: 1, '3day': 3, week: 7 }

const dayNum = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000
const fmt = (key: string, o: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...o })

/** The week strip's page: rolling weeks from today (Kai 2026-07-21, "the week starts today") — the
 * seven days holding `day`, paged in sevens from `today`. */
export function weekPage(day: string, today: string): string[] {
  const start = addDays(today, Math.floor((dayNum(day) - dayNum(today)) / 7) * 7)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The days on screen: the anchor day, three from it, the week page it sits in, or its month's weeks. */
export function visibleDays(view: PhoneView, anchor: string, today: string, mondayFirst = false): string[] {
  if (view === 'month') return monthGrid(anchor, mondayFirst)
  if (view === 'week') return weekPage(anchor, today)
  return Array.from({ length: VIEW_DAYS[view] }, (_, i) => addDays(anchor, i))
}

/** How far one swipe (or a view's page) moves the anchor (a month pages by months — monthGrid). */
export const viewStep = (view: PhoneView): number => (view === 'month' ? 0 : VIEW_DAYS[view])

// ── Month (phone parity with the desktop's M view; 3e's "month-view form" at phone size) ──

/** The weeks holding `anchor`'s month, Sunday (or Monday) first: 5 or 6 rows of 7 date keys. */
export function monthGrid(anchor: string, mondayFirst = false): string[] {
  const first = `${anchor.slice(0, 7)}-01`
  const dow = new Date(`${first}T12:00:00Z`).getUTCDay()
  const back = mondayFirst ? (dow + 6) % 7 : dow
  const [y, m] = first.split('-').map(Number)
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: Math.ceil((back + length) / 7) * 7 }, (_, i) => addDays(first, i - back))
}

/** The first of the month `n` months from `key`'s. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}

/** "October 2026" */
export const monthTitle = (key: string): string => fmt(key, { month: 'long', year: 'numeric' })

/** The header title: "Sunday, Sep 27" · "Sep 27 – 29" · "Sep 27 – Oct 3". */
export function viewTitle(days: readonly string[]): string {
  const a = days[0]
  const b = days[days.length - 1]
  if (days.length === 1) return fmt(a, { weekday: 'long', month: 'short', day: 'numeric' })
  const tail = a.slice(0, 7) === b.slice(0, 7) ? String(Number(b.slice(8))) : fmt(b, { month: 'short', day: 'numeric' })
  return `${fmt(a, { month: 'short', day: 'numeric' })} – ${tail}`
}

/** The 3-days row's hint in the view sheet: "Sun–Tue". */
export const weekdayRange = (days: readonly string[]): string => `${fmt(days[0], { weekday: 'short' })}–${fmt(days[days.length - 1], { weekday: 'short' })}`

/** A column header in the 3-day / week view: "Sun 27" (week: "S 27"). */
export const columnLabel = (key: string, narrow: boolean): string => `${fmt(key, { weekday: narrow ? 'narrow' : 'short' })} ${Number(key.slice(8))}`

// ── Blocks ──

export interface Span {
  day: string
  /** Minutes into `day`; `end` may pass 1440 for a block that runs over midnight. */
  start: number
  end: number
}

/** An event's span from its own Cairo start day. */
export function eventSpan(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>): Span {
  const s = new Date(e.starts_at)
  const start = toMin(cairoTimeKey(s))
  return { day: cairoDateKey(s), start, end: start + Math.round((Date.parse(e.ends_at) - s.getTime()) / 60_000) }
}

/** The instants to store for a span (24:00 is the next day's 00:00). */
export function spanIso(s: Span): { starts_at: string; ends_at: string } {
  const at = (m: number) => cairoToIso(addDays(s.day, Math.floor(m / DAY_MIN)), fromMin(((m % DAY_MIN) + DAY_MIN) % DAY_MIN))
  return { starts_at: at(s.start), ends_at: at(s.end) }
}

/** One day's piece of a timed block on the grid. Calendar 3e "spans midnight": `from` — it began the
 * day before (its top is cut at 00:00); `into` — it runs on past this day's midnight. */
export interface DayBlock<E> {
  event: E
  start: number
  end: number
  from: boolean
  into: boolean
}

/** The timed, live events drawn on day `day` (the user's zone), clipped to it (over midnight: from
 * 00:00 / to 24:00). A block a day or longer is a multi-day span — the all-day row's (allDayOn). */
export function dayBlocks<E extends CalendarEvent>(events: readonly E[], day: string, zone: string = appZone()): DayBlock<E>[] {
  const out: DayBlock<E>[] = []
  for (const e of events) {
    if (e.deleted_at || e.all_day || isMultiDaySpan(e, zone)) continue
    const { first, last } = spanDays(e, zone)
    if (first > day || last < day) continue
    const start = first < day ? 0 : toMin(cairoTimeKey(new Date(e.starts_at)))
    const end = cairoDateKey(new Date(e.ends_at)) > day ? DAY_MIN : toMin(cairoTimeKey(new Date(e.ends_at)))
    if (end > start) out.push({ event: e, start, end, from: first < day, into: last > day })
  }
  return out
}

/** The all-day row's blocks on any of `days`: all-day events — dates in no zone (QuickCreate and a
 * synced all-day event store T00:00Z, the end exclusive), read as dates, not instants — and timed
 * multi-day spans (Calendar 3e), read on the user's zone. */
export function allDayOn<E extends CalendarEvent>(events: readonly E[], days: readonly string[], zone: string = appZone()): E[] {
  return events.filter((e) => {
    if (e.deleted_at || !(e.all_day || isMultiDaySpan(e, zone))) return false
    const { first, last } = spanDays(e, zone)
    return days.some((d) => first <= d && d <= last)
  })
}

export type DragMode = 'move' | 'top' | 'bottom'

/** Where a lifted block lands: moved by `dMin` (and `dDay` columns), start and end on the 15-min
 * grid, inside the day, never shorter than one snap. A resize moves only its own edge. */
export function dragSpan(orig: Span, mode: DragMode, dMin: number, dDay = 0): Span {
  if (mode === 'top') return { ...orig, start: Math.min(Math.max(0, snap(orig.start + dMin)), orig.end - SNAP_MIN) }
  if (mode === 'bottom') return { ...orig, end: Math.max(Math.min(DAY_MIN, snap(orig.end + dMin)), orig.start + SNAP_MIN) }
  const len = orig.end - orig.start
  const start = Math.min(Math.max(0, snap(orig.start + dMin)), Math.max(0, DAY_MIN - len))
  return { day: addDays(orig.day, dDay), start, end: start + len }
}

/** The time bubble in the hour gutter: the start while moving, the dragged edge · length while resizing (7f). */
export function bubbleText(s: Span, mode: DragMode): string {
  if (mode === 'move') return clockText(fromMin(s.start))
  return `${clockText(fromMin(mode === 'top' ? s.start : s.end))} · ${durationLabel(s.end - s.start)}`
}

export const EDGE_PX = 48
/** px/ms — ~13px a frame at 60Hz, about 12 hours of grid in two seconds. */
export const EDGE_MAX_SPEED = 0.8

/** A lifted block dragged near the grid's top or bottom edge scrolls it: px/ms (− up, + down), 0
 * outside the 48px edge zones. The deeper into the zone, the faster; a finger past the edge is full speed. */
export function edgeScrollSpeed(y: number, top: number, bottom: number): number {
  const up = top + EDGE_PX - y
  if (up > 0) return -EDGE_MAX_SPEED * Math.min(1, up / EDGE_PX)
  const down = y - (bottom - EDGE_PX)
  return down > 0 ? EDGE_MAX_SPEED * Math.min(1, down / EDGE_PX) : 0
}

/** 7m's toast: "Moved to 4:15 PM" (another day: "Moved to Mon 28 4:15 PM") — the person's clock (lib/clock). */
export function movedText(from: Span, to: Span, today: string): string {
  return `Moved to ${to.day === from.day ? '' : `${dayHint(to.day, today)} `}${clockText(fromMin(to.start))}`
}

/** A tap on the empty grid: the quarter it landed in, room left for the default 30 minutes. */
export const tapStart = (minute: number): number => Math.min(Math.max(0, Math.floor(minute / SNAP_MIN) * SNAP_MIN), DAY_MIN - 30)

/** "3:00–3:30 PM" — or "15:00–15:30" on the 24-hour clock (lib/clock). */
export const rangeText = (start: number, end: number): string => clockRange(fromMin(start), end >= DAY_MIN ? '24:00' : fromMin(end))

/** Where a released day swipe goes: +1 the next page, −1 the previous, 0 springs back. Past
 * --swipe-commit (40%) of the column, or a fling the same way, commits. `dx` < 0 = finger went left. */
export function swipeStep(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (dx <= -width * SWIPE_COMMIT || (dx < 0 && velocity < -FLICK_VELOCITY)) return 1
  if (dx >= width * SWIPE_COMMIT || (dx > 0 && velocity > FLICK_VELOCITY)) return -1
  return 0
}

// ── cal-scroll (Kai 2026-10-29): a swipe glides freely through days, with momentum ──

/** Neighbour screens drawn either side while a swipe glides: a day's view reaches 3 days, 3 days reaches 6, a week 1 week. */
export const glidePanes = (step: number): number => (step <= 1 ? 3 : step <= 3 ? 2 : 1)

/** How quickly a fling slows (px/ms²): it carries v² / 2a further than the finger left it. */
export const GLIDE_DECEL = 0.0025

/** Where a swipe lets go to, in days: the finger's offset `dx` (px, + = towards earlier days) plus the fling's
 * momentum (`v` px/ms), settled on a day — on a week in the week view (seven narrow columns read as its page, the
 * strip's own) — and never past the screens drawn. A short flick that wouldn't reach the next day still moves one. */
export function glideTarget(dx: number, v: number, width: number, cols: number, step: number): number {
  const week = step >= 7
  const unit = week ? width : width / Math.max(1, cols)
  if (!(unit > 0)) return 0
  const reach = week ? 1 : glidePanes(step) * step
  let n = -Math.round((dx + (v * Math.abs(v)) / (2 * GLIDE_DECEL)) / unit)
  if (!n) n = swipeStep(dx, v, unit)
  n = Math.max(-reach, Math.min(reach, n))
  return n * (week ? 7 : 1)
}

/** The day offset a swipe at `dx` is showing (the header and the strip follow it while the finger moves). */
export function glidePeek(dx: number, width: number, cols: number, step: number): number {
  const week = step >= 7
  const unit = week ? width : width / Math.max(1, cols)
  if (!(unit > 0)) return 0
  const n = -Math.round(dx / unit)
  return (n || 0) * (week ? 7 : 1)
}

/** The settle's length for `px` still to travel: a nudge is quick, a long fling glides in (ms). */
export const glideMs = (px: number): number => Math.round(Math.min(480, Math.max(200, 160 + Math.abs(px) * 0.35)))

// ── Schedule sheet (7g / 7g2) ──

export interface PlaceSlot {
  day: string
  start: number
}

/** The Schedule sheet's next 3 free slots for a `dur`-minute task: today's (stepping through each gap
 * by the duration, like Suggest a time), or — nothing fits today — the first gap on each next day. */
export function scheduleSlots(events: readonly CalendarEvent[], now: Date, dur: number): { today: boolean; slots: PlaceSlot[] } {
  const today = cairoDateKey(now)
  const s = suggestTimes(events, null, now, dur)
  if (s.day === today && s.starts.length) return { today: true, slots: s.starts.map((start) => ({ day: today, start })) }
  const slots: PlaceSlot[] = []
  // ponytail: two weeks ahead is plenty for a phone sheet; a task no 08:00–20:00 gap holds gets none.
  for (let i = 1; i <= 14 && slots.length < 3; i++) {
    const d = addDays(today, i)
    const gap = freeSlots(busyOnDay(events, d), d, now, dur, 1)[0]
    if (gap) slots.push({ day: d, start: gap.start })
  }
  return { today: false, slots }
}

/** A slot pill: "2:00–2:30 PM" today, else "Tomorrow 9:00 AM" / "Tue 29 11:00 AM" (the person's clock). */
export function slotLabel(s: PlaceSlot, dur: number, today: string): string {
  if (s.day === today) return rangeText(s.start, s.start + dur)
  return `${s.day === addDays(today, 1) ? 'Tomorrow' : dayHint(s.day, today)} ${clockText(fromMin(s.start))}`
}
