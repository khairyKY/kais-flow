import { describe, expect, it } from 'vitest'
import { commitAt, lockAxis, pastCommit, REST_X, REVEAL_LEFT, REVEAL_RIGHT, settleSwipe, TOUCH_SLOP } from './swipe'

const W = 358 // a Tasks row at 390 (16px gutters)

describe('lockAxis (direction lock)', () => {
  it('stays undecided inside the 8px slop', () => {
    expect(lockAxis(0, 0)).toBeNull()
    expect(lockAxis(TOUCH_SLOP - 1, -(TOUCH_SLOP - 1))).toBeNull()
  })
  it('a vertical scroll with small horizontal drift stays a scroll', () => {
    expect(lockAxis(6, 12)).toBe('y')
    expect(lockAxis(-7, -30)).toBe('y')
    expect(lockAxis(9, 9)).toBe('y') // a tie goes to the page
  })
  it('a clearly sideways move becomes a swipe, either way', () => {
    expect(lockAxis(TOUCH_SLOP, 0)).toBe('x')
    expect(lockAxis(-14, 5)).toBe('x')
  })
})

describe('commitAt', () => {
  it('is 40% of a wide row', () => {
    expect(commitAt(1000, REVEAL_RIGHT)).toBe(400)
  })
  it('never lands inside the partial reveal on a phone', () => {
    expect(commitAt(W, REVEAL_RIGHT)).toBe(REVEAL_RIGHT + 24)
    expect(commitAt(W, REVEAL_LEFT)).toBeCloseTo(W * 0.4) // 143 > 96 + 24
    expect(REST_X['open-right']).toBeLessThan(commitAt(W, REVEAL_RIGHT))
  })
})

describe('settleSwipe', () => {
  it('past the commit line commits: right = Tomorrow, left = Delete', () => {
    expect(settleSwipe(commitAt(W, REVEAL_RIGHT), 0, W)).toBe('tomorrow')
    expect(settleSwipe(-commitAt(W, REVEAL_LEFT), 0, W)).toBe('delete')
    expect(pastCommit(commitAt(W, REVEAL_RIGHT), W)).toBe(true)
    expect(pastCommit(commitAt(W, REVEAL_RIGHT) - 1, W)).toBe(false)
  })
  it('under the line it rests open past half the reveal, else springs back', () => {
    expect(settleSwipe(REVEAL_RIGHT / 2 + 1, 0, W)).toBe('open-right')
    expect(settleSwipe(REVEAL_RIGHT / 2 - 1, 0, W)).toBe('close')
    expect(settleSwipe(-REVEAL_LEFT / 2 - 1, 0, W)).toBe('open-left')
    expect(settleSwipe(-REVEAL_LEFT / 2 + 1, 0, W)).toBe('close')
  })
  it('a fast flick opens under halfway but never commits', () => {
    expect(settleSwipe(20, 1.2, W)).toBe('open-right')
    expect(settleSwipe(-20, -1.2, W)).toBe('open-left')
  })
  it('a flick against an open row closes it first', () => {
    expect(settleSwipe(REVEAL_RIGHT, -1.2, W)).toBe('close')
    expect(settleSwipe(-REVEAL_LEFT, 1.2, W)).toBe('close')
  })
})
