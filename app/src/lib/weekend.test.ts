import { describe, expect, it, vi } from 'vitest'

vi.mock('./queryClient', () => ({ queryClient: { getQueryData: () => undefined } }))
const { daysToWeekend, parseWeekend, weekendDays, weekendLabel, weekendPreset, WEEKEND_PRESETS } = await import('./weekend')

const days = (key: string) => WEEKEND_PRESETS.find((p) => p.key === key)!.days
/** Where "this weekend" lands from each weekday, Sunday first: days ahead. */
const week = (d: readonly number[]) => [0, 1, 2, 3, 4, 5, 6].map((wd) => daysToWeekend(wd, d))

describe('weekend — the user’s own weekend (Kai 2026-10-07)', () => {
  it('Sat + Sun (the default): Saturday — today on a Saturday, next Saturday on a Sunday', () => {
    //                      Sun Mon Tue Wed Thu Fri Sat
    expect(week(days('sat-sun'))).toEqual([6, 5, 4, 3, 2, 1, 0])
  })
  it('Fri + Sat (Kai’s): Friday — next Friday once Saturday has come', () => {
    expect(week(days('fri-sat'))).toEqual([5, 4, 3, 2, 1, 0, 6])
  })
  it('Sun only: Sunday', () => {
    expect(week(days('sun'))).toEqual([0, 6, 5, 4, 3, 2, 1])
  })
  it('custom: the next day that starts a run of weekend days', () => {
    expect(week([1, 4])).toEqual([1, 0, 2, 1, 0, 3, 2]) // Mon and Thu, each its own weekend
    expect(week([4, 5, 6])).toEqual([4, 3, 2, 1, 0, 6, 5]) // Thu–Sat starts Thursday
    expect(week([])).toEqual([null, null, null, null, null, null, null]) // no weekend
    expect(week([0, 1, 2, 3, 4, 5, 6])).toEqual([null, null, null, null, null, null, null]) // all weekend: no first day
  })
  it('labels in week order from the first day', () => {
    expect(weekendLabel(days('sat-sun'))).toBe('Sat + Sun')
    expect(weekendLabel(days('fri-sat'))).toBe('Fri + Sat')
    expect(weekendLabel(days('sun'))).toBe('Sun')
    expect(weekendLabel([0, 5, 6])).toBe('Fri + Sat + Sun')
    expect(weekendLabel([1, 4])).toBe('Mon, Thu')
    expect(weekendLabel([])).toBe('No weekend')
  })
  it('a stored value is cleaned; nothing stored (or a build before 0055) is Sat + Sun', () => {
    expect(parseWeekend(undefined)).toEqual([0, 6])
    expect(parseWeekend(null)).toEqual([0, 6])
    expect(parseWeekend([6, 5, 5, 9, -1, 2.5])).toEqual([5, 6])
    expect(parseWeekend([])).toEqual([])
    expect(weekendDays()).toEqual([0, 6])
  })
  it('names the preset, else custom', () => {
    expect(weekendPreset([6, 5])).toBe('fri-sat')
    expect(weekendPreset([0, 6])).toBe('sat-sun')
    expect(weekendPreset([0])).toBe('sun')
    expect(weekendPreset([4, 5])).toBe('custom')
  })
})
