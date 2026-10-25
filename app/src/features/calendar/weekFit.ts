// Polish D (2026-09-26 audit): how many day columns fit, and when the Unscheduled rail steps aside.
//
// Every width here is in the PAGE's CSS px — the space CalendarGrid's wrapper and CalendarPage's
// shell are laid out in. The root 125% zoom (lib/uiScale.ts) is already inside these numbers: a
// 1280px window lays the page out at ~1024px, which is why a 244px rail next to 170px columns left
// room for two days of a seven-day week.
//
// The export's reading (design-export/CALENDAR.md §6 "Narrow column (< 170px): short-tier type
// scale, start time only. Width never changes what the block is."): 170px is where a column turns
// NARROW, not a floor — Calendar.dc.html 1a's own 1300px desktop would give a week ~102px columns
// beside its 244px rail. So a column shrinks to MIN_COL_W and draws the narrow tier; only below
// that does the grid scroll sideways (Kai 2026-07-21: scroll rather than crush).

/** The time gutter (CalendarGrid.css `.fc-timegrid-axis`, 58px × the zoom it re-applies). */
export const TIME_AXIS_W = 58
/** §6: a day column narrower than this draws the narrow tier. */
export const NARROW_COL_W = 170
/** The narrowest a day column gets before the grid scrolls sideways instead: an 11px one-line
 * title and a start time still read here. */
export const MIN_COL_W = 80
/** `.cal-main` side padding + the grid card's border: none since the grid runs edge to edge
 * (Kai 2026-10-14, "I don't want any wasted spaces"; was 22 × 2 + 2). */
export const GRID_CHROME_W = 0
/** `.cal-railsplit`, the resize handle between the rail and the grid. */
export const RAIL_SPLIT_W = 7
/** The folded rail: a strip holding the round show button and its "Unscheduled · N" label. */
export const RAIL_TAB_W = 34

export type CalViewKind = 'day' | 'ndays' | 'week' | 'month'

/** Day columns a time-grid view draws: the (rolling) week loses the `hiddenDays` weekdays the grid
 * hides — "Show weekends" off hides the user's weekend (p7e A15). Month isn't a time grid (0). */
export function visibleDayCount(view: CalViewKind, dayCount: number, hiddenDays = 0): number {
  if (view === 'month') return 0
  if (view === 'day') return 1
  if (view === 'week') return 7 - hiddenDays
  return Math.max(1, dayCount)
}

/** cal-wave: the second clock's column in the gutter (CalendarGrid.css `.kf-cal-2z`). */
export const ZONE2_W = 50

/** CalendarGrid's wrapper min-width: below it the grid scrolls sideways. None for one day. */
export function gridMinWidth(days: number, axis = TIME_AXIS_W): number | undefined {
  return days > 1 ? axis + days * MIN_COL_W : undefined
}

/** One day column's width in a grid `gridWidth` wide (the time gutter comes off first). */
export function columnWidth(gridWidth: number, days: number): number {
  return days > 0 ? Math.max(0, gridWidth - TIME_AXIS_W) / days : 0
}

/** §6 narrow tier: more than one day, and each column under 170px. An unmeasured grid (0) isn't. */
export function isNarrow(gridWidth: number, days: number): boolean {
  return gridWidth > 0 && days > 1 && columnWidth(gridWidth, days) < NARROW_COL_W
}

/** Should the Unscheduled rail step aside by default? Only when the visible days would drop under
 * MIN_COL_W beside it. One day (or month) never needs the room; a user's explicit open/closed
 * choice overrides this (CalendarPage). `shellWidth` 0 = not measured yet → leave the rail be. */
export function railYields(shellWidth: number, railWidth: number, days: number): boolean {
  if (shellWidth <= 0 || days <= 1) return false
  const grid = shellWidth - GRID_CHROME_W - RAIL_SPLIT_W - railWidth
  return columnWidth(grid, days) < MIN_COL_W
}

/** cal-wave (Akiflow's "Responsive" view, Kai 2026-10-25): a day column's comfortable width when the
 * day count follows the window. Just under NARROW_COL_W, so a fitted week still reads at full size
 * on a wide screen; ponytail: fixed, a Density-aware value if Kai wants it to track S/M/L. */
export const RESPONSIVE_COL_W = 150

/** How many day columns of at least `colW` fit in a grid `gridWidth` wide (the gutter `axis` off first),
 * from 1 to `max`. An unmeasured grid (0) answers `max`. */
export function fitDays(gridWidth: number, colW: number, max = 7, axis = TIME_AXIS_W): number {
  if (gridWidth <= 0) return max
  return Math.min(max, Math.max(1, Math.floor((gridWidth - axis) / colW)))
}

/** The fields fitHours reads from a block. */
export interface HourSpan {
  starts_at: string
  ends_at: string
  all_day: boolean
}

/** cal-wave (Akiflow's "Dynamic" view): the hour range that fits the shown days' timed blocks, on the
 * user's clock — an hour of room either side, at least `minSpan` hours, inside 0–24. A block running
 * past midnight opens the range to that edge. No block: `fallback`. `days` are the shown "YYYY-MM-DD"
 * keys in order; `dayOf` / `hourOf` read an instant on the user's zone (eventTime / dateShortcuts). */
export function fitHours(
  blocks: readonly HourSpan[],
  days: readonly string[],
  dayOf: (d: Date) => string,
  hourOf: (d: Date) => number,
  { pad = 1, minSpan = 6, fallback = [8, 18] as [number, number] } = {},
): [number, number] {
  if (!days.length) return fallback
  const first = days[0]
  const last = days[days.length - 1]
  let lo = 24
  let hi = 0
  for (const b of blocks) {
    if (b.all_day) continue
    const s = new Date(b.starts_at)
    const e = new Date(b.ends_at)
    const sd = dayOf(s)
    const ed = dayOf(new Date(e.getTime() - 1)) // an end at midnight belongs to the day before
    if (ed < first || sd > last) continue
    const end = hourOf(e) || 24
    const parts: [number, number][] =
      sd === ed
        ? [[hourOf(s), end]]
        : [
            ...(sd >= first ? [[hourOf(s), 24] as [number, number]] : []),
            ...(ed <= last ? [[0, end] as [number, number]] : []),
            ...(days.some((d) => d > sd && d < ed) ? [[0, 24] as [number, number]] : []),
          ]
    for (const [a, z] of parts) {
      lo = Math.min(lo, Math.floor(a))
      hi = Math.max(hi, Math.ceil(z))
    }
  }
  if (lo >= hi) return fallback
  lo = Math.max(0, lo - pad)
  hi = Math.min(24, hi + pad)
  while (hi - lo < minSpan) {
    if (hi < 24) hi++
    else lo--
  }
  return [lo, hi]
}
