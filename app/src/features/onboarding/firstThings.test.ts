import { describe, expect, it, beforeAll } from 'vitest'
import { setHour24 } from '../../lib/clock'
import { readFirstThing, whenChip, withPicked } from './firstThings'

// These read times on the 24-hour clock (lib/clock, Kai 2026-10-22); the 12-hour one is lib/clock.test's.
beforeAll(() => setHour24(true))

// Sunday 27 Sep 2026, 07:40 in Cairo (UTC+3) — First Run 9h's morning. The suite runs under
// several TZs; every answer must be Cairo's.
const NOW = new Date('2026-09-27T04:40:00Z')

describe('readFirstThing', () => {
  it('strips the date words from the title and keeps them as the due date (Cairo)', () => {
    expect(readFirstThing('Call the tyre supplier tomorrow 3pm', NOW)).toEqual({
      title: 'Call the tyre supplier',
      dueAt: '2026-09-28T12:00:00.000Z',
      durationMin: null,
      priority: null,
    })
  })

  it('a line with no date keeps its words and no due date', () => {
    expect(readFirstThing('  Finish the flow audit ', NOW)).toEqual({ title: 'Finish the flow audit', dueAt: null, durationMin: null, priority: null })
    expect(readFirstThing('Gym', NOW)?.dueAt).toBeNull()
  })

  it('an empty line is nothing', () => {
    expect(readFirstThing('', NOW)).toBeNull()
    expect(readFirstThing('   ', NOW)).toBeNull()
  })

  it('duration, priority and *labels ride along like the command bar', () => {
    expect(readFirstThing('Gym 1h !!', NOW)).toEqual({ title: 'Gym', dueAt: null, durationMin: 60, priority: 2 })
    expect(readFirstThing('Gym *health', NOW)).toEqual({ title: 'Gym', dueAt: null, durationMin: null, priority: null, labels: ['health'] })
  })

  it('a line that is only a date keeps its words as the title', () => {
    expect(readFirstThing('tomorrow 3pm', NOW)).toMatchObject({ title: 'tomorrow 3pm', dueAt: '2026-09-28T12:00:00.000Z' })
  })
})

describe('whenChip', () => {
  it('reads Cairo’s day word and 24h clock', () => {
    expect(whenChip('2026-09-28T12:00:00.000Z', NOW)).toBe('Tomorrow · 15:00')
    expect(whenChip('2026-09-27T17:30:00.000Z', NOW)).toBe('Today · 20:30')
  })

  it('a late-evening UTC time is already tomorrow in Cairo', () => {
    // 22:30 UTC on the 27th is 01:30 on the 28th in Cairo — tomorrow.
    expect(whenChip('2026-09-27T22:30:00.000Z', NOW)).toBe('Tomorrow · 01:30')
  })
})

describe('withPicked', () => {
  const picked = { over: '2026-09-28T12:00:00.000Z', at: '2026-10-01T07:30:00.000Z' }

  it('the chip’s pick replaces the parsed date and survives more title words', () => {
    expect(withPicked(readFirstThing('Call the tyre supplier tomorrow 3pm', NOW), picked)?.dueAt).toBe(picked.at)
    expect(withPicked(readFirstThing('Call the tyre supplier about the invoice tomorrow 3pm', NOW), picked)).toMatchObject({ title: 'Call the tyre supplier about the invoice', dueAt: picked.at })
  })

  it('No date (the picker’s Remove) drops the date and keeps the cleaned title', () => {
    expect(withPicked(readFirstThing('Call the tyre supplier tomorrow 3pm', NOW), { ...picked, at: null })).toEqual({ title: 'Call the tyre supplier', dueAt: null, durationMin: null, priority: null })
  })

  it('a different typed date takes over; no pick, or no line, changes nothing', () => {
    expect(withPicked(readFirstThing('Call the tyre supplier friday 3pm', NOW), picked)?.dueAt).not.toBe(picked.at)
    expect(withPicked(readFirstThing('Gym', NOW), undefined)?.dueAt).toBeNull()
    expect(withPicked(null, picked)).toBeNull()
  })
})

// The bar's parse now also takes repeats, `//` notes and a link out of the title — a first thing keeps them.
describe('readFirstThing keeps what leaves the title (P7e A5/A6/A19)', () => {
  it('a repeat, notes and a link ride along', () => {
    expect(readFirstThing('Stretch every day 7am // ten minutes', NOW)).toMatchObject({ title: 'Stretch', recurrenceRule: 'FREQ=DAILY', notes: 'ten minutes', dueAt: '2026-09-28T04:00:00.000Z' }) // 7am has passed: from tomorrow
    expect(readFirstThing('read https://example.com/a', NOW)).toMatchObject({ title: 'read', externalRef: { source: 'link', url: 'https://example.com/a' } })
  })
})
