import { describe, expect, it } from 'vitest'
import { cleanDraft, commitDraft, liveValue, stepValue } from './numberDraft'

const B = { min: 1, max: 100 }

describe('NumberField — typing a number without fighting the field', () => {
  it('digits only; the field may be empty while typing (no snapping back to 1)', () => {
    expect(cleanDraft('')).toBe('')
    expect(cleanDraft('1a5-')).toBe('15')
    expect(cleanDraft('3.5')).toBe('35')
  })

  it('a valid draft goes out as you type; an empty or out-of-range one waits for blur', () => {
    expect(liveValue('15', B)).toBe(15)
    expect(liveValue('', B)).toBeNull()
    expect(liveValue('0', B)).toBeNull()
    expect(liveValue('250', B)).toBeNull()
  })

  it('on blur: clamped to the bounds; emptied keeps the last good value', () => {
    expect(commitDraft('0', B, 4)).toBe(1)
    expect(commitDraft('250', B, 4)).toBe(100)
    expect(commitDraft('', B, 4)).toBe(4)
    expect(commitDraft('007', B, 4)).toBe(7)
  })

  it('−/+ step and stop at the bounds', () => {
    expect(stepValue(1, -1, B)).toBe(1)
    expect(stepValue(1, 1, B)).toBe(2)
    expect(stepValue(100, 1, B)).toBe(100)
  })
})
