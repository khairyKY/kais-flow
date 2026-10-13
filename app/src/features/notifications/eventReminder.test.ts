import { describe, expect, it } from 'vitest'
import { eventRemindersDue, reminderKey, type RemindRow } from '../../../../supabase/functions/_shared/eventReminder.ts'
import { eventReminderNotice, kindOn } from '../../../../supabase/functions/notify/copy.ts'
import { ruleBetween } from '../calendar/series'
import { localPlan, type PlanEvent } from './plan'

// Per-event reminders (0077, A12): the ONE rule notify and the device planner share.
// Saturday 3 Oct 2026, Cairo = UTC+3.
const cairo = (hhmm: string, day = 3) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const ev = (id: string, over: Partial<PlanEvent> = {}): PlanEvent => ({
  id, title: 'Gym', starts_at: cairo('18:00').toISOString(), ends_at: cairo('19:30').toISOString(), all_day: false, source: 'native', remind_min: 15, ...over,
})
const due = (rows: RemindRow[], from: Date, to: Date, zone = 'Africa/Cairo') =>
  eventRemindersDue(rows, from, to, zone, ruleBetween).map((d) => `${d.event.id}@${d.at.toISOString()}`)

describe('eventRemindersDue', () => {
  it('a one-off: due at its start minus remind_min, inside (from, to] only', () => {
    expect(due([ev('a')], cairo('17:40'), cairo('17:50'))).toEqual([`a@${cairo('17:45').toISOString()}`])
    expect(due([ev('a')], cairo('17:45'), cairo('17:55'))).toEqual([]) // == from: the last sweep had it
    expect(due([ev('a')], cairo('17:35'), cairo('17:45'))).toHaveLength(1) // == to: this sweep has it
    expect(due([ev('a', { remind_min: 0 })], cairo('17:55'), cairo('18:00'))).toHaveLength(1) // at start
  })

  it('follows a moved event (an offset, not a timestamp)', () => {
    const moved = ev('a', { starts_at: cairo('19:00').toISOString(), ends_at: cairo('20:00').toISOString() })
    expect(due([moved], cairo('17:40'), cairo('17:50'))).toEqual([])
    expect(due([moved], cairo('18:40'), cairo('18:50'))).toEqual([`a@${cairo('18:45').toISOString()}`])
  })

  it('every occurrence of a series, keyed by its own start; a skipped one stays quiet', () => {
    const gym = ev('s', { starts_at: cairo('18:00', 1).toISOString(), ends_at: cairo('19:30', 1).toISOString(), recurrence_rule: 'FREQ=DAILY' })
    const [d] = eventRemindersDue([gym], cairo('17:40'), cairo('17:50'), 'Africa/Cairo', ruleBetween)
    expect(d.event).toMatchObject({ id: `s::${cairo('18:00').toISOString()}`, seriesId: 's', starts_at: cairo('18:00').toISOString() })
    expect(reminderKey(d.event)).toEqual({ eventId: 's', startsAt: cairo('18:00').toISOString() })
    expect(due([{ ...gym, recurrence_exdates: [cairo('18:00').toISOString()] }], cairo('17:40'), cairo('17:50'))).toEqual([])
    // Three days ahead (the Android schedule): one a day.
    expect(due([gym], cairo('00:00'), cairo('00:00', 6))).toHaveLength(3)
  })

  it('never a Google event, an all-day one, a trashed one, or one without a reminder', () => {
    const rows = [
      ev('g', { source: 'gcal' }),
      ev('d', { all_day: true, starts_at: '2026-10-03T00:00:00.000Z', ends_at: '2026-10-04T00:00:00.000Z', remind_min: 0 }),
      ev('t', { deleted_at: '2026-10-02T00:00:00Z' }),
      ev('n', { remind_min: null }),
    ]
    expect(due(rows, cairo('00:00'), cairo('23:59'))).toEqual([])
  })

  it('a weekly series keeps its wall-clock time across a DST switch (the user’s zone, not the device’s)', () => {
    // New York leaves DST on Sun 1 Nov 2026: 09:00 is 13:00Z before, 14:00Z after.
    const run = ev('ny', { starts_at: '2026-10-25T13:00:00.000Z', ends_at: '2026-10-25T14:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY', remind_min: 30 })
    expect(due([run], new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'), 'America/New_York')).toEqual([`ny::2026-11-01T14:00:00.000Z@2026-11-01T13:30:00.000Z`])
  })

  it('reminderKey normalises a stored start ("+00:00") to ISO', () => {
    expect(reminderKey({ id: 'a', starts_at: '2026-10-03T15:00:00+00:00' })).toEqual({ eventId: 'a', startsAt: '2026-10-03T15:00:00.000Z' })
  })
})

describe('eventReminderNotice + the device planner', () => {
  const base = { tasks: [], from: cairo('17:40'), to: cairo('17:50'), now: cairo('17:40'), zone: 'Africa/Cairo' }

  it('"Gym · in 15 min" / "18:00–19:30" · Open on that day; its own switch, on by default', () => {
    const [p] = localPlan({ ...base, events: [ev('a')], prefs: { lock_screen_names: true } })
    expect(p.key).toBe(`event:a@${cairo('17:45').toISOString()}`)
    expect(p.notice).toMatchObject({ kind: 'event_reminder', title: 'Gym · in 15 min', body: '18:00–19:30', url: '/calendar?date=2026-10-03', tag: 'event-a', taskIds: [] })
    expect(p.notice.actions).toEqual([{ action: 'open', title: 'Open' }])
    expect(kindOn('event_reminder', null)).toBe(true)
    expect(localPlan({ ...base, events: [ev('a')], prefs: { event_reminder_on: false } })).toEqual([])
  })

  it('lock-screen names off hides the title; quiet hours make it silent; several at once are one', () => {
    const [p] = localPlan({ ...base, events: [ev('a')], prefs: {} })
    expect(p.notice).toMatchObject({ title: 'An event · in 15 min', body: 'Unlock to see it' })
    const late = ev('l', { starts_at: cairo('23:15').toISOString(), ends_at: cairo('23:45').toISOString() })
    expect(localPlan({ ...base, from: cairo('22:55'), to: cairo('23:05'), now: cairo('22:55'), events: [late], prefs: {} })[0].notice.silent).toBe(true)
    const two = eventReminderNotice([ev('a'), ev('b', { title: 'Lunch' })], { lock_screen_names: true }, cairo('17:45'), 'Africa/Cairo')
    expect(two).toMatchObject({ title: '2 events', body: 'Gym · Lunch', tag: 'events' })
    expect(localPlan({ ...base, events: [ev('a'), ev('b')], prefs: {} })).toHaveLength(1)
  })

  it('a Google event never reminds on a device either', () => {
    expect(localPlan({ ...base, events: [ev('g', { source: 'gcal' })], prefs: {} })).toEqual([])
  })
})
