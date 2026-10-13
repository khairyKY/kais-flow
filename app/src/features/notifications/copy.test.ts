import { describe, expect, it } from 'vitest'
import {
  birthdayNotice,
  CHECK_BELOW,
  deliver,
  digestNotice,
  focusDoneNotice,
  inQuietHours,
  isPaused,
  kindOn,
  nudgeNotice,
  paperReadyNotice,
  reminderNotice,
  routineNotice,
  syncNotice,
  testNotice,
} from '../../../../supabase/functions/notify/copy.ts'
import { CHECK_BELOW as APP_CHECK_BELOW } from '../paper/paperMath'

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

  it('morning digest: "N overdue" in place of the old hourly push — a count, never a name', () => {
    expect(digestNotice(['GCI homework', 'Survey'], NAMES, 4).body).toBe('✶ GCI homework, then Survey. 4 overdue.')
    expect(digestNotice(['GCI homework'], {}, 1).body).toBe('Unlock to see them. 1 overdue.')
    expect(digestNotice([], {}, 2)).toMatchObject({ title: 'Good morning', body: 'Nothing picked yet — plan the day. 2 overdue.' })
    expect(digestNotice(['a'], NAMES, 0).body).toBe('✶ a.')
  })

  it('routine reminder: "Stretch — 07:30" · Open; several at once are one; private without names', () => {
    const stretch = { id: 'r1', name: 'Stretch', clock_time: '07:30:00' }
    const n = routineNotice([stretch], NAMES)
    expect(n).toMatchObject({ kind: 'routine', title: 'Stretch — 07:30', body: '', tag: 'routine-r1', url: '/routines', silent: false })
    expect(n.actions).toEqual([{ action: 'open', title: 'Open' }])
    expect(routineNotice([stretch], {})).toMatchObject({ title: 'A routine — 07:30', body: 'Unlock to see it' })
    const two = [stretch, { id: 'r2', name: 'Journal', clock_time: '07:30' }]
    expect(routineNotice(two, NAMES)).toMatchObject({ title: '2 routines — 07:30', body: 'Stretch · Journal', tag: 'routines' })
    expect(routineNotice(two, {}).body).toBe('Unlock to see them')
    expect(JSON.stringify(routineNotice(two, {}))).not.toContain('Stretch')
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
    expect(kindOn('routine', { routine_on: false })).toBe(false)
    expect(kindOn('test', { task_reminder_on: false })).toBe(true) // no switch: always on
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

describe('the three 12k drew last (2026-10-12): paper ready, birthday, sync problem', () => {
  const lecture = { id: 'c1', title: 'OS lecture 3', items: [0.95, 0.9, 0.9, 0.85, 0.8, 0.6, 0.4].map((confidence) => ({ confidence })) }

  it('paper ready: the drawn copy, silent, Review → the capture', () => {
    const n = paperReadyNotice(lecture, NAMES)
    expect(n).toMatchObject({ kind: 'paper_ready', title: 'Your page is read — 7 things', body: 'From “OS lecture 3”. 2 need a quick look.', tag: 'paper-c1', url: '/inbox', silent: true, taskIds: ['c1'] })
    expect(n.actions).toEqual([{ action: 'review', title: 'Review' }])
  })

  it('paper ready: one thing, one to check, no title, nothing unsure', () => {
    expect(paperReadyNotice({ id: 'c', title: null, items: [{ confidence: 0.5 }] }, NAMES)).toMatchObject({ title: 'Your page is read — 1 thing', body: '1 needs a quick look.' })
    expect(paperReadyNotice({ ...lecture, items: [{ confidence: 0.9 }, { confidence: CHECK_BELOW }] }, NAMES).body).toBe('From “OS lecture 3”.')
    expect(paperReadyNotice({ id: 'c', title: null, items: [{ confidence: 0.9 }] }, NAMES).body).toBe('')
  })

  it('paper ready: "a quick look" is the results sheet’s own line count (paperMath CHECK_BELOW)', () => {
    expect(CHECK_BELOW).toBe(APP_CHECK_BELOW)
  })

  it('paper ready, private: "A page is ready", nothing of the page in it', () => {
    const n = paperReadyNotice(lecture, {})
    expect([n.title, n.body]).toEqual(['A page is ready', 'Unlock to see it'])
    expect(JSON.stringify(n)).not.toContain('OS lecture')
    expect(n.actions).toEqual([{ action: 'review', title: 'Review' }])
  })

  it('birthday: "Omar’s birthday is today" / "Last spoke 12 days ago." · Open Omar, silent', () => {
    const n = birthdayNotice([{ id: 'p1', name: 'Omar', lastSpokeDays: 12 }], NAMES)
    expect(n).toMatchObject({ kind: 'birthday', title: 'Omar’s birthday is today', body: 'Last spoke 12 days ago.', tag: 'birthday-p1', url: '/people/p1', silent: true })
    expect(n.actions).toEqual([{ action: 'open', title: 'Open Omar' }])
    expect(birthdayNotice([{ id: 'p1', name: 'Omar', lastSpokeDays: 1 }], NAMES).body).toBe('Last spoke yesterday.')
    expect(birthdayNotice([{ id: 'p1', name: 'Omar', lastSpokeDays: 0 }], NAMES).body).toBe('Last spoke today.')
    expect(birthdayNotice([{ id: 'p1', name: 'Omar', lastSpokeDays: null }], NAMES).body).toBe('')
  })

  it('birthday, private: "A birthday" — and the button never says the name', () => {
    const n = birthdayNotice([{ id: 'p1', name: 'Omar', lastSpokeDays: 12 }], {})
    expect([n.title, n.body]).toEqual(['A birthday', 'Unlock to see it'])
    expect(n.actions).toEqual([{ action: 'open', title: 'Open' }])
    expect(JSON.stringify(n)).not.toContain('Omar')
  })

  it('birthdays: several on one day are one notice → People', () => {
    const people = ['Omar', 'Salma', 'Nour', 'Hana'].map((name, i) => ({ id: `p${i}`, name, lastSpokeDays: null }))
    const n = birthdayNotice(people.slice(0, 2), NAMES)
    expect(n).toMatchObject({ title: '2 birthdays today', body: 'Omar · Salma', tag: 'birthdays', url: '/people' })
    expect(n.actions).toEqual([{ action: 'open', title: 'Open' }])
    expect(birthdayNotice(people, NAMES).body).toBe('Omar · Salma · Nour · +1 more')
    expect(birthdayNotice(people, {}).body).toBe('Unlock to see them')
    expect(JSON.stringify(birthdayNotice(people, {}))).not.toContain('Omar')
  })

  it('a week ahead (P7 7b): "… is in a week", its own tag so it never replaces the day’s', () => {
    const omar = [{ id: 'p1', name: 'Omar', lastSpokeDays: 5 }]
    expect(birthdayNotice(omar, NAMES, 7)).toMatchObject({ kind: 'birthday', title: 'Omar’s birthday is in a week', body: 'Last spoke 5 days ago.', tag: 'birthday-soon-p1', url: '/people/p1', silent: true })
    expect(birthdayNotice(omar, NAMES, 7).actions).toEqual([{ action: 'open', title: 'Open Omar' }])
    const two = [...omar, { id: 'p2', name: 'Salma', lastSpokeDays: null }]
    expect(birthdayNotice(two, NAMES, 7)).toMatchObject({ title: '2 birthdays in a week', body: 'Omar · Salma', tag: 'birthdays-soon', url: '/people' })
    expect([birthdayNotice(omar, {}, 7).title, birthdayNotice(omar, {}, 7).body]).toEqual(['A birthday in a week', 'Unlock to see it'])
    expect(JSON.stringify(birthdayNotice(two, {}, 7))).not.toMatch(/Omar|Salma/)
  })

  it('sync problem: the drawn copy, one and many; set-aside writes never promise a retry', () => {
    expect(syncNotice(2)).toMatchObject({ kind: 'sync_problem', title: '2 changes are waiting to sync', body: 'They’re safe on this device. We’ll keep trying.', silent: true, tag: 'sync-problem' })
    expect(syncNotice(2).actions).toEqual([{ action: 'open', title: 'Open' }])
    expect(syncNotice(1)).toMatchObject({ title: '1 change is waiting to sync', body: 'It’s safe on this device. We’ll keep trying.' })
    expect(syncNotice(2, true)).toMatchObject({ title: '2 changes couldn’t be saved', body: 'Set aside so the rest sync on.' })
    expect(syncNotice(1, true).title).toBe('1 change couldn’t be saved')
  })

  it('switches: paper ready and sync on by default, birthday off until turned on (12i)', () => {
    expect(kindOn('paper_ready', null)).toBe(true)
    expect(kindOn('sync_problem', {})).toBe(true)
    expect(kindOn('birthday', null)).toBe(false)
    expect(kindOn('birthday', { birthday_on: null })).toBe(false)
    expect(kindOn('birthday', { birthday_on: true })).toBe(true)
    expect(kindOn('paper_ready', { paper_ready_on: false })).toBe(false)
    expect(kindOn('sync_problem', { sync_problem_on: false })).toBe(false)
    const bday = birthdayNotice([{ id: 'p1', name: 'Omar', lastSpokeDays: 3 }], {})
    expect(deliver(bday, {}, cairo('08:00'))).toBeNull()
    expect(deliver(bday, { birthday_on: true }, cairo('08:00'))).toMatchObject({ silent: true })
    expect(deliver(paperReadyNotice(lecture, {}), { notify_paused_until: cairo('10:00').toISOString() }, cairo('09:00'))).toBeNull()
  })
})
