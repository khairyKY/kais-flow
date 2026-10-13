import { describe, expect, it } from 'vitest'
import { ritualDue, ritualOn, shutDownOn, wallMinutes } from '../../../../supabase/functions/notify/ritual.ts'
import { finishedPayload } from '../rituals/loopDay'

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

describe('shutDownOn — the evening nudge stays quiet once Shut down is done (A29)', () => {
  // The rows exactly as the app writes them (rituals/loopDay.ts finishedPayload, Cairo here).
  const shut = (iso: string) => ({ payload: finishedPayload('evening', ['sweep', 'goodnight'], new Date(iso)) })
  const nudge = new Date('2026-10-01T18:00:00Z') // Thu 21:00 Cairo

  it('a Shut down earlier that evening, or at 00:30 that night, closes the day the 21:00 nudge is for', () => {
    expect(shutDownOn([shut('2026-10-01T17:00:00Z')], nudge, 'Africa/Cairo')).toBe(true) // Thu 20:00
    expect(shutDownOn([shut('2026-10-01T21:30:00Z')], new Date('2026-10-01T21:45:00Z'), 'Africa/Cairo')).toBe(true) // a 00:45 nudge, after a 00:30 Shut down
  })
  it("yesterday's Shut down, or the morning ritual, never does", () => {
    expect(shutDownOn([shut('2026-09-30T19:00:00Z')], nudge, 'Africa/Cairo')).toBe(false)
    expect(shutDownOn([{ payload: finishedPayload('morning', [], new Date('2026-10-01T05:00:00Z')) }], nudge, 'Africa/Cairo')).toBe(false)
    expect(shutDownOn([{ payload: null }, { payload: { ritual: 'evening' } }], nudge, 'Africa/Cairo')).toBe(false)
  })
  it("the day is the user's loop day: in Tokyo, 02:00 Friday still belongs to Thursday", () => {
    const thuTokyo = { payload: { ritual: 'evening', date: '2026-10-01' } }
    expect(shutDownOn([thuTokyo], new Date('2026-10-01T17:00:00Z'), 'Asia/Tokyo')).toBe(true) // Fri 02:00 JST
    expect(shutDownOn([thuTokyo], new Date('2026-10-01T19:00:00Z'), 'Asia/Tokyo')).toBe(false) // Fri 04:00 JST: a new day
  })
})
