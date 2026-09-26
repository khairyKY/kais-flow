import { describe, expect, it } from 'vitest'
import { GRID_CHROME_W, MIN_COL_W, RAIL_SPLIT_W, RAIL_TAB_W, TIME_AXIS_W, columnWidth, gridMinWidth, isNarrow, railYields, visibleDayCount } from './weekFit'

// Shell widths measured on the prod build at the DEFAULT 125% interface size (window − 242px
// sidebar − 80px page padding, ÷ 1.25): 1280 → 702, 1440 → 830, 1600 → 958.
const SHELL = { w1280: 702, w1440: 830, w1600: 958 }
const RAIL = 244 // the default rail (Calendar.dc.html 1a)
const gridBesideRail = (shell: number, rail = RAIL) => shell - GRID_CHROME_W - RAIL_SPLIT_W - rail

describe('visibleDayCount', () => {
  it('counts the columns each view draws', () => {
    expect(visibleDayCount('day', 4, true)).toBe(1)
    expect(visibleDayCount('ndays', 4, true)).toBe(4)
    expect(visibleDayCount('week', 4, true)).toBe(7)
    expect(visibleDayCount('week', 4, false)).toBe(5)
    expect(visibleDayCount('month', 4, true)).toBe(0)
  })
})

describe('gridMinWidth', () => {
  it('is the gutter plus MIN_COL_W per day, and nothing for a single day', () => {
    expect(gridMinWidth(7)).toBe(TIME_AXIS_W + 7 * MIN_COL_W)
    expect(gridMinWidth(1)).toBeUndefined()
  })
})

describe('isNarrow (CALENDAR.md §6: a column under 170px draws the narrow tier)', () => {
  it('a week beside the rail at 1280 is narrow; one day never is', () => {
    expect(isNarrow(gridBesideRail(SHELL.w1280), 7)).toBe(true)
    expect(isNarrow(gridBesideRail(SHELL.w1280), 1)).toBe(false)
  })
  it('3 days at 1600 keep full-width columns, 4 days turn narrow', () => {
    expect(isNarrow(gridBesideRail(SHELL.w1600), 3)).toBe(false)
    expect(isNarrow(gridBesideRail(SHELL.w1600), 4)).toBe(true)
  })
  it('an unmeasured grid (0) is not narrow', () => {
    expect(isNarrow(0, 7)).toBe(false)
  })
})

describe('railYields', () => {
  it('the week at 1280 and 1440 (125%) would drop under MIN_COL_W beside the rail → it steps aside', () => {
    expect(railYields(SHELL.w1280, RAIL, 7)).toBe(true)
    expect(railYields(SHELL.w1440, RAIL, 7)).toBe(true)
  })
  it('at 1600 the week keeps ≥ MIN_COL_W beside the default rail → it stays', () => {
    expect(columnWidth(gridBesideRail(SHELL.w1600), 7)).toBeGreaterThanOrEqual(MIN_COL_W)
    expect(railYields(SHELL.w1600, RAIL, 7)).toBe(false)
  })
  it('a wider rail the user dragged out yields sooner', () => {
    expect(railYields(SHELL.w1600, 400, 7)).toBe(true)
  })
  it('day, a 3-day view at 1280, month and an unmeasured shell leave the rail alone', () => {
    expect(railYields(SHELL.w1280, RAIL, 1)).toBe(false)
    expect(railYields(SHELL.w1280, RAIL, 3)).toBe(false)
    expect(railYields(SHELL.w1280, RAIL, 0)).toBe(false)
    expect(railYields(0, RAIL, 7)).toBe(false)
  })
  it('with the rail folded, all seven days fit at 1280 without scrolling', () => {
    const grid = SHELL.w1280 - GRID_CHROME_W - RAIL_TAB_W
    expect(columnWidth(grid, 7)).toBeGreaterThanOrEqual(MIN_COL_W)
    expect(grid).toBeGreaterThanOrEqual(gridMinWidth(7)!)
  })
})
