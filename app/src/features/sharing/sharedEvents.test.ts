import { describe, expect, it } from 'vitest'
import { dayLabel, dropped, isPending, proposalFrom, rangeBounds, sharedLine, sharedState, windowsByDay, windowText, zoneHint } from './sharedPure'

const ev = (over: Record<string, unknown> = {}) => ({ shared_id: 's1', share_status: 'accepted' as const, share_peer_status: 'accepted' as const, starts_at: '2026-11-20T15:00:00Z', ends_at: '2026-11-20T17:00:00Z', all_day: false, ...over })
const Z = 'Africa/Cairo'

describe('a shared event\'s state', () => {
  it('none for an ordinary event; otherwise invited / waiting / on / declined', () => {
    expect(sharedState({ shared_id: null })).toBeNull()
    expect(sharedState(ev({ share_status: 'invited' }))).toBe('invited')
    expect(sharedState(ev({ share_peer_status: 'invited' }))).toBe('waiting')
    expect(sharedState(ev())).toBe('on')
    expect(sharedState(ev({ share_peer_status: 'declined' }))).toBe('declined')
  })
  it('dashed until both have answered, and says it in Reem\'s words', () => {
    expect(isPending('invited')).toBe(true)
    expect(isPending('waiting')).toBe(true)
    expect(isPending('on')).toBe(false)
    expect(isPending('declined')).toBe(false)
    expect(sharedLine('declined', 'Reem')).toBe('Reem can’t go')
    expect(sharedLine('waiting', 'Reem')).toBe('Waiting for Reem to answer')
    expect(sharedLine('on', 'Reem')).toBe('With Reem')
    expect(sharedLine('invited', 'Reem')).toBe('Reem invited you')
  })
  it('an unanswered proposal drops when it starts; an answered one never does', () => {
    const now = new Date('2026-11-20T15:00:00Z')
    expect(dropped(ev({ share_peer_status: 'invited' }), new Date('2026-11-20T14:59:00Z'))).toBe(false)
    expect(dropped(ev({ share_peer_status: 'invited' }), now)).toBe(true)
    expect(dropped(ev({ share_status: 'invited' }), now)).toBe(true)
    expect(dropped(ev(), now)).toBe(false)
    expect(dropped(ev({ share_peer_status: 'declined' }), now)).toBe(false)
    // an all-day proposal lives through its day
    expect(dropped(ev({ share_peer_status: 'invited', all_day: true, starts_at: '2026-11-20T00:00:00Z', ends_at: '2026-11-21T00:00:00Z' }), now)).toBe(false)
  })
})

describe('Free together', () => {
  it('the chips ask for today (from now), tomorrow, and the next seven days, on my clock', () => {
    const now = new Date('2026-11-20T18:30:00Z') // 20:30 in Cairo (UTC+2)
    expect(rangeBounds('today', now, Z).to.toISOString()).toBe('2026-11-20T22:00:00.000Z') // Cairo midnight
    expect(rangeBounds('today', now, Z).from).toBe(now)
    expect(rangeBounds('tomorrow', now, Z).from.toISOString()).toBe('2026-11-20T22:00:00.000Z')
    expect(rangeBounds('tomorrow', now, Z).to.toISOString()).toBe('2026-11-21T22:00:00.000Z')
    expect(rangeBounds('week', now, Z).to.toISOString()).toBe('2026-11-27T18:30:00.000Z')
  })
  it('windows group by the day they start on, soonest first, with Today / Tomorrow / a date', () => {
    const now = new Date('2026-11-20T10:00:00Z')
    const days = windowsByDay([
      { starts_at: '2026-11-22T15:00:00Z', ends_at: '2026-11-22T17:00:00Z' },
      { starts_at: '2026-11-20T15:30:00Z', ends_at: '2026-11-20T18:00:00Z' },
      { starts_at: '2026-11-20T11:00:00Z', ends_at: '2026-11-20T12:00:00Z' },
      { starts_at: '2026-11-21T08:00:00Z', ends_at: '2026-11-21T10:00:00Z' },
    ], Z)
    expect(days.map((d) => d.key)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(days[0].windows.map((w) => w.starts_at)).toEqual(['2026-11-20T11:00:00Z', '2026-11-20T15:30:00Z'])
    expect(days.map((d) => dayLabel(d.key, now, Z))).toEqual(['Today', 'Tomorrow', 'Sun, Nov 22'])
  })
  it('a window reads "5:30 – 9:00 PM" on my clock', () => {
    expect(windowText({ starts_at: '2026-11-20T15:30:00Z', ends_at: '2026-11-20T19:00:00Z' }, Z)).toBe('5:30 – 9:00 PM')
    expect(windowText({ starts_at: '2026-11-20T09:00:00Z', ends_at: '2026-11-20T12:00:00Z' }, Z)).toBe('11:00 AM – 2:00 PM')
  })
  it('Propose fills the time in from the window: its start, 2 hours or to its end; never before now', () => {
    const w = { starts_at: '2026-11-20T15:30:00Z', ends_at: '2026-11-20T19:00:00Z' }
    expect(proposalFrom(w, new Date('2026-11-20T10:00:00Z'))).toEqual({ startsAt: '2026-11-20T15:30:00.000Z', endsAt: '2026-11-20T17:30:00.000Z' })
    expect(proposalFrom(w, new Date('2026-11-20T18:10:00Z'))).toEqual({ startsAt: '2026-11-20T18:15:00.000Z', endsAt: '2026-11-20T19:00:00.000Z' })
    expect(proposalFrom({ starts_at: '2026-11-20T15:00:00Z', ends_at: '2026-11-20T16:00:00Z' }, new Date('2026-11-20T10:00:00Z')).endsAt).toBe('2026-11-20T16:00:00.000Z')
  })
  it('the clock hint appears only when her clock is an hour or more from mine', () => {
    expect(zoneHint('2026-11-20T15:00:00Z', Z, undefined, 'Reem')).toBeNull()
    expect(zoneHint('2026-11-20T15:00:00Z', Z, Z, 'Reem')).toBeNull()
    expect(zoneHint('2026-11-20T15:00:00Z', Z, 'Asia/Riyadh', 'Reem')).toBe('(Reem 6:00 PM)') // +3 vs +2 in winter
    expect(zoneHint('2026-11-20T15:00:00Z', Z, 'America/New_York', 'Reem')).toBe('(Reem 10:00 AM)')
    expect(zoneHint('2026-11-20T15:00:00Z', 'Asia/Riyadh', 'Africa/Cairo', 'Reem')).toBe('(Reem 5:00 PM)')
  })
})
