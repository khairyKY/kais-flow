import { describe, expect, it } from 'vitest'
import { barLevels, cycle, mmBlob, rms, seg } from './sotto'

describe("Sotto's pill math (overlay.js)", () => {
  it('cycle wraps, negative delays included', () => {
    expect(cycle(0, 2, 0)).toBe(0)
    expect(cycle(1000, 2, 0)).toBeCloseTo(0.5)
    expect(cycle(0, 2.3, -0.5)).toBeCloseTo(0.5 / 2.3)
    expect(cycle(5000, 2, 0)).toBeCloseTo(0.5)
  })

  it('seg eases between its ends', () => {
    expect(seg(9, -15, 0)).toBe(9)
    expect(seg(9, -15, 1)).toBeCloseTo(-15)
    expect(seg(0, 1, 0.5)).toBeCloseTo(0.5)
  })

  it('mm-blob hits its keyframes', () => {
    expect(mmBlob(0, 3, 0)).toEqual([0, 0, 1])
    const [x, y, s] = mmBlob(1000, 3, 0) // 1/3 through
    expect(x).toBeCloseTo(3)
    expect(y).toBeCloseTo(-2)
    expect(s).toBeCloseTo(1.16)
  })

  it('rms is the level Sotto publishes', () => {
    expect(rms([])).toBe(0)
    expect(rms([1, -1, 1, -1])).toBe(1)
    expect(rms([0.5, -0.5])).toBeCloseTo(0.5)
  })

  it('the bars rise with the mic', () => {
    const quiet = barLevels(0, 0).reduce((a, b) => a + b)
    const loud = barLevels(0, 0.2).reduce((a, b) => a + b)
    expect(loud).toBeGreaterThan(quiet * 2)
    expect(Math.max(...barLevels(0, 1))).toBeLessThanOrEqual(1)
    expect(Math.min(...barLevels(0, 0))).toBeGreaterThanOrEqual(0.15)
  })
})
