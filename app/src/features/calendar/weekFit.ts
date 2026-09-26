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
/** `.cal-main` side padding (22 × 2) + the grid card's 1px border each side. */
export const GRID_CHROME_W = 46
/** `.cal-railsplit`, the resize handle between the rail and the grid. */
export const RAIL_SPLIT_W = 7
/** The folded rail: a strip holding the round show button and its "Unscheduled · N" label. */
export const RAIL_TAB_W = 34

export type CalViewKind = 'day' | 'ndays' | 'week' | 'month'

/** Day columns a time-grid view draws. Month isn't a time grid (0). */
export function visibleDayCount(view: CalViewKind, dayCount: number, showWeekends: boolean): number {
  if (view === 'month') return 0
  if (view === 'day') return 1
  if (view === 'week') return showWeekends ? 7 : 5
  return Math.max(1, dayCount)
}

/** CalendarGrid's wrapper min-width: below it the grid scrolls sideways. None for one day. */
export function gridMinWidth(days: number): number | undefined {
  return days > 1 ? TIME_AXIS_W + days * MIN_COL_W : undefined
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
