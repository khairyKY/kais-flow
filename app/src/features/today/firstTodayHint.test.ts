import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFirstTodayHint, firstTodayHintPending, markFirstTodayHint } from './firstTodayHint'

describe('the first-Today hint flag (First Run 9i)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is owed to the account that finished onboarding, on this device, until cleared', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    expect(firstTodayHintPending('a')).toBe(false)
    markFirstTodayHint('a')
    expect(firstTodayHintPending('a')).toBe(true)
    expect(firstTodayHintPending('b')).toBe(false) // another account on this browser never sees it
    clearFirstTodayHint('a')
    expect(firstTodayHintPending('a')).toBe(false)
  })

  it('blocked storage or no account: no hint, no throw', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } })
    expect(() => markFirstTodayHint('a')).not.toThrow()
    expect(firstTodayHintPending('a')).toBe(false)
    expect(firstTodayHintPending(undefined)).toBe(false)
    expect(() => clearFirstTodayHint('a')).not.toThrow()
  })
})
