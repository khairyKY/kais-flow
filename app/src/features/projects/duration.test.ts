import { describe, expect, it } from 'vitest'
import { formatDuration, parseDuration } from './duration'

describe('work-log durations', () => {
  it('parses hours, minutes and plain numbers', () => {
    expect(parseDuration('1h30m')).toBe(90)
    expect(parseDuration('2h')).toBe(120)
    expect(parseDuration('45m')).toBe(45)
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('1h 15m')).toBe(75)
  })

  it('is null for nothing usable', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('0m')).toBeNull()
  })

  it('formats back to the same shape, round-tripping', () => {
    expect(formatDuration(90)).toBe('1h30m')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(45)).toBe('45m')
    for (const n of [5, 60, 61, 125]) expect(parseDuration(formatDuration(n))).toBe(n)
  })
})
