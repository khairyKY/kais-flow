import { describe, expect, it } from 'vitest'
import { firstTick, nextTick } from './checkTick'

describe('kit Checkbox pop (M3)', () => {
  it('a box that mounts ticked never pops', () => {
    const s = firstTick(true)
    expect(s.pop).toBe(false)
    expect(nextTick(s, true)).toBe(s) // re-renders (a swipe, a refetch) keep it still
  })

  it('unticked → ticked pops, and keeps popping through re-renders while ticked', () => {
    const ticked = nextTick(firstTick(false), true)
    expect(ticked.pop).toBe(true)
    expect(nextTick(ticked, true)).toBe(ticked)
  })

  it('an untick clears it; the next tick pops again', () => {
    const unticked = nextTick(nextTick(firstTick(true), false), false)
    expect(unticked).toEqual({ checked: false, pop: false })
    expect(nextTick(unticked, true).pop).toBe(true)
  })
})
