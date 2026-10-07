import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/settings', () => ({ updateAppSetting: vi.fn() }))

import { updateAppSetting } from '../../lib/settings'
import { queryClient } from '../../lib/queryClient'
import {
  DESKTOP_NOTES,
  HINTS,
  PHONE_NOTES,
  dotCount,
  loadHelp,
  markSeen,
  markTourPending,
  mergeSeen,
  pickHint,
  readSeen,
  restartTour,
  shouldAutoStart,
  startTour,
  tourEvent,
  tourPending,
  tourStep,
  useHelp,
  writeSeen,
  type HintContext,
} from './help'

function memoryStorage() {
  const store = new Map<string, string>()
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
}

describe('the tour (Tour and Help 14a–14g)', () => {
  it('Next walks the notes; past the last one, Skip or Done, it is over', () => {
    expect(tourStep(0, 'next', 6)).toBe(1)
    expect(tourStep(4, 'next', 6)).toBe(5)
    expect(tourStep(5, 'next', 6)).toBeNull()
    expect(tourStep(1, 'skip', 6)).toBeNull()
    expect(tourStep(5, 'done', 6)).toBeNull()
  })

  it('a note whose anchor never shows is passed over, never a dead end', () => {
    expect(tourStep(2, 'missing', 6)).toBe(3)
    expect(tourStep(5, 'missing', 6)).toBeNull()
    // The plan note falls back to Today's ⋯ menu when the day card isn't up (mid-day, an empty day).
    expect(PHONE_NOTES.find((n) => n.id === 'plan')?.anchors).toEqual(['plan', 'plan-menu'])
    // The closing cards need no anchor, so the tour always has an end.
    expect(PHONE_NOTES.at(-1)?.anchors).toEqual([])
    expect(DESKTOP_NOTES.at(-1)?.anchors).toEqual([])
  })

  it('five dots on both: the phone’s closing card has none of its own', () => {
    expect(dotCount(PHONE_NOTES)).toBe(5)
    expect(dotCount(DESKTOP_NOTES)).toBe(5)
  })

  it('starts on its own only after onboarding, once, never twice at a time', () => {
    expect(shouldAutoStart(true, new Set(), false)).toBe(true)
    expect(shouldAutoStart(false, new Set(), false)).toBe(false) // an existing account: the Guide offers it
    expect(shouldAutoStart(true, new Set(['tour']), false)).toBe(false)
    expect(shouldAutoStart(true, new Set(), true)).toBe(false)
  })
})

describe('the hints (14h)', () => {
  const ctx = (o: Partial<HintContext> = {}): HintContext => ({ seen: new Set(), touch: true, tourRunning: false, path: '/today', has: () => true, ...o })

  it('one at a time, the first unseen one whose anchor is on screen', () => {
    expect(pickHint(HINTS, ctx())?.key).toBe('hint:swipe')
    expect(pickHint(HINTS, ctx({ seen: new Set(['hint:swipe']) }))).toBeNull() // calendar and inbox live on their own pages
    expect(pickHint(HINTS, ctx({ path: '/calendar', seen: new Set(['hint:swipe']) }))?.key).toBe('hint:calendar')
  })

  it('once each: a seen hint never comes back', () => {
    const seen = new Set(['hint:swipe', 'hint:calendar', 'hint:inbox'])
    for (const path of ['/today', '/calendar', '/inbox']) expect(pickHint(HINTS, ctx({ seen, path }))).toBeNull()
  })

  it('a missing anchor shows nothing; swipes are touch-only; never during the tour', () => {
    expect(pickHint(HINTS, ctx({ path: '/inbox', has: (n) => n !== 'inbox-item' }))?.key).toBe('hint:swipe')
    expect(pickHint(HINTS, ctx({ path: '/inbox', has: (n) => n === 'inbox-item' }))?.key).toBe('hint:inbox')
    expect(pickHint(HINTS, ctx({ has: () => false }))).toBeNull()
    expect(pickHint(HINTS, ctx({ touch: false }))).toBeNull()
    expect(pickHint(HINTS, ctx({ tourRunning: true }))).toBeNull()
  })
})

describe('what’s been seen, per user', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('kept per user on this device', () => {
    const s = memoryStorage()
    writeSeen('a', ['tour', 'hint:swipe', 'tour'], s)
    expect(readSeen('a', s)).toEqual(['tour', 'hint:swipe'])
    expect(readSeen('b', s)).toEqual([])
    markTourPending('a', s)
    expect(tourPending('a', s)).toBe(true)
    expect(tourPending('b', s)).toBe(false)
  })

  it('blocked or junk storage: nothing seen, nothing thrown', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(readSeen('a', blocked)).toEqual([])
    expect(() => writeSeen('a', ['tour'], blocked)).not.toThrow()
    expect(() => markTourPending('a', blocked)).not.toThrow()
    expect(tourPending('a', blocked)).toBe(false)
    const junk = memoryStorage()
    junk.setItem('kf-help:a', '{"no":1}')
    expect(readSeen('a', junk)).toEqual([])
  })

  it('seen = this device’s list and the account’s, together', () => {
    expect([...mergeSeen(['tour'], ['hint:inbox'])].sort()).toEqual(['hint:inbox', 'tour'])
    expect([...mergeSeen(['tour'], undefined)]).toEqual(['tour'])
  })
})

describe('the shared state', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.mocked(updateAppSetting).mockClear()
    queryClient.removeQueries({ queryKey: ['app_settings'] })
    useHelp.setState({ uid: undefined, local: [], note: null })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('Done counts as seen and spends the onboarding flag; Skip too', () => {
    loadHelp('a')
    markTourPending('a')
    startTour()
    tourEvent('next', 6)
    expect(useHelp.getState().note).toBe(1)
    tourEvent('skip', 6)
    expect(useHelp.getState().note).toBeNull()
    expect(readSeen('a')).toEqual(['tour'])
    expect(tourPending('a')).toBe(false)
  })

  it('restart forgets the tour and every hint, and starts from the first note', () => {
    loadHelp('a')
    markSeen('tour', 'hint:swipe')
    restartTour()
    expect(useHelp.getState().note).toBe(0)
    expect(readSeen('a')).toEqual([])
    expect(useHelp.getState().local).toEqual([])
  })

  it('per user: another account on this browser starts fresh', () => {
    loadHelp('a')
    markSeen('tour')
    loadHelp('b')
    expect(useHelp.getState().local).toEqual([])
    loadHelp('a')
    expect(useHelp.getState().local).toEqual(['tour'])
  })

  it('syncs to the account only once the server row has the column (migration 0058)', () => {
    loadHelp('a')
    queryClient.setQueryData(['app_settings'], { id: 'x' })
    markSeen('hint:swipe')
    expect(updateAppSetting).not.toHaveBeenCalled()
    queryClient.setQueryData(['app_settings'], { id: 'x', help_seen: ['hint:inbox'] })
    markSeen('tour')
    expect(updateAppSetting).toHaveBeenCalledWith('help_seen', expect.arrayContaining(['hint:swipe', 'hint:inbox', 'tour']))
    vi.mocked(updateAppSetting).mockClear()
    markSeen('tour') // already seen: nothing to write
    expect(updateAppSetting).not.toHaveBeenCalled()
  })
})
