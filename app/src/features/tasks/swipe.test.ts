import { describe, expect, it } from 'vitest'
import { settleSwipeX, SWIPE_LEFT, SWIPE_RIGHT } from './swipe'

describe('settleSwipeX', () => {
  it('snaps by position when slow', () => {
    expect(settleSwipeX(SWIPE_RIGHT / 2 + 1, 0)).toBe(SWIPE_RIGHT)
    expect(settleSwipeX(SWIPE_RIGHT / 2 - 1, 0)).toBe(0)
    expect(settleSwipeX(-SWIPE_LEFT / 2 - 1, 0)).toBe(-SWIPE_LEFT)
    expect(settleSwipeX(-SWIPE_LEFT / 2 + 1, 0)).toBe(0)
  })

  it('a fast flick opens even under halfway', () => {
    expect(settleSwipeX(20, 1.2)).toBe(SWIPE_RIGHT)
    expect(settleSwipeX(-20, -1.2)).toBe(-SWIPE_LEFT)
  })

  it('a fast flick against an open row closes it first', () => {
    expect(settleSwipeX(SWIPE_RIGHT, -1.2)).toBe(0)
    expect(settleSwipeX(-SWIPE_LEFT, 1.2)).toBe(0)
  })
})
