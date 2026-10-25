import { describe, expect, it } from 'vitest'
import { GRID_CHROME_W, MIN_COL_W, RAIL_SPLIT_W, RAIL_TAB_W, RESPONSIVE_COL_W, TIME_AXIS_W, columnWidth, fitDays, fitHours, gridMinWidth, isNarrow, railYields, visibleDayCount } from './weekFit'

// Shell widths measured on the prod build at the DEFAULT 125% interface size (window − 242px
// sidebar − 80px page padding, ÷ 1.25): 1280 → 702, 1440 → 830, 1600 → 958.
const SHELL = { w1280: 702, w1440: 830, w1600: 958 }
const RAIL = 244 // the default rail (Calendar.dc.html 1a)
const gridBesideRail = (shell: number, rail = RAIL) => shell - GRID_CHROME_W - RAIL_SPLIT_W - rail

describe('visibleDayCount', () => {
  it('counts the columns each view draws', () => {
    expect(visibleDayCount('day', 4)).toBe(1)
    expect(visibleDayCount('ndays', 4)).toBe(4)
    expect(visibleDayCount('week', 4)).toBe(7)
    expect(visibleDayCount('week', 4, 2)).toBe(5) // Sat + Sun, or Fri + Sat
    expect(visibleDayCount('week', 4, 1)).toBe(6) // a Sunday-only weekend
    expect(visibleDayCount('month', 4)).toBe(0)
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

describe('fitDays (cal-wave: Responsive days, and an N-day view that drops days before it scrolls)', () => {
  it('fits whole columns of at least colW after the gutter, between 1 and max', () => {
    expect(fitDays(TIME_AXIS_W + 4 * RESPONSIVE_COL_W, RESPONSIVE_COL_W)).toBe(4)
    expect(fitDays(TIME_AXIS_W + 4 * RESPONSIVE_COL_W - 1, RESPONSIVE_COL_W)).toBe(3)
    expect(fitDays(3000, RESPONSIVE_COL_W)).toBe(7)
    expect(fitDays(3000, MIN_COL_W, 4)).toBe(4)
    expect(fitDays(40, MIN_COL_W)).toBe(1)
  })
  it('an unmeasured grid keeps the max', () => {
    expect(fitDays(0, MIN_COL_W, 5)).toBe(5)
  })
  it("Kai's 840px window at 125% (the rail folded): four days of MIN_COL_W fit, two Responsive ones", () => {
    const grid = 430 - RAIL_TAB_W // 840 ÷ 1.25 − the 242px sidebar = 430, then the folded rail's strip
    expect(fitDays(grid, MIN_COL_W, 4)).toBe(4)
    expect(fitDays(grid, RESPONSIVE_COL_W)).toBe(2)
  })
})

describe('fitHours (cal-wave: Akiflow\'s Dynamic view — the hours fit the shown days\' blocks)', () => {
  // Instants read on a fixed +03:00 clock, so the test doesn't depend on the runner's zone.
  const dayOf = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
  const hourOf = (d: Date) => { const x = new Date(d.getTime() + 3 * 3600_000); return x.getUTCHours() + x.getUTCMinutes() / 60 }
  const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+03:00`).toISOString()
  const b = (day: string, from: string, to: string, toDay = day) => ({ starts_at: at(day, from), ends_at: at(toDay, to), all_day: false })
  const D = ['2026-10-21', '2026-10-22']
  it('the earliest start and latest end on the shown days, an hour of room each side', () => {
    expect(fitHours([b(D[0], '09:30', '10:00'), b(D[1], '13:00', '17:15')], D, dayOf, hourOf)).toEqual([8, 19])
  })
  it('blocks on other days and all-day ones are ignored; nothing shown → the fallback', () => {
    expect(fitHours([b('2026-10-23', '06:00', '07:00'), { ...b(D[0], '00:00', '00:00', D[1]), all_day: true }], D, dayOf, hourOf)).toEqual([8, 18])
  })
  it('at least minSpan hours, grown downward once it meets midnight', () => {
    expect(fitHours([b(D[0], '14:00', '14:30')], D, dayOf, hourOf)).toEqual([13, 19])
    expect(fitHours([b(D[0], '22:00', '23:00')], D, dayOf, hourOf)).toEqual([18, 24])
  })
  it('a block over midnight opens the range to that edge (an end at midnight stays on its day)', () => {
    expect(fitHours([b(D[0], '21:00', '00:00', D[1])], D, dayOf, hourOf)).toEqual([18, 24])
    expect(fitHours([b(D[0], '22:00', '02:00', D[1])], D, dayOf, hourOf)).toEqual([0, 24])
    expect(fitHours([b('2026-10-20', '22:00', '02:00', D[0])], D, dayOf, hourOf)).toEqual([0, 6])
  })
})
