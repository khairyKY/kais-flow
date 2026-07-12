import { describe, it, expect } from 'vitest'
import { localTimeKey, localToIso } from './eventTime'
import { localDateKey } from '../routines/streaks'

describe('localTimeKey', () => {
  it('formats local hours/minutes with padding', () => {
    expect(localTimeKey(new Date(2026, 6, 4, 9, 5))).toBe('09:05')
  })

  it('handles midnight', () => {
    expect(localTimeKey(new Date(2026, 6, 4, 0, 0))).toBe('00:00')
  })
})

describe('localToIso', () => {
  it('round-trips a local date/time through the stored UTC instant', () => {
    const iso = localToIso('2026-07-04', '21:00')
    const back = new Date(iso)
    expect(localDateKey(back)).toBe('2026-07-04')
    expect(localTimeKey(back)).toBe('21:00')
  })

  it('a no-touch save must be a no-op: re-deriving from the same instant reproduces it exactly', () => {
    const original = new Date(2026, 6, 4, 0, 30)
    const iso = localToIso(localDateKey(original), localTimeKey(original))
    expect(iso).toBe(original.toISOString())
  })
})
