import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from './queryClient'
import { DEBOUNCE_MS, invalidateSoon, MAX_WAIT_MS } from './realtime'

// realtime.ts reaches for the Supabase client and the auth provider; invalidateSoon needs neither.
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('../features/auth/AuthProvider', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('./settings', () => ({ useAppSettings: () => ({ data: null }) }))

// gcal-events: google-sync lands a hundred rows at a time and Realtime sends a message per row. One refetch, not a hundred.
describe('invalidateSoon — a burst of realtime messages is one refetch', () => {
  let spy: { mockRestore: () => void; mock: { calls: unknown[][] } }
  beforeEach(() => {
    vi.useFakeTimers()
    spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  })
  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
    spy.mockRestore()
  })

  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0])

  it('335 changes inside a quiet second invalidate the table once, after the burst ends', () => {
    for (let i = 0; i < 335; i++) {
      invalidateSoon('calendar_events')
      vi.advanceTimersByTime(3)
    }
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(keys()).toEqual(['calendar_events', 'deleted_items']) // the Trash list reads the same rows
  })

  it('tables are independent', () => {
    invalidateSoon('tasks')
    invalidateSoon('calendar_events')
    invalidateSoon('tasks')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(keys().filter((k) => k === 'tasks')).toHaveLength(1) // two messages, one refetch
    expect(keys().filter((k) => k === 'calendar_events')).toHaveLength(1)
  })

  it('a stream that never goes quiet still lands every MAX_WAIT_MS', () => {
    const every = 100
    for (let t = 0; t < MAX_WAIT_MS * 2.5; t += every) {
      invalidateSoon('routines')
      vi.advanceTimersByTime(every)
    }
    const landed = keys().filter((k) => k === 'routines').length
    expect(landed).toBeGreaterThanOrEqual(2)
    expect(landed).toBeLessThanOrEqual(3)
  })

  it('a later change after the refetch starts a new wait', () => {
    invalidateSoon('projects')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    invalidateSoon('projects')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(keys().filter((k) => k === 'projects')).toHaveLength(2)
  })
})
