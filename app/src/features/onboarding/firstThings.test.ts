import { describe, expect, it } from 'vitest'
import { readFirstThing, whenChip } from './firstThings'

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

  it('duration and priority ride along like the command bar', () => {
    expect(readFirstThing('Gym 1h !!', NOW)).toEqual({ title: 'Gym', dueAt: null, durationMin: 60, priority: 2 })
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
