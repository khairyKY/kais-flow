import { describe, expect, it } from 'vitest'
import { clockOptions, clockRange, clockText, hour24, setHour24 } from './clock'
import { timeRange, timeText } from '../features/calendar/eventTime'

// Kai 2026-10-22: one clock for every time the app shows. Explicit zones, so this reads the same in
// every TZ the gate runs (Cairo, UTC, Los Angeles, Tokyo).
describe('clockText — a wall-clock "HH:mm" on the person\'s clock', () => {
  it('12-hour: the hour without a lead zero, AM / PM, midnight and noon as 12', () => {
    expect(clockText('00:05', false)).toBe('12:05 AM')
    expect(clockText('09:00', false)).toBe('9:00 AM')
    expect(clockText('12:00', false)).toBe('12:00 PM')
    expect(clockText('13:45', false)).toBe('1:45 PM')
    expect(clockText('23:59', false)).toBe('11:59 PM')
    expect(clockText('24:00', false)).toBe('12:00 AM') // a span's end at midnight
  })
  it('24-hour: as it is', () => {
    expect(clockText('09:00', true)).toBe('09:00')
    expect(clockText('13:45', true)).toBe('13:45')
  })
  it('not a clock time: untouched', () => {
    expect(clockText('soon', false)).toBe('soon')
  })
})

describe('clockRange — a span, the meridiem once when both ends share it', () => {
  it('12-hour', () => {
    expect(clockRange('13:00', '13:30', false)).toBe('1:00–1:30 PM')
    expect(clockRange('11:30', '12:30', false)).toBe('11:30 AM–12:30 PM')
    expect(clockRange('23:00', '24:00', false)).toBe('11:00 PM–12:00 AM')
  })
  it('24-hour', () => {
    expect(clockRange('13:00', '13:30', true)).toBe('13:00–13:30')
    expect(clockRange('10:15', '10:30', true)).toBe('10:15–10:30')
  })
  // Kai 2026-10-22 (the clock fallout): one range style — the toast and Today's Now card said "10:15 AM–10:30 AM".
  it('one style: the meridiem once when shared, both when the span crosses it', () => {
    expect(clockRange('10:15', '10:30', false)).toBe('10:15–10:30 AM')
    expect(clockRange('09:00', '11:00', false)).toBe('9:00–11:00 AM')
    expect(clockRange('11:30', '12:30', false)).toBe('11:30 AM–12:30 PM')
    expect(clockRange('00:00', '00:30', false)).toBe('12:00–12:30 AM')
  })
})

describe('clockOptions — a time inside a longer Intl string', () => {
  const at = new Date('2026-10-21T10:05:00Z') // 13:05 in Cairo
  it('follows the clock', () => {
    expect(at.toLocaleTimeString('en-US', { ...clockOptions(false), timeZone: 'Africa/Cairo' }).replace(/\s/g, ' ')).toBe('1:05 PM')
    expect(at.toLocaleTimeString('en-US', { ...clockOptions(true), timeZone: 'Africa/Cairo' })).toBe('13:05')
  })
})

describe('timeText / timeRange — an instant on a zone\'s clock, as the setting says', () => {
  const at = new Date('2026-10-21T10:05:00Z')
  const end = new Date('2026-10-21T10:35:00Z')
  it('12-hour by default (no stored choice)', () => {
    expect(hour24()).toBe(false)
    expect(timeText(at, 'Africa/Cairo')).toBe('1:05 PM')
    expect(timeText(at, 'Asia/Tokyo')).toBe('7:05 PM')
    expect(timeRange(at, end, 'America/Los_Angeles')).toBe('3:05–3:35 AM')
  })
  it('24-hour once set — the whole app at once', () => {
    setHour24(true)
    try {
      expect(timeText(at, 'Africa/Cairo')).toBe('13:05')
      expect(timeRange(at, end, 'UTC')).toBe('10:05–10:35')
      expect(timeRange(at, end, 'UTC', false)).toBe('10:05–10:35 AM') // the grid passes its own clock
    } finally {
      setHour24(false)
    }
  })
})
