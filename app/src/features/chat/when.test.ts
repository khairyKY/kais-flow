import { describe, expect, it } from 'vitest'
import { dayTable, resolveWhen } from '../../../../supabase/functions/chat/when.ts'

// Queue item 5: Kai's three gym sessions, asked on Sunday 25 Oct 2026 at noon in Cairo. The chat swapped
// two of them; now the words are read here, not by the model.
const CAIRO = 'Africa/Cairo'
const sunNoon = new Date('2026-10-25T09:00:00Z') // Sun 25 Oct, 12:00 Cairo (UTC+3)

describe('resolveWhen — the chat reads days and times itself', () => {
  it("Kai's gym request: each session on its own coming weekday, 12h ranges read whole", () => {
    expect(resolveWhen('Mon 7:00–8:15', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T07:00', end: '2026-10-26T08:15' })
    expect(resolveWhen('Wed 5:45–7:00 PM', sunNoon, CAIRO)).toEqual({ start: '2026-10-28T17:45', end: '2026-10-28T19:00' })
    expect(resolveWhen('Tue 5:45–7:00 PM', sunNoon, CAIRO)).toEqual({ start: '2026-10-27T17:45', end: '2026-10-27T19:00' })
    expect(resolveWhen('Monday 7:00 to 8:15', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T07:00', end: '2026-10-26T08:15' })
  })

  it('a weekday is the coming one — never today, even later today', () => {
    const monMorning = new Date('2026-10-26T04:00:00Z') // Mon 26 Oct, 07:00 Cairo
    expect(resolveWhen('Monday 7pm', monMorning, CAIRO)).toEqual({ start: '2026-11-02T19:00' })
    expect(resolveWhen('today 7pm', monMorning, CAIRO)).toEqual({ start: '2026-10-26T19:00' })
    expect(resolveWhen('next friday', sunNoon, CAIRO)).toEqual({ start: '2026-10-30' })
    expect(resolveWhen('thurs 9', sunNoon, CAIRO)).toEqual({ start: '2026-10-29T09:00' })
  })

  it('no day: today while the time is ahead, else tomorrow', () => {
    expect(resolveWhen('6pm', sunNoon, CAIRO)).toEqual({ start: '2026-10-25T18:00' })
    expect(resolveWhen('9am', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T09:00' })
    expect(resolveWhen('at noon', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T12:00' })
  })

  it('meridiems: one end reads for both unless it flips the order; none = the 24-hour clock', () => {
    expect(resolveWhen('tomorrow 11–1 pm', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T11:00', end: '2026-10-26T13:00' })
    expect(resolveWhen('tomorrow 11am-1', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T11:00', end: '2026-10-26T13:00' })
    expect(resolveWhen('tomorrow 17:45-19:00', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T17:45', end: '2026-10-26T19:00' })
    expect(resolveWhen('tomorrow 12am', sunNoon, CAIRO)).toEqual({ start: '2026-10-26T00:00' })
    expect(resolveWhen('tonight 8', sunNoon, CAIRO)).toEqual({ start: '2026-10-25T20:00' })
  })

  it('an end past midnight is the next day', () => {
    expect(resolveWhen('Fri 11pm-1am', sunNoon, CAIRO)).toEqual({ start: '2026-10-30T23:00', end: '2026-10-31T01:00' })
  })

  it('dates by name and number; a passed one is next year', () => {
    expect(resolveWhen('30 Oct 3pm', sunNoon, CAIRO)).toEqual({ start: '2026-10-30T15:00' })
    expect(resolveWhen('Nov 2nd', sunNoon, CAIRO)).toEqual({ start: '2026-11-02' })
    expect(resolveWhen('3 March', sunNoon, CAIRO)).toEqual({ start: '2027-03-03' })
    expect(resolveWhen('2026-12-01 09:30', sunNoon, CAIRO)).toEqual({ start: '2026-12-01T09:30' })
    expect(resolveWhen('2026-12-01', sunNoon, CAIRO)).toEqual({ start: '2026-12-01' })
  })

  it('"in 2 hours" counts from now, to the next 5 minutes', () => {
    expect(resolveWhen('in 2 hours', new Date('2026-10-25T09:03:00Z'), CAIRO)).toEqual({ start: '2026-10-25T14:05' })
  })

  it("reads on the user's clock, not the device's", () => {
    // 23:30 Saturday in New York is already Sunday in Cairo.
    const at = new Date('2026-10-25T03:30:00Z')
    expect(resolveWhen('tomorrow 9am', at, 'America/New_York')).toEqual({ start: '2026-10-25T09:00' })
    expect(resolveWhen('tomorrow 9am', at, CAIRO)).toEqual({ start: '2026-10-26T09:00' })
  })

  it('nothing it can read is null — never a guess', () => {
    expect(resolveWhen('whenever', sunNoon, CAIRO)).toBeNull()
    expect(resolveWhen('Mon 25:00', sunNoon, CAIRO)).toBeNull()
    expect(resolveWhen('30 Feb', sunNoon, CAIRO)).toBeNull()
  })

  it('the day table the prompt carries', () => {
    expect(dayTable(sunNoon, CAIRO, 3)).toBe('Sun 25 Oct (today) = 2026-10-25, Mon 26 Oct (tomorrow) = 2026-10-26, Tue 27 Oct = 2026-10-27')
  })
})
