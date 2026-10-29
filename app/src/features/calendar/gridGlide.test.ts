import { describe, expect, it } from 'vitest'
import { needsRecenter, settleIndex, settleMs, wheelDx } from './gridGlide'
import { glidePeek, glideTarget } from './phoneGridMath'

describe('desktop glide (cal-scroll)', () => {
  it('settles on the nearest day, a nudge (≥ 15%) committing the way it went', () => {
    expect(settleIndex(7.5, 0, 14)).toBe(8)
    expect(settleIndex(7.2, 1, 14)).toBe(8) // 20% on → the next day
    expect(settleIndex(7.1, 1, 14)).toBe(7) // 10% → back
    expect(settleIndex(7.8, -1, 14)).toBe(7) // 20% back → the day before
    expect(settleIndex(7, 1, 14)).toBe(7) // already on a day
    expect(settleIndex(20, 1, 14)).toBe(14) // never past the drawn days
    expect(settleIndex(-1, -1, 14)).toBe(0)
  })
  it('reads a trackpad swipe and Shift + a mouse wheel as sideways', () => {
    expect(wheelDx({ deltaX: 30, deltaY: 2, deltaMode: 0, shiftKey: false }, 900)).toBe(30)
    expect(wheelDx({ deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: true }, 900)).toBe(100)
    expect(wheelDx({ deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: false }, 900)).toBe(0)
    expect(wheelDx({ deltaX: 0, deltaY: 3, deltaMode: 1, shiftKey: true }, 900)).toBe(48)
  })
  it('re-centres once under half a screen of days is left on a side; the settle stays short', () => {
    expect(needsRecenter(7, 14, 7)).toBe(false)
    expect(needsRecenter(10, 14, 7)).toBe(false)
    expect(needsRecenter(11, 14, 7)).toBe(true)
    expect(needsRecenter(2, 6, 1)).toBe(false)
    expect(needsRecenter(0, 6, 1)).toBe(true)
    expect(settleMs(5)).toBe(160)
    expect(settleMs(5000)).toBe(360)
  })
})

describe('phone glide (cal-scroll)', () => {
  const W = 330
  it('a resting finger settles on the nearest day; a short flick still moves one', () => {
    expect(glideTarget(-0.6 * W, 0, W, 1, 1)).toBe(1)
    expect(glideTarget(-0.2 * W, 0, W, 1, 1)).toBe(0)
    expect(glideTarget(-30, -0.8, W, 1, 1)).toBe(1) // a flick
  })
  it('a fling carries on with momentum, crossing days, never past the days drawn', () => {
    expect(glideTarget(-150, -1.5, W, 1, 1)).toBe(2)
    expect(glideTarget(-200, -3, W, 1, 1)).toBe(3) // a day view reaches three days
    expect(glideTarget(200, 3, W, 1, 1)).toBe(-3)
    expect(glideTarget(-2 * (W / 3), -3, W, 3, 3)).toBe(6) // 3 days: six
  })
  it('3 days settles by the day, the week by the week', () => {
    expect(glideTarget(-(W / 3) * 1.1, 0, W, 3, 3)).toBe(1)
    expect(glideTarget(-150, -3, W, 7, 7)).toBe(7)
    expect(glideTarget(-0.2 * W, 0, W, 7, 7)).toBe(0)
  })
  it('the title follows the day a swipe shows', () => {
    expect(glidePeek(-0.6 * W, W, 1, 1)).toBe(1)
    expect(glidePeek(0.4 * W, W, 1, 1)).toBe(0)
    expect(glidePeek(-(W / 3) * 2.6, W, 3, 3)).toBe(3)
    expect(glidePeek(-0.7 * W, W, 7, 7)).toBe(7)
  })
})
