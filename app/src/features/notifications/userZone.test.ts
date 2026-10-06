import { describe, expect, it } from 'vitest'
import { DEFAULT_ZONE, userZone, wallClock } from '../../../../supabase/functions/_shared/zone.ts'
import { dayBounds, ritualDue, wallMinutes } from '../../../../supabase/functions/notify/ritual.ts'
import { deliver, inQuietHours, nudgeNotice, reminderNotice } from '../../../../supabase/functions/notify/copy.ts'
import { dayStart, snapshotText } from '../../../../supabase/functions/chat/prompt.ts'

// User time zones (2026-10-04), the server half: notify, chat and parse-capture read each user's
// app_settings.timezone. New York is EDT (UTC-4) and Tokyo JST (UTC+9) on every date below.
const NY = 'America/New_York'
const TOKYO = 'Asia/Tokyo'

describe('a stored zone', () => {
  it('is used when Intl knows it, else Cairo — a typo never breaks a cron run', () => {
    expect(userZone(NY)).toBe(NY)
    expect(userZone(' UTC ')).toBe('UTC')
    expect(userZone(null)).toBe(DEFAULT_ZONE)
    expect(userZone('')).toBe(DEFAULT_ZONE)
    expect(userZone('Cairo')).toBe(DEFAULT_ZONE)
  })
  it('gives the parse model the user’s own now, with its offset', () => {
    const line = wallClock(new Date('2026-10-04T01:00:00Z'), NY)
    expect(line).toMatch(/^Saturday,? 3 October 2026\b.*21:00/) // ICU builds differ on the comma

    expect(line).toContain('(America/New_York, GMT-04:00)')
    expect(wallClock(new Date('2026-10-04T01:00:00Z'), 'Bad/Zone')).toContain('(Africa/Cairo, GMT+03:00)')
  })
})

describe('notify on a New York user’s clock', () => {
  it('sends the 08:00 digest at 08:00 New York, not 08:00 Cairo', () => {
    const at8NY = new Date('2026-10-04T12:05:00Z')
    expect(wallMinutes(at8NY, NY)).toBe(8 * 60 + 5)
    expect(ritualDue('morning_digest', { timezone: NY }, at8NY, NY)).toBe(true)
    expect(ritualDue('morning_digest', { timezone: NY }, at8NY)).toBe(false) // 15:05 in Cairo
    const at8Cairo = new Date('2026-10-04T05:05:00Z') // 01:05 in New York
    expect(ritualDue('morning_digest', {}, at8Cairo)).toBe(true)
    expect(ritualDue('morning_digest', {}, at8Cairo, NY)).toBe(false)
  })
  it('honours a custom evening time on the user’s clock', () => {
    const s = { evening_nudge_at: '20:30:00', timezone: TOKYO }
    expect(ritualDue('evening_nudge', s, new Date('2026-10-04T11:40:00Z'), TOKYO)).toBe(true) // 20:40 Tokyo
    expect(ritualDue('evening_nudge', s, new Date('2026-10-04T11:40:00Z'))).toBe(false) // 14:40 Cairo
  })
  it('the evening nudge counts the user’s today', () => {
    expect(dayBounds(new Date('2026-10-04T03:00:00Z'), NY)).toEqual({ start: '2026-10-03T04:00:00.000Z', end: '2026-10-04T04:00:00.000Z' })
    expect(dayBounds(new Date('2026-10-04T03:00:00Z'))).toEqual({ start: '2026-10-03T21:00:00.000Z', end: '2026-10-04T21:00:00.000Z' })
  })
  it('quiet hours are 22:30–07:00 on the user’s clock', () => {
    const t = new Date('2026-10-04T05:00:00Z') // 01:00 New York, 08:00 Cairo
    expect(inQuietHours(undefined, t, NY)).toBe(true)
    expect(inQuietHours(undefined, t)).toBe(false)
    expect(deliver(nudgeNotice(1, 1), undefined, t, NY)?.silent).toBe(true)
    expect(deliver(nudgeNotice(1, 1), undefined, t)?.silent).toBe(false)
  })
  it('a reminder prints the time on the user’s clock', () => {
    const task = { id: 't', title: 'Call the tyre supplier', due_at: '2026-10-04T14:00:00Z' }
    expect(reminderNotice([task], { lock_screen_names: true }, new Date('2026-10-04T13:50:00Z'), NY).body).toBe('10:00')
    expect(reminderNotice([task], { lock_screen_names: true }, new Date('2026-10-04T13:50:00Z'), TOKYO).body).toBe('23:00')
  })
})

describe('chat’s snapshot on the user’s clock', () => {
  const now = new Date('2026-10-04T01:00:00Z') // Sat 21:00 New York · Sun 04:00 Cairo · Sun 10:00 Tokyo
  const tasks = [
    { title: 'Tonight', due_at: null, scheduled_start: '2026-10-04T00:30:00Z', top3: true }, // 20:30 Sat NY
    { title: 'Sunday call', due_at: '2026-10-04T14:00:00Z', scheduled_start: null, top3: false }, // 10:00 Sun NY
  ]

  it('days start at the user’s midnight', () => {
    expect(dayStart(now, NY).toISOString()).toBe('2026-10-03T04:00:00.000Z')
    expect(dayStart(now, TOKYO).toISOString()).toBe('2026-10-03T15:00:00.000Z')
    expect(dayStart(now, NY, 2).toISOString()).toBe('2026-10-05T04:00:00.000Z')
  })
  it('splits today from tomorrow on New York’s calendar', () => {
    const text = snapshotText(now, tasks, [], 0, NY)
    expect(text).toContain('(America/New_York)')
    expect(text).toMatch(/Now: Saturday,? 3 October\b.*21:00/)
    expect(text).toContain("Today's tasks:\n- ★ Tonight (20:30)")
    expect(text).toContain('Tomorrow:\n- Sunday call (10:00)')
  })
  it('in Cairo the same instant is Sunday, so both are today’s', () => {
    const text = snapshotText(now, tasks, [], 0)
    expect(text).toContain("Today's tasks:\n- ★ Tonight (03:30)\n- Sunday call (17:00)")
  })
})
