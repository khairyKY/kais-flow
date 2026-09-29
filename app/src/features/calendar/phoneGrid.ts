// The phone calendar's pure half (Calendar Phone.dc.html 7a–7n, SCREENS-2026-09-28-sheets §Calendar
// (phone)). Days are Cairo date keys and times minutes into the Cairo day (B2), like the pickers, so
// the grid reads the same on any device zone. Geometry: 64px hours, 15-min snap (16px).

import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { addDays, busyOnDay, dayHint, durationLabel, freeSlots, fromMin, toMin } from '../../components/pickerMath'
import { suggestTimes } from '../tasks/taskSheetMath'
import { FLICK_VELOCITY, SWIPE_COMMIT } from '../tasks/swipe'
import { cairoTimeKey, cairoToIso } from './eventTime'

export const HOUR_PX = 64
export const SNAP_MIN = 15
export const DAY_MIN = 1440
export const minToPx = (m: number): number => (m * HOUR_PX) / 60
export const pxToMin = (px: number): number => (px * 60) / HOUR_PX
export const snap = (m: number): number => Math.round(m / SNAP_MIN) * SNAP_MIN

export type PhoneView = 'day' | '3day' | 'week'
const VIEW_DAYS: Record<PhoneView, number> = { day: 1, '3day': 3, week: 7 }

const dayNum = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000
const fmt = (key: string, o: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...o })

/** The week strip's page: rolling weeks from today (Kai 2026-07-21, "the week starts today") — the
 * seven days holding `day`, paged in sevens from `today`. */
export function weekPage(day: string, today: string): string[] {
  const start = addDays(today, Math.floor((dayNum(day) - dayNum(today)) / 7) * 7)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The days on screen: the anchor day, three from it, or the week page it sits in. */
export function visibleDays(view: PhoneView, anchor: string, today: string): string[] {
  if (view === 'week') return weekPage(anchor, today)
  return Array.from({ length: VIEW_DAYS[view] }, (_, i) => addDays(anchor, i))
}

/** How far one swipe (or a view's page) moves the anchor. */
export const viewStep = (view: PhoneView): number => VIEW_DAYS[view]

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

/** The timed, live events drawn on Cairo day `day`, clipped to it (over midnight: from 00:00 / to 24:00). */
export function dayBlocks<E extends CalendarEvent>(events: readonly E[], day: string): { event: E; start: number; end: number }[] {
  const out: { event: E; start: number; end: number }[] = []
  for (const e of events) {
    if (e.deleted_at || e.all_day) continue
    const sd = cairoDateKey(new Date(e.starts_at))
    const ed = cairoDateKey(new Date(e.ends_at))
    if (sd > day || ed < day) continue
    const start = sd < day ? 0 : toMin(cairoTimeKey(new Date(e.starts_at)))
    const end = ed > day ? DAY_MIN : toMin(cairoTimeKey(new Date(e.ends_at)))
    if (end > start) out.push({ event: e, start, end })
  }
  return out
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
  if (mode === 'move') return fromMin(s.start)
  return `${fromMin(mode === 'top' ? s.start : s.end)} · ${durationLabel(s.end - s.start)}`
}

/** 7m's toast: "Moved to 16:15" (another day: "Moved to Mon 28 16:15"). */
export function movedText(from: Span, to: Span, today: string): string {
  return `Moved to ${to.day === from.day ? '' : `${dayHint(to.day, today)} `}${fromMin(to.start)}`
}

/** A tap on the empty grid: the quarter it landed in, room left for the default 30 minutes. */
export const tapStart = (minute: number): number => Math.min(Math.max(0, Math.floor(minute / SNAP_MIN) * SNAP_MIN), DAY_MIN - 30)

/** "15:00–15:30" */
export const rangeText = (start: number, end: number): string => `${fromMin(start)}–${end >= DAY_MIN ? '24:00' : fromMin(end)}`

/** Where a released day swipe goes: +1 the next page, −1 the previous, 0 springs back. Past
 * --swipe-commit (40%) of the column, or a fling the same way, commits. `dx` < 0 = finger went left. */
export function swipeStep(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (dx <= -width * SWIPE_COMMIT || (dx < 0 && velocity < -FLICK_VELOCITY)) return 1
  if (dx >= width * SWIPE_COMMIT || (dx > 0 && velocity > FLICK_VELOCITY)) return -1
  return 0
}

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

/** A slot pill: "14:00–14:30" today, else "Tomorrow 09:00" / "Tue 29 11:00". */
export function slotLabel(s: PlaceSlot, dur: number, today: string): string {
  if (s.day === today) return rangeText(s.start, s.start + dur)
  return `${s.day === addDays(today, 1) ? 'Tomorrow' : dayHint(s.day, today)} ${fromMin(s.start)}`
}
