import { describe, expect, it } from 'vitest'
import {
  deliver,
  digestNotice,
  focusDoneNotice,
  inQuietHours,
  isPaused,
  kindOn,
  nudgeNotice,
  reminderNotice,
  testNotice,
} from '../../../../supabase/functions/notify/copy.ts'

// Tray and Notifications.dc.html 12k, Saturday 3 Oct 2026 — Cairo is UTC+3 that day.
const cairo = (hhmm: string, day = 3) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const NAMES = { lock_screen_names: true }

describe('task reminder', () => {
  const tyre = { id: 't1', title: 'Call the tyre supplier', due_at: cairo('09:50').toISOString(), project: 'Car' }

  it('says the drawn copy, with Done · Tomorrow', () => {
    const n = reminderNotice([tyre], NAMES, cairo('09:40'))
    expect(n).toMatchObject({ title: 'Call the tyre supplier · in 10 min', body: '09:50 · Car', taskIds: ['t1'], url: '/tasks?focus=t1', silent: false })
    expect(n.actions.map((a) => a.title)).toEqual(['Done', 'Tomorrow'])
  })

  it('hides the task on the lock screen unless names are on (the default)', () => {
    const n = reminderNotice([tyre], {}, cairo('09:40'))
    expect([n.title, n.body]).toEqual(['A reminder', 'Unlock to see it'])
    expect(JSON.stringify(n)).not.toContain('tyre')
    expect(n.actions.map((a) => a.action)).toEqual(['done', 'tomorrow']) // the buttons still work
  })

  it('reads "now" at the time and "at 14:00" further off; no time, no lead', () => {
    expect(reminderNotice([tyre], NAMES, cairo('09:50')).title).toBe('Call the tyre supplier · now')
    expect(reminderNotice([{ ...tyre, due_at: cairo('14:00').toISOString() }], NAMES, cairo('09:40')).title).toBe('Call the tyre supplier · at 14:00')
    expect(reminderNotice([{ id: 'x', title: 'Water the plants' }], NAMES, cairo('09:40'))).toMatchObject({ title: 'Water the plants', body: '' })
  })

  it('several at once are one grouped notice', () => {
    const tasks = ['Reply to Omar', 'Buy milk', 'Water the plants', 'Book the dentist'].map((title, i) => ({ id: `g${i}`, title }))
    const n = reminderNotice(tasks.slice(0, 3), NAMES, cairo('08:10'))
    expect(n).toMatchObject({ title: '3 reminders', body: 'Reply to Omar · Buy milk · Water the plants', tag: 'reminders' })
    expect(n.actions.map((a) => a.title)).toEqual(['Open'])
    expect(reminderNotice(tasks, NAMES, cairo('08:10')).body).toBe('Reply to Omar · Buy milk · Water the plants · +1 more')
    expect(reminderNotice(tasks, {}, cairo('08:10'))).toMatchObject({ title: '4 reminders', body: 'Unlock to see them' })
  })
})

describe('the other kinds', () => {
  it('morning digest: the goal + two more, silent, Plan my day · Open', () => {
    const n = digestNotice(['GCI homework 1 — NumPy', 'the lecture 2 survey', 'OS lectures 1 + 2'], NAMES)
    expect(n).toMatchObject({ title: 'Good morning — 3 to tend today', body: '✶ GCI homework 1 — NumPy, then the lecture 2 survey and OS lectures 1 + 2.', silent: true })
    expect(n.actions.map((a) => a.title)).toEqual(['Plan my day', 'Open'])
    expect(digestNotice(['a', 'b'], {}).body).toBe('Unlock to see them')
    expect(digestNotice([], {})).toMatchObject({ title: 'Good morning', body: 'Nothing picked yet — plan the day.' })
  })

  it('evening nudge and focus done', () => {
    expect(nudgeNotice(4, 2)).toMatchObject({ title: 'The garden’s ready to close', body: '4 done · 2 left', url: '/today?ritual=evening' })
    const f = focusDoneNotice(25, 'GCI homework 1 — NumPy', 5, NAMES)
    expect(f).toMatchObject({ title: '25 minutes tended ✿', body: 'GCI homework 1 — NumPy' })
    expect(f.actions.map((a) => a.title)).toEqual(['Break 5 min', 'Keep going'])
    expect(focusDoneNotice(25, 'GCI homework 1 — NumPy', 5, {}).body).toBe('A focus timer')
  })
})

describe('who gets one', () => {
  it('each kind has its own switch, on unless turned off', () => {
    expect(kindOn('task_reminder', null)).toBe(true)
    expect(kindOn('task_reminder', { task_reminder_on: false })).toBe(false)
    expect(kindOn('morning_digest', { morning_digest_on: false })).toBe(false)
    expect(kindOn('overdue', { task_reminder_on: false })).toBe(true)
  })

  it('quiet hours: 22:30–07:00 Cairo by default, across midnight, any server zone', () => {
    expect(inQuietHours(null, cairo('23:00'))).toBe(true)
    expect(inQuietHours(null, cairo('06:59'))).toBe(true)
    expect(inQuietHours(null, cairo('07:00'))).toBe(false)
    expect(inQuietHours(null, cairo('22:29'))).toBe(false)
    expect(inQuietHours({ quiet_hours_on: false }, cairo('23:00'))).toBe(false)
    expect(inQuietHours({ quiet_from: '13:00:00', quiet_to: '14:00:00' }, cairo('13:30'))).toBe(true) // Postgres `time`
    expect(inQuietHours({ quiet_from: '13:00', quiet_to: '14:00' }, cairo('23:00'))).toBe(false)
  })

  it('deliver: off or paused sends nothing, quiet hours send silently, a test always goes', () => {
    const now = cairo('23:15')
    const r = reminderNotice([{ id: 'a', title: 'x' }], {}, now)
    expect(deliver(r, { task_reminder_on: false }, cairo('12:00'))).toBeNull()
    expect(deliver(r, { notify_paused_until: cairo('23:45').toISOString() }, now)).toBeNull()
    expect(isPaused({ notify_paused_until: cairo('23:00').toISOString() }, now)).toBe(false)
    expect(deliver(r, {}, now)).toMatchObject({ silent: true })
    expect(deliver(r, {}, cairo('12:00'))).toMatchObject({ silent: false })
    expect(deliver(testNotice(), { notify_paused_until: cairo('23:45').toISOString() }, now)).not.toBeNull()
  })
})
