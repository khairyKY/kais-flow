import { describe, expect, it } from 'vitest'
import { barMinute, dayStep, overBar } from './dayBarMath'

describe('barMinute', () => {
  // A 320px bar at x 20..340: 7:00 at the left edge, 23:00 at the right, 20px per hour.
  it('snaps down to the quarter hour', () => {
    expect(barMinute(20 + 7.33 * 20, 20, 320)).toBe(14 * 60 + 15) // ~14:20 → 14:15
    expect(barMinute(20 + 7 * 20, 20, 320)).toBe(14 * 60)
  })
  it('stays inside 7:00 and the last quarter', () => {
    expect(barMinute(-50, 20, 320)).toBe(7 * 60)
    expect(barMinute(999, 20, 320)).toBe(22 * 60 + 45)
  })
})

describe('overBar', () => {
  const r = { left: 10, right: 330, top: 100, bottom: 144 }
  it('forgives a thumb, not a page', () => {
    expect(overBar(170, 120, r)).toBe(true)
    expect(overBar(170, 90, r)).toBe(true)
    expect(overBar(170, 70, r)).toBe(false)
    expect(overBar(2, 120, r)).toBe(true)
    expect(overBar(-5, 120, r)).toBe(false)
  })
})

describe('dayStep', () => {
  it('48px turns the day, left = next', () => {
    expect(dayStep(-48, 0)).toBe(1)
    expect(dayStep(60, 0)).toBe(-1)
    expect(dayStep(-47, 0)).toBe(0)
  })
  it('a flick turns it short of 48px, but only the way it went', () => {
    expect(dayStep(-20, -0.8)).toBe(1)
    expect(dayStep(20, 0.8)).toBe(-1)
    expect(dayStep(-20, 0.8)).toBe(0)
  })
})
