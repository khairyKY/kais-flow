import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../../lib/types'
import { bandChipLabel, bandSegments, isMultiDaySpan, midnightCut, spanDays } from './daySpans'

// Calendar.dc.html 3e. Exact UTC instants and explicit zones, so these hold under every TZ the
// suite runs in (UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo).

const CAIRO = 'Africa/Cairo'
const LA = 'America/Los_Angeles'
const TOKYO = 'Asia/Tokyo'

const ev = (starts_at: string, ends_at: string, all_day = false): Pick<CalendarEvent, 'title' | 'starts_at' | 'ends_at' | 'all_day'> => ({ title: 'Offsite', starts_at, ends_at, all_day })
// The grid's 12-hour clock on `zone`.
const clock = (zone: string) => (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).replace(':00', '')
const DAYS = ['2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13']

describe('spanDays / isMultiDaySpan', () => {
  it('an all-day block is dates in no zone, its end exclusive', () => {
    const e = ev('2026-07-10T00:00:00.000Z', '2026-07-13T00:00:00.000Z', true)
    for (const z of [CAIRO, LA, TOKYO]) expect(spanDays(e, z)).toEqual({ first: '2026-07-10', last: '2026-07-12' })
    expect(isMultiDaySpan(e, CAIRO)).toBe(true)
    expect(isMultiDaySpan(ev('2026-07-10T00:00:00.000Z', '2026-07-11T00:00:00.000Z', true), CAIRO)).toBe(false)
    // a server row's offset form reads the same
    expect(spanDays(ev('2026-07-10T00:00:00+00:00', '2026-07-12T00:00:00+00:00', true), LA)).toEqual({ first: '2026-07-10', last: '2026-07-11' })
  })

  it('a timed block is read on the user’s zone; ending at midnight does not touch the next day', () => {
    // Fri 10 Jul 22:00 → Sat 11 Jul 00:00 Cairo (UTC+3)
    expect(spanDays(ev('2026-07-10T19:00:00.000Z', '2026-07-10T21:00:00.000Z'), CAIRO)).toEqual({ first: '2026-07-10', last: '2026-07-10' })
    // the same instants are Fri 12:00–14:00 in LA
    expect(spanDays(ev('2026-07-10T19:00:00.000Z', '2026-07-10T21:00:00.000Z'), LA)).toEqual({ first: '2026-07-10', last: '2026-07-10' })
    // and Sat 04:00–06:00 in Tokyo
    expect(spanDays(ev('2026-07-10T19:00:00.000Z', '2026-07-10T21:00:00.000Z'), TOKYO)).toEqual({ first: '2026-07-11', last: '2026-07-11' })
  })

  it('timed: 24 hours or more is a span (the band); shorter over midnight is not', () => {
    expect(isMultiDaySpan(ev('2026-07-10T06:00:00.000Z', '2026-07-11T06:00:00.000Z'), CAIRO)).toBe(true)
    expect(isMultiDaySpan(ev('2026-07-10T20:00:00.000Z', '2026-07-10T22:30:00.000Z'), CAIRO)).toBe(false)
  })
})

describe('bandSegments — "one logical pill in three segment shapes"', () => {
  it('Fri 9 AM → Sun 3 PM: start, middle, end; title on the first, « » on the open edges, the end time last', () => {
    // 06:00Z Fri = 9 AM Cairo; 12:00Z Sun = 3 PM Cairo
    const e = ev('2026-07-10T06:00:00.000Z', '2026-07-12T12:00:00.000Z')
    expect(bandSegments(e, DAYS, CAIRO, clock(CAIRO))).toEqual([
      { day: '2026-07-10', shape: 'start', label: 'Offsite »' },
      { day: '2026-07-11', shape: 'middle', label: '« »' },
      { day: '2026-07-12', shape: 'end', label: '« ends 3 PM' },
    ])
  })

  it('an all-day span ends with a bare «', () => {
    const e = ev('2026-07-10T00:00:00.000Z', '2026-07-12T00:00:00.000Z', true)
    expect(bandSegments(e, DAYS, LA, clock(LA)).map((s) => s.label)).toEqual(['Offsite »', '«'])
  })

  it('clipped by the view: the first piece in view carries the title, whatever its shape', () => {
    const e = ev('2026-07-08T06:00:00.000Z', '2026-07-12T12:00:00.000Z')
    expect(bandSegments(e, ['2026-07-11', '2026-07-12'], CAIRO, clock(CAIRO)).map((s) => s.label)).toEqual(['« Offsite »', '« ends 3 PM'])
    expect(bandSegments(e, ['2026-07-12'], CAIRO, clock(CAIRO)).map((s) => s.label)).toEqual(['« Offsite · ends 3 PM'])
    expect(bandSegments(e, ['2026-07-20'], CAIRO, clock(CAIRO))).toEqual([])
  })

  it('the days are the user’s zone’s: the same span lands a day later in Tokyo', () => {
    const e = ev('2026-07-10T18:00:00.000Z', '2026-07-12T18:00:00.000Z')
    expect(bandSegments(e, DAYS, TOKYO, clock(TOKYO)).map((s) => [s.day, s.shape])).toEqual([['2026-07-11', 'start'], ['2026-07-12', 'middle'], ['2026-07-13', 'end']])
    expect(bandSegments(e, DAYS, LA, clock(LA)).map((s) => [s.day, s.shape])).toEqual([['2026-07-10', 'start'], ['2026-07-11', 'middle'], ['2026-07-12', 'end']])
  })

  it('bandChipLabel: one chip for the shown stretch', () => {
    const e = ev('2026-07-08T06:00:00.000Z', '2026-07-12T12:00:00.000Z')
    expect(bandChipLabel(e, ['2026-07-10'], CAIRO, clock(CAIRO))).toBe('« Offsite »')
    expect(bandChipLabel(e, ['2026-07-10', '2026-07-11', '2026-07-12'], CAIRO, clock(CAIRO))).toBe('« Offsite · ends 3 PM')
    expect(bandChipLabel(e, ['2026-07-06', '2026-07-07', '2026-07-08'], CAIRO, clock(CAIRO))).toBe('Offsite »')
    expect(bandChipLabel(e, ['2026-08-01'], CAIRO, clock(CAIRO))).toBe('Offsite')
  })
})

describe('midnightCut — "spans midnight"', () => {
  // Night shift: Thu 11 PM → Fri 1:30 AM Cairo (20:00Z → 22:30Z)
  const night = ev('2026-07-09T20:00:00.000Z', '2026-07-09T22:30:00.000Z')

  it('the first day reads ⌄ <end> at the cut, the next ⌃ from <start>', () => {
    expect(midnightCut(night, '2026-07-09', CAIRO, clock(CAIRO))).toEqual({ into: '⌄ 1:30 AM', from: null })
    expect(midnightCut(night, '2026-07-10', CAIRO, clock(CAIRO))).toEqual({ into: null, from: '⌃ from 11 PM' })
  })

  it('in Los Angeles the same block is an afternoon — no cut at all', () => {
    expect(midnightCut(night, '2026-07-09', LA, clock(LA))).toEqual({ into: null, from: null })
  })

  it('all-day blocks are never cut', () => {
    expect(midnightCut(ev('2026-07-09T00:00:00.000Z', '2026-07-11T00:00:00.000Z', true), '2026-07-09', CAIRO, clock(CAIRO))).toEqual({ into: null, from: null })
  })
})
