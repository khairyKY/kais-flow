import { describe, expect, it } from 'vitest'
import { BUNDLED_VERSION, NOTES, dueForCheck, highlightsFromBody, isNewAccount, nativeNudgeAllowed, noteFor, shouldNudge, shouldShowUpdated } from './whatsNew'
import { compareVersions } from './appUpdate'

describe('the bundled notes (site/src/releases.json)', () => {
  it('are newest first, each with highlights, and the newest is this build', () => {
    expect(NOTES.length).toBeGreaterThan(10)
    for (let i = 1; i < NOTES.length; i++) expect(compareVersions(NOTES[i - 1].v, NOTES[i].v)).toBe(1)
    expect(NOTES.every((n) => n.highlights.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(n.date ?? ''))).toBe(true)
    expect(BUNDLED_VERSION).toBe(NOTES[0].v)
  })
  it('look a version up with or without the v, and miss one they do not have', () => {
    expect(noteFor('1.0.21')?.v).toBe('v1.0.21')
    expect(noteFor('v1.0.20')?.highlights.length).toBeGreaterThan(0)
    expect(noteFor('v9.9.9')).toBeNull()
  })
})

describe('highlightsFromBody (a GitHub Release body)', () => {
  it('reads the "- " lines release.yml writes, CRLF or not', () => {
    const body = 'Your own time zone\r\n\r\n- One\r\n- Two, with: a colon\r\n\r\nLive at https://x · Android APK attached below.'
    expect(highlightsFromBody(body)).toEqual(['One', 'Two, with: a colon'])
  })
  it('gives nothing for generated notes (commit titles under a heading) or no body', () => {
    expect(highlightsFromBody('Live at x\n\n## What’s Changed\n* feat: thing by @kai in #3\n\n**Full Changelog**: …')).toEqual([])
    expect(highlightsFromBody('Live at x\n\n**Full Changelog**: https://github.com/x/compare/v1...v2')).toEqual([])
    expect(highlightsFromBody(null)).toEqual([])
  })
})

describe('shouldShowUpdated — "Updated to vX" once per version', () => {
  it('shows on the first launch of a newer version, not again, and not for an older one', () => {
    expect(shouldShowUpdated('v1.0.20', 'v1.0.21', false)).toBe(true)
    expect(shouldShowUpdated('v1.0.21', 'v1.0.21', false)).toBe(false)
    expect(shouldShowUpdated('v1.0.22', 'v1.0.21', false)).toBe(false)
    expect(shouldShowUpdated('1.0.20', 'v1.0.21', true)).toBe(true) // a seen version wins over account age
  })
  it('with nothing seen here: an older account hears once, a brand-new one did not update', () => {
    expect(shouldShowUpdated(null, 'v1.0.21', false)).toBe(true)
    expect(shouldShowUpdated(null, 'v1.0.21', true)).toBe(false)
  })
  it('a new account = signed up within the last day', () => {
    const now = Date.parse('2026-10-07T12:00:00Z')
    expect(isNewAccount('2026-10-07T01:00:00Z', now)).toBe(true)
    expect(isNewAccount('2026-10-05T12:00:00Z', now)).toBe(false)
    expect(isNewAccount(undefined, now)).toBe(false)
  })
})

describe('shouldNudge — "vX is out" once per newer version', () => {
  it('only for a version newer than the running one', () => {
    expect(shouldNudge('v1.0.22', 'v1.0.21', null)).toBe(true)
    expect(shouldNudge('v1.0.21', 'v1.0.21', null)).toBe(false)
    expect(shouldNudge('v1.0.20', 'v1.0.21', null)).toBe(false)
  })
  it('never twice for the same version, but again for the next one', () => {
    expect(shouldNudge('v1.0.22', 'v1.0.21', 'v1.0.22')).toBe(false)
    expect(shouldNudge('v1.0.23', 'v1.0.21', 'v1.0.22')).toBe(true)
  })
})

describe('dueForCheck — the quiet check at most once a day', () => {
  const now = Date.parse('2026-10-07T12:00:00Z')
  it('is due with no check yet, or a day after the last', () => {
    expect(dueForCheck(undefined, now)).toBe(true)
    expect(dueForCheck(now - 86_400_000, now)).toBe(true)
  })
  it('is not due within the day', () => {
    expect(dueForCheck(now - 3_600_000, now)).toBe(false)
    expect(dueForCheck(now - 86_399_000, now)).toBe(false)
  })
  it('is due when the clock went back past the last check', () => {
    expect(dueForCheck(now + 3_600_000, now)).toBe(true)
  })
})

describe('nativeNudgeAllowed — the Windows toast', () => {
  // 13:00 and 23:30 in Cairo (UTC+3 in October)
  const day = new Date('2026-10-07T10:00:00Z')
  const night = new Date('2026-10-07T20:30:00Z')
  it('goes when nobody is looking, outside quiet hours, not paused', () => {
    expect(nativeNudgeAllowed({}, day, 'Africa/Cairo', false)).toBe(true)
  })
  it('stays quiet while someone is looking at the app', () => {
    expect(nativeNudgeAllowed({}, day, 'Africa/Cairo', true)).toBe(false)
  })
  it('respects quiet hours (default 22:30–07:00 on the user’s own clock) unless they are off', () => {
    expect(nativeNudgeAllowed({}, night, 'Africa/Cairo', false)).toBe(false)
    expect(nativeNudgeAllowed({ quiet_hours_on: false }, night, 'Africa/Cairo', false)).toBe(true)
    // the same instant is 13:30 in Los Angeles
    expect(nativeNudgeAllowed({}, night, 'America/Los_Angeles', false)).toBe(true)
  })
  it('respects "Pause notifications" until it runs out', () => {
    expect(nativeNudgeAllowed({ notify_paused_until: '2026-10-07T11:00:00Z' }, day, 'Africa/Cairo', false)).toBe(false)
    expect(nativeNudgeAllowed({ notify_paused_until: '2026-10-07T09:00:00Z' }, day, 'Africa/Cairo', false)).toBe(true)
  })
})
