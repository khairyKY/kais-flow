import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import { githubRulesOf, githubState, watchingHelp } from './api'

describe('githubState', () => {
  it('names each real state of the row github-sync keeps', () => {
    expect(githubState(undefined)).toEqual({ text: 'Not connected', tone: 'off' })
    expect(githubState({ status: 'failing', synced_at: '2026-10-01T08:00:00Z' })).toEqual({ text: 'Token expired — reconnect', tone: 'bad' })
    expect(githubState({ status: 'ok', synced_at: null })).toEqual({ text: 'Connected · not synced yet', tone: 'ok' })
  })

  it('says Paused when the rules pause it — an expired token still wins, it needs doing', () => {
    expect(githubState({ status: 'ok', synced_at: null, rules: { paused: true } })).toEqual({ text: 'Paused', tone: 'off' })
    expect(githubState({ status: 'failing', synced_at: null, rules: { paused: true } }).tone).toBe('bad')
    expect(githubState({ status: 'ok', synced_at: null, rules: { paused: false } }).text).toBe('Connected · not synced yet')
  })

  it('shows the day of the last good sync, in Cairo time, so a stuck sync is visible', () => {
    // 08:07 UTC on 1 Oct = 11:07 in Cairo (EEST, UTC+3).
    expect(githubState({ status: 'ok', synced_at: '2026-10-01T08:07:00Z' }).text).toBe('Connected · synced 1 Oct, 11:07')
  })
})

describe('githubRulesOf / watchingHelp (Settings 2a)', () => {
  it('a row from before the rules: defaults, flagged legacy, and the help says assigned issues still come', () => {
    const m = githubRulesOf({ repos: ['acme/app'], rules: null })
    expect(m).toEqual({ repos: ['acme/app'], rules: { land: 'inbox', priority: 'normal', paused: false }, legacy: true })
    expect(watchingHelp(m)).toBe('Every open issue in these, plus any assigned to you')
  })
  it('saved rules: the picked repos are the scope; none picked = assigned to you', () => {
    const m = githubRulesOf({ repos: ['acme/app'], rules: { land: 'tasks', priority: 'low', paused: false } })
    expect(m.legacy).toBe(false)
    expect(m.rules).toEqual({ land: 'tasks', priority: 'low', paused: false })
    expect(watchingHelp(m)).toBe('Every open issue in these repos, and nothing else')
    expect(watchingHelp({ repos: [], legacy: false })).toBe('None picked: every open issue assigned to you')
    expect(watchingHelp({ repos: [], legacy: true })).toBe('None picked: every open issue assigned to you')
  })
  it('not connected: empty, defaults', () => {
    expect(githubRulesOf(undefined)).toEqual({ repos: [], rules: { land: 'inbox', priority: 'normal', paused: false }, legacy: true })
  })
})
