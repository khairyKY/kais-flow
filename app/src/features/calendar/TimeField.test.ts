import { describe, expect, it } from 'vitest'
import { parseTimeText } from './TimeField'

// ponytail: the one check that fails if the typed-time parser breaks.
describe('parseTimeText', () => {
  it('parses the shapes people actually type', () => {
    expect(parseTimeText('3pm')).toBe('15:00')
    expect(parseTimeText('3:30 PM')).toBe('15:30')
    expect(parseTimeText('15:00')).toBe('15:00')
    expect(parseTimeText('0930')).toBe('09:30')
    expect(parseTimeText('12am')).toBe('00:00')
    expect(parseTimeText('12 pm')).toBe('12:00')
    expect(parseTimeText('9')).toBe('09:00')
  })
  it('rejects garbage', () => {
    expect(parseTimeText('')).toBeNull()
    expect(parseTimeText('25:00')).toBeNull()
    expect(parseTimeText('13pm')).toBeNull()
    expect(parseTimeText('lunch')).toBeNull()
  })
})
