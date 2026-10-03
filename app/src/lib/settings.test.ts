import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./outbox', () => ({ writeRow: vi.fn() }))
const { parseCalendarDefaultView, CALENDAR_DEFAULT_VIEWS } = await import('./settings')

describe('parseCalendarDefaultView', () => {
  it('keeps the three views both calendars have', () => {
    expect(CALENDAR_DEFAULT_VIEWS.map(parseCalendarDefaultView)).toEqual(['day', '3day', 'week'])
  })
  it('reads never-chosen (null / missing column) as no choice — the platform default applies', () => {
    expect(parseCalendarDefaultView(null)).toBeNull()
    expect(parseCalendarDefaultView(undefined)).toBeNull()
  })
  it('ignores anything else (month, a stale value, junk)', () => {
    expect(parseCalendarDefaultView('month')).toBeNull()
    expect(parseCalendarDefaultView('Week')).toBeNull()
    expect(parseCalendarDefaultView(7)).toBeNull()
  })
})
