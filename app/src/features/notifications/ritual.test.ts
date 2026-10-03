import { describe, expect, it } from 'vitest'
import { ritualDue, ritualOn, wallMinutes } from '../../../../supabase/functions/notify/ritual.ts'

// Cairo is UTC+3 on these dates (Egyptian summer time runs late April → late October).
const tick = (utc: string) => new Date(`2026-10-01T${utc}Z`)

describe('ritual reminders: who gets the digest on this cron tick', () => {
  it('reads the Cairo wall clock, whatever zone the server runs in', () => {
    expect(wallMinutes(tick('05:00:02'))).toBe(8 * 60)
    expect(wallMinutes(tick('21:30:00'))).toBe(30) // 00:30 the next Cairo day
    expect(wallMinutes(new Date('2026-12-01T06:00:00Z'))).toBe(8 * 60) // winter: UTC+2
  })

  it('no settings row → both reminders at the old fixed times (08:00, 21:00)', () => {
    expect(ritualDue('morning_digest', null, tick('05:00:02'))).toBe(true)
    expect(ritualDue('morning_digest', undefined, tick('05:15:01'))).toBe(false)
    expect(ritualDue('evening_nudge', {}, tick('18:00:01'))).toBe(true)
    expect(ritualDue('evening_nudge', {}, tick('05:00:01'))).toBe(false)
  })

  it('sends on the first tick at or after the chosen time, exactly once', () => {
    const s = { morning_digest_at: '08:40:00' } // Postgres hands `time` back with seconds
    const ticks = ['05:30:01', '05:45:01', '06:00:01'].map((t) => ritualDue('morning_digest', s, tick(t)))
    expect(ticks).toEqual([false, true, false])
    expect(ritualDue('morning_digest', { morning_digest_at: '08:45' }, tick('05:45:00'))).toBe(true)
  })

  it('wraps midnight: 23:55 goes out on the 00:00 tick', () => {
    expect(ritualDue('evening_nudge', { evening_nudge_at: '23:55' }, tick('21:00:01'))).toBe(true)
    expect(ritualDue('evening_nudge', { evening_nudge_at: '23:55' }, tick('20:45:01'))).toBe(false)
  })

  it('off means off; a malformed time falls back to the default', () => {
    expect(ritualOn('morning_digest', { morning_digest_on: false })).toBe(false)
    expect(ritualDue('morning_digest', { morning_digest_on: false }, tick('05:00:02'))).toBe(false)
    expect(ritualOn('evening_nudge', { morning_digest_on: false })).toBe(true)
    expect(ritualDue('morning_digest', { morning_digest_at: '25:99' }, tick('05:00:02'))).toBe(true)
  })

  it('the zone is one argument, ready for per-user timezones', () => {
    expect(ritualDue('morning_digest', {}, new Date('2026-10-01T15:00:00Z'), 'America/Los_Angeles')).toBe(true) // 08:00 PDT
  })
})
