import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, cleanCode, codeIn, defaultLevel, formatCode, inviteMessage, isCode, laneDefault, limitedBy, lower, notices, pauseLine, pauseUntil, ruleNow, seenOf, webInvite, type Connection } from './model'

const conn = (over: Partial<Connection> = {}): Connection => ({
  circle_id: 'c1', relation: 'partner', partner_id: 'u2', partner_name: 'Reem', my_level: 'details', their_level: 'details', level: 'details',
  my_grant_id: 'g1', show_lane: true, since: '2026-11-01T00:00:00Z', paused_until: null, paused_by_me: false, ...over,
})

describe('levels and defaults', () => {
  it('Partner starts at Details, Family at Titles, Friend at Busy; the lane is on for a Partner only', () => {
    expect([defaultLevel('partner'), defaultLevel('family'), defaultLevel('friend')]).toEqual(['details', 'titles', 'busy'])
    expect([laneDefault('partner'), laneDefault('family'), laneDefault('friend')]).toEqual([true, false, false])
  })
  it('you see what you show: the lower of the two', () => {
    expect(lower('details', 'busy')).toBe('busy')
    expect(lower('titles', 'details')).toBe('titles')
    expect(lower('titles', 'titles')).toBe('titles')
  })
  it('the rule line names both levels and the result', () => {
    expect(ruleNow(conn({ their_level: 'busy' }))).toEqual({ show: 'You show Details · Reem shows Busy only', sees: 'you both see Busy only' })
    expect(limitedBy({ my_level: 'details', their_level: 'busy' })).toBe('them')
    expect(limitedBy({ my_level: 'busy', their_level: 'details' })).toBe('me')
    expect(limitedBy({ my_level: 'titles', their_level: 'titles' })).toBeNull()
  })
})

describe('the code', () => {
  it('the alphabet has 32 symbols and none of 0, O, 1, I', () => {
    expect(CODE_ALPHABET).toHaveLength(32)
    expect(/[01OI]/.test(CODE_ALPHABET)).toBe(false)
  })
  it('cleans what was typed or pasted, at most 8 characters', () => {
    expect(cleanCode(' k7qm-r4tx ')).toBe('K7QMR4TX')
    expect(cleanCode('K7QMR4TX99')).toBe('K7QMR4TX')
    expect(isCode('K7QMR4TX')).toBe(true)
    expect(isCode('K7QMR4T0')).toBe(false) // a zero is not in the alphabet
    expect(isCode('K7QMR4T')).toBe(false)
    expect(formatCode('K7QMR4TX')).toBe('K7QM–R4TX')
  })
  it('finds the code in a pasted message or link', () => {
    const link = webInvite('K7QMR4TX', 'https://app.example/')
    expect(link).toBe('https://app.example/join/K7QMR4TX')
    expect(codeIn(link)).toBe('K7QMR4TX')
    expect(codeIn('kaisflow://join/K7QMR4TX')).toBe('K7QMR4TX')
    expect(codeIn(inviteMessage('Kai', 'K7QMR4TX', link, 'Tue 10:40 AM'))).toBe('K7QMR4TX')
    expect(codeIn('Code: K7QM-R4TX works once')).toBe('K7QMR4TX')
    expect(codeIn('hello')).toBeNull()
  })
})

describe('pause', () => {
  const now = new Date('2026-11-17T10:00:00Z') // 12:00 in Cairo
  it('an hour, tomorrow at 8:00 on the pauser’s clock, or until turned back on', () => {
    expect(pauseUntil('hour', now, 'Africa/Cairo')).toBe('2026-11-17T11:00:00.000Z')
    expect(pauseUntil('today', now, 'Africa/Cairo')).toBe('2026-11-18T06:00:00.000Z') // 08:00 Cairo (UTC+2 in November)
    expect(pauseUntil('today', now, 'America/New_York')).toBe('2026-11-18T13:00:00.000Z') // 08:00 New York (UTC-5)
    expect(pauseUntil('forever', now, 'Africa/Cairo')).toBe('infinity')
  })
  it('says when it ends in plain words', () => {
    expect(pauseLine('2026-11-18T06:00:00.000Z', now, 'Africa/Cairo')).toBe('Back tomorrow at 8:00 AM')
    expect(pauseLine('2026-11-17T11:00:00.000Z', now, 'Africa/Cairo')).toBe('Back at 1:00 PM')
    expect(pauseLine('infinity', now, 'Africa/Cairo')).toBe('Until turned back on')
  })
})

describe('what the app tells, and only in the app', () => {
  const was = seenOf([conn()])
  it('nothing changed: nothing said', () => expect(notices(was, [conn()])).toEqual([]))
  it('the other person shows less: told, with the result', () => {
    expect(notices(was, [conn({ their_level: 'titles', level: 'titles' })])).toEqual(['Reem now shows Titles, so you both see Titles.'])
  })
  it('my own drop is never told back to me', () => {
    expect(notices(was, [conn({ my_level: 'busy', level: 'busy' })])).toEqual([])
  })
  it('raising it again is quiet', () => {
    const low = seenOf([conn({ their_level: 'busy', level: 'busy' })])
    expect(notices(low, [conn()])).toEqual([])
  })
  it('their pause is told, mine is not', () => {
    const now = new Date('2026-11-17T10:00:00Z')
    expect(notices(was, [conn({ paused_until: '2026-11-18T06:00:00.000Z' })], new Set(), now, 'Africa/Cairo')).toEqual(['Reem paused sharing. Back tomorrow at 8:00 AM.'])
    expect(notices(was, [conn({ paused_until: '2026-11-18T06:00:00.000Z', paused_by_me: true })], new Set(), now, 'Africa/Cairo')).toEqual([])
  })
  it('a connection that vanished is told unless this device ended it', () => {
    expect(notices(was, [])).toEqual(['Reem stopped sharing. Their blocks are gone from your calendar.'])
    expect(notices(was, [], new Set(['c1']))).toEqual([])
  })
})
