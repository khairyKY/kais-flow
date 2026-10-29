import { afterEach, describe, expect, it, vi } from 'vitest'
import { markTicked, noteLocalWrite, ownArrival, takeTicked } from './blockMotion'

afterEach(() => vi.useRealTimers())

describe('blockMotion', () => {
  it('CAL10: only an arrival right after a write made here is the person\'s own', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000)
    expect(ownArrival()).toBe(false) // a cold load, a sync: no write yet
    noteLocalWrite()
    vi.advanceTimersByTime(1000)
    expect(ownArrival()).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(ownArrival()).toBe(false) // a sync landing later is quiet
  })

  it('CAL4: a tick made here plays once; a box that arrives ticked never does', () => {
    vi.useFakeTimers()
    expect(takeTicked('t1')).toBe(false)
    markTicked('t1')
    expect(takeTicked('t1')).toBe(true)
    expect(takeTicked('t1')).toBe(false) // once
    markTicked('t2')
    vi.advanceTimersByTime(9000) // the round's question took too long: it lands quietly
    expect(takeTicked('t2')).toBe(false)
  })
})
