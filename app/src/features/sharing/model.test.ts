import { describe, expect, it } from 'vitest'
import { BLOCK_SWATCHES } from '../calendar/blockHue'
import { CODE_ALPHABET, cleanCode, codeIn, defaultLevel, formatCode, inviteMessage, isCode, laneDefault, dayDefault, HER_COLOR, limitedBy, lower, notices, pauseLine, pausedSaid, pauseUntil, PAUSE_KINDS, PAUSE_NAME, ruleNow, seenOf, webInvite, type Connection } from './model'

const conn = (over: Partial<Connection> = {}): Connection => ({
  circle_id: 'c1', relation: 'partner', partner_id: 'u2', partner_name: 'Reem', my_level: 'details', their_level: 'details', level: 'details',
  my_grant_id: 'g1', show_lane: true, show_day: true, color: HER_COLOR, since: '2026-11-01T00:00:00Z', paused_until: null, paused_by_me: false, ...over,
})

describe('levels and defaults', () => {
  it('Partner starts at Details, Family at Titles, Friend at Busy; both switches (lane, Today card) are on for a Partner only', () => {
    expect([defaultLevel('partner'), defaultLevel('family'), defaultLevel('friend')]).toEqual(['details', 'titles', 'busy'])
    expect([laneDefault('partner'), laneDefault('family'), laneDefault('friend')]).toEqual([true, false, false])
    expect([dayDefault('partner'), dayDefault('family'), dayDefault('friend')]).toEqual([true, false, false])
  })
  it('her colour starts as Heather, one of palette C’s 16', () => {
    expect(BLOCK_SWATCHES).toHaveLength(16)
    expect(BLOCK_SWATCHES.find((s) => s.name === 'Heather')?.value).toBe(HER_COLOR)
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
  it('has no automatic end by default: until turned back on first, an hour as the timed choice, nothing that ends on its own tomorrow', () => {
    expect(PAUSE_KINDS).toEqual(['forever', 'hour'])
    expect(PAUSE_KINDS[0]).toBe('forever')
    expect(pauseUntil('forever', now)).toBe('infinity')
    expect(pauseUntil('hour', now)).toBe('2026-11-17T11:00:00.000Z')
    expect(Object.values(PAUSE_NAME).join(' ')).not.toMatch(/today/i)
  })
  it('the toast says no end plainly, and a timed pause when it ends', () => {
    expect(pausedSaid('infinity', now, 'Africa/Cairo')).toBe('Paused until you turn it back on.')
    expect(pausedSaid('2026-11-17T11:00:00.000Z', now, 'Africa/Cairo')).toBe('Paused. Back at 1:00 PM.')
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
