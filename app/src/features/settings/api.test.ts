import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import { githubState } from './api'

describe('githubState', () => {
  it('names each real state of the row github-sync keeps', () => {
    expect(githubState(undefined)).toEqual({ text: 'Not connected', tone: 'off' })
    expect(githubState({ status: 'failing', synced_at: '2026-10-01T08:00:00Z' })).toEqual({ text: 'Token expired — reconnect', tone: 'bad' })
    expect(githubState({ status: 'ok', synced_at: null })).toEqual({ text: 'Connected · not synced yet', tone: 'ok' })
  })

  it('shows the day of the last good sync, in Cairo time, so a stuck sync is visible', () => {
    // 08:07 UTC on 1 Oct = 11:07 in Cairo (EEST, UTC+3).
    expect(githubState({ status: 'ok', synced_at: '2026-10-01T08:07:00Z' }).text).toBe('Connected · synced 1 Oct, 11:07')
  })
})
