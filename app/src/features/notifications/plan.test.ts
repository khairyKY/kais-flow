import { describe, expect, it } from 'vitest'
import { blockers, localPlan, type PlanInput, type PlanTask } from './plan'

// Saturday 3 Oct 2026, Cairo = UTC+3.
const cairo = (hhmm: string, day = 3) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const task = (id: string, over: Partial<PlanTask> = {}): PlanTask => ({ id, title: `Task ${id}`, status: 'todo', due_at: null, reminder_at: null, ...over })
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  tasks: [],
  prefs: { lock_screen_names: true },
  from: cairo('08:00'),
  to: cairo('08:30'),
  now: cairo('08:00'),
  zone: 'Africa/Cairo',
  ...over,
})
const kinds = (input: PlanInput) => localPlan(input).map((p) => `${p.notice.kind}@${p.at.toISOString()}`)

describe('localPlan — reminders', () => {
  const tyre = task('t1', { title: 'Call the tyre supplier', due_at: cairo('08:50').toISOString(), reminder_at: cairo('08:20').toISOString(), project_id: 'p1' })

  it('a reminder in the window, worded at its own moment, with its project', () => {
    const [p] = localPlan(base({ tasks: [tyre], projects: [{ id: 'p1', name: 'Car' }] }))
    expect(p.key).toBe(`t1@${tyre.reminder_at}`)
    expect(p.at.toISOString()).toBe(tyre.reminder_at)
    expect(p.notice.title).toBe('Call the tyre supplier · in 30 min')
    expect(p.notice.body).toBe('08:50 · Car')
    expect(p.notice.actions.map((a) => a.action)).toEqual(['done', 'snooze10', 'snooze60', 'tomorrow'])
  })

  // Snooze (0082): "In 10 min" set remind_again_at — one more reminder then, its own key (Windows shows
  // each key once), the task's reminder_at untouched.
  it('a snoozed reminder comes again at remind_again_at', () => {
    const again = { ...tyre, reminder_at: cairo('07:20').toISOString(), remind_again_at: cairo('08:25').toISOString() }
    const [p, ...rest] = localPlan(base({ tasks: [again], projects: [{ id: 'p1', name: 'Car' }] }))
    expect(rest).toEqual([])
    expect([p.key, p.at.toISOString(), p.notice.title]).toEqual([`t1@${again.remind_again_at}`, again.remind_again_at, 'Call the tyre supplier · in 25 min'])
    expect(localPlan(base({ tasks: [{ ...again, status: 'done' }] }))).toEqual([])
  })

  it('a late sweep words it at the real clock', () => {
    const [p] = localPlan(base({ tasks: [tyre], to: cairo('08:41'), now: cairo('08:41') }))
    expect(p.notice.title).toBe('Call the tyre supplier · in 9 min')
  })

  it('outside the window, done, trashed or without a reminder: nothing', () => {
    const tasks = [
      task('a', { reminder_at: cairo('08:00').toISOString() }), // == from: already covered
      task('b', { reminder_at: cairo('08:31').toISOString() }),
      task('c', { reminder_at: cairo('08:10').toISOString(), status: 'done' }),
      task('d', { reminder_at: cairo('08:10').toISOString(), deleted_at: '2026-10-01T00:00:00Z' }),
      task('e'),
    ]
    expect(localPlan(base({ tasks }))).toEqual([])
  })

  it('same moment → one grouped notice; lock-screen names off hides the titles', () => {
    const at = cairo('08:15').toISOString()
    const plan = localPlan(base({ tasks: [task('a', { reminder_at: at }), task('b', { reminder_at: at })], prefs: {} }))
    expect(plan).toHaveLength(1)
    expect(plan[0].key).toBe(`a@${at},b@${at}`)
    expect(plan[0].notice).toMatchObject({ title: '2 reminders', body: 'Unlock to see them', taskIds: ['a', 'b'] })
  })

  it('kind off or paused at that moment: nothing; quiet hours: silent', () => {
    const late = task('n', { reminder_at: cairo('23:00').toISOString() })
    const night = { from: cairo('22:00'), to: cairo('23:30'), now: cairo('22:00') }
    expect(localPlan(base({ ...night, tasks: [late], prefs: { task_reminder_on: false } }))).toEqual([])
    expect(localPlan(base({ ...night, tasks: [late], prefs: { notify_paused_until: cairo('23:30').toISOString() } }))).toEqual([])
    // a pause that ends before the reminder doesn't stop it
    expect(localPlan(base({ ...night, tasks: [late], prefs: { notify_paused_until: cairo('22:30').toISOString() } }))[0].notice.silent).toBe(true)
    expect(localPlan(base({ ...night, tasks: [late], prefs: { quiet_hours_on: false } }))[0].notice.silent).toBe(false)
  })
})

describe('localPlan — rituals', () => {
  const day = { from: cairo('00:00'), to: cairo('00:00', 4), now: cairo('00:00') }
  const top3 = [
    task('g', { title: 'GCI homework', top3: true, created_at: '2026-10-01T00:00:00Z' }),
    task('s', { title: 'Survey', top3: true, created_at: '2026-10-02T00:00:00Z', due_at: cairo('12:00').toISOString() }),
  ]

  it('the digest at 08:00 and the nudge at 21:00 Cairo by default', () => {
    expect(kinds(base({ ...day, tasks: top3 }))).toEqual([`morning_digest@${cairo('08:00').toISOString()}`, `evening_nudge@${cairo('21:00').toISOString()}`])
  })

  it('digest = the open Top 3, oldest first; silent', () => {
    const d = localPlan(base({ ...day, tasks: top3 }))[0].notice
    expect(d).toMatchObject({ title: 'Good morning — 2 to tend today', body: '✶ GCI homework, then Survey.', silent: true })
  })

  it("digest = that morning's Top 3 by the rule (goal first, moved picks out) + the overdue count", () => {
    const tasks = [
      ...top3,
      task('m', { title: 'Moved to Thursday', top3: true, top3_rank: 1, due_at: cairo('09:00', 8).toISOString() }),
      task('p', { title: 'Parked', top3: true, someday: true }),
      task('goal', { title: 'The goal', top3: true, top3_rank: 1, created_at: '2026-10-02T12:00:00Z' }),
      task('late', { title: 'Late', due_at: cairo('09:00', 1).toISOString() }),
      task('late-someday', { due_at: cairo('09:00', 1).toISOString(), someday: true }),
    ]
    const d = localPlan(base({ ...day, tasks }))[0].notice
    expect(d).toMatchObject({ kind: 'morning_digest', title: 'Good morning — 3 to tend today', body: '✶ The goal, then GCI homework and Survey. 1 overdue.' })
  })

  it('nudge = done that day · open and due by its end; an empty day has none', () => {
    const done = task('x', { status: 'done', completed_at: cairo('10:00').toISOString() })
    const parked = task('s', { due_at: cairo('09:00').toISOString(), someday: true })
    const n = localPlan(base({ ...day, tasks: [...top3, done, parked] })).find((p) => p.notice.kind === 'evening_nudge')!
    expect(n.notice.body).toBe('1 done · 1 left') // someday isn't "left"
    expect(kinds(base({ ...day, tasks: [] }))).toEqual([`morning_digest@${cairo('08:00').toISOString()}`])
  })

  it('no nudge once Shut down is done on that loop day; the next evening still has one (A29)', () => {
    // the rows the evening ritual writes (rituals/loopDay.ts finishedPayload); a morning one never counts
    const plan = (days: string[], over: Partial<PlanInput> = {}) =>
      localPlan(base({ ...day, to: cairo('00:00', 5), tasks: top3, finished: [{ payload: { ritual: 'morning', date: '2026-10-04' } }, ...days.map((date) => ({ payload: { ritual: 'evening', date, steps: [] } }))], ...over })).filter((p) => p.notice.kind === 'evening_nudge').map((p) => p.at.toISOString())
    expect(plan([])).toEqual([cairo('21:00').toISOString(), cairo('21:00', 4).toISOString()])
    expect(plan(['2026-10-03'])).toEqual([cairo('21:00', 4).toISOString()])
    expect(plan(['2026-10-02'])).toHaveLength(2) // yesterday's Shut down is yesterday's
    // A nudge set for 00:30 belongs to the loop day before it (04:00 rollover): Saturday's Shut down quiets it.
    const late = { prefs: { lock_screen_names: true, morning_digest_on: false, evening_nudge_at: '00:30' } }
    expect(plan([], late)).toEqual([cairo('00:30').toISOString(), cairo('00:30', 4).toISOString()])
    expect(plan(['2026-10-03'], late)).toEqual([cairo('00:30').toISOString()]) // Sat 00:30 is Friday's loop day: still nudged
    expect(plan(['2026-10-02', '2026-10-03'], late)).toEqual([])
  })

  it('own times, own zone, off switches; several days ahead', () => {
    const prefs = { morning_digest_at: '07:30:00', evening_nudge_on: false, timezone: 'Asia/Kolkata' }
    const plan = localPlan(base({ ...day, to: cairo('00:00', 6), prefs, zone: 'Asia/Kolkata' }))
    // 07:30 Kolkata = 05:00 Cairo (UTC+5:30 vs +3), on the 3rd, 4th and 5th
    expect(plan.map((p) => p.at.toISOString())).toEqual(['2026-10-03T02:00:00.000Z', '2026-10-04T02:00:00.000Z', '2026-10-05T02:00:00.000Z'])
  })

  it('a time already past this morning is not repeated', () => {
    expect(kinds(base({ from: cairo('09:00'), to: cairo('09:30'), now: cairo('09:00'), tasks: top3 }))).toEqual([])
  })
})

describe('localPlan — routine reminders', () => {
  const day = { from: cairo('00:00'), to: cairo('00:00', 4), now: cairo('00:00'), prefs: { lock_screen_names: true, morning_digest_on: false, evening_nudge_on: false } }
  const stretch = { id: 'r1', name: 'Stretch', clock_time: '07:30:00', cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, active: true }
  const routines = (input: Partial<PlanInput>) => localPlan(base({ ...day, ...input })).filter((p) => p.notice.kind === 'routine')

  it('at its time on the user’s clock, on its days, worded like notify', () => {
    const [p] = routines({ routines: [stretch] })
    expect(p.at.toISOString()).toBe(cairo('07:30').toISOString())
    expect(p.key).toBe(`routine:r1@${cairo('07:30').toISOString()}`)
    expect(p.notice).toMatchObject({ title: 'Stretch — 07:30', url: '/routines' })
    expect(routines({ routines: [{ ...stretch, cadence: { weekdays: [1, 2, 3, 4, 5] } }] })).toEqual([]) // the 3rd is a Saturday
    expect(routines({ routines: [{ ...stretch, active: false }] })).toEqual([])
    expect(routines({ routines: [{ ...stretch, clock_time: null }] })).toEqual([])
  })

  it('not once checked off that day; each day of a longer plan on its own', () => {
    expect(routines({ routines: [stretch], completions: [{ routine_id: 'r1', completed_on: '2026-10-03' }] })).toEqual([])
    const ahead = routines({ routines: [stretch], completions: [{ routine_id: 'r1', completed_on: '2026-10-03' }], to: cairo('00:00', 6) })
    expect(ahead.map((p) => p.at.toISOString())).toEqual([cairo('07:30', 4).toISOString(), cairo('07:30', 5).toISOString()])
  })

  it('same moment → one notice; its switch, pause and quiet hours apply', () => {
    const both = routines({ routines: [stretch, { ...stretch, id: 'r2', name: 'Journal' }] })
    expect(both).toHaveLength(1)
    expect(both[0].notice).toMatchObject({ title: '2 routines — 07:30', body: 'Stretch · Journal' })
    expect(routines({ routines: [stretch], prefs: { ...day.prefs, routine_on: false } })).toEqual([])
    expect(routines({ routines: [{ ...stretch, clock_time: '06:30' }] })[0].notice.silent).toBe(true) // before 07:00
  })
})

describe('localPlan — birthdays (12k/12j)', () => {
  // Saturday 3 Oct 2026: Omar's birthday. 08:00 on the user's clock.
  const omar = { id: 'omar', name: 'Omar', facts: [{ label: 'Birthday', value: 'October 3' }] }
  const salma = { id: 'salma', name: 'Salma', facts: [{ label: 'Birthday', value: '', date: '10-04' }] }
  const on = { lock_screen_names: true, birthday_on: true }
  const day = { from: cairo('00:00'), to: cairo('23:59'), now: cairo('00:00') }
  const birthdays = (input: Partial<PlanInput>) => localPlan(base({ ...day, prefs: on, ...input })).filter((p) => p.notice.kind === 'birthday')

  it('at 08:00 on the user’s clock, worded like notify, with when you last spoke', () => {
    const [p] = birthdays({ people: [omar, salma], interactions: [{ person_id: 'omar', occurred_at: cairo('12:00', 1).toISOString() }] })
    expect(p.at.toISOString()).toBe(cairo('08:00').toISOString())
    expect(p.key).toBe(`birthday:omar@${cairo('08:00').toISOString()}`)
    expect(p.notice).toMatchObject({ title: 'Omar’s birthday is today', body: 'Last spoke 2 days ago.', url: '/people/omar', silent: true })
    expect(p.notice.actions).toEqual([{ action: 'open', title: 'Open Omar' }])
  })

  it('off until turned on (12i); each day of a longer plan on its own', () => {
    expect(birthdays({ people: [omar], prefs: { lock_screen_names: true } })).toEqual([])
    const ahead = birthdays({ people: [omar, salma], to: cairo('00:00', 6) })
    expect(ahead.map((p) => [p.notice.title, p.at.toISOString()])).toEqual([
      ['Omar’s birthday is today', cairo('08:00').toISOString()],
      ['Salma’s birthday is today', cairo('08:00', 4).toISOString()],
    ])
  })

  it('"today" is the user’s day: Tokyo’s 08:00 on the 3rd is 23:00 UTC on the 2nd', () => {
    const tokyo8 = new Date(Date.UTC(2026, 9, 2, 23, 0))
    const [p] = birthdays({ people: [omar], zone: 'Asia/Tokyo', from: new Date(Date.UTC(2026, 9, 2, 12)), to: new Date(Date.UTC(2026, 9, 3, 12)), now: new Date(Date.UTC(2026, 9, 2, 12)) })
    expect(p.at.toISOString()).toBe(tokyo8.toISOString())
    const la = birthdays({ people: [omar], zone: 'America/Los_Angeles', from: new Date(Date.UTC(2026, 9, 2, 12)), to: new Date(Date.UTC(2026, 9, 3, 12)), now: new Date(Date.UTC(2026, 9, 2, 12)) })
    expect(la).toEqual([]) // LA's 08:00 on the 3rd is 15:00 UTC — after this window
  })

  it('a week ahead too (P7 7b), at the same 08:00, with its own key — notify’s groups', () => {
    const nour = { id: 'nour', name: 'Nour', facts: [{ label: 'Birthday', value: 'October 10' }] }
    const ps = birthdays({ people: [omar, nour], interactions: [{ person_id: 'nour', occurred_at: cairo('12:00', 1).toISOString() }] })
    expect(ps.map((p) => [p.key, p.notice.title, p.notice.body])).toEqual([
      [`birthday:omar@${cairo('08:00').toISOString()}`, 'Omar’s birthday is today', ''],
      [`birthday-soon:nour@${cairo('08:00').toISOString()}`, 'Nour’s birthday is in a week', 'Last spoke 2 days ago.'],
    ])
    expect(birthdays({ people: [nour], prefs: { lock_screen_names: true } })).toEqual([]) // the same Birthday switch
  })

  it('private: "A birthday", no name anywhere', () => {
    const [p] = birthdays({ people: [omar], prefs: { birthday_on: true } })
    expect(p.notice).toMatchObject({ title: 'A birthday', body: 'Unlock to see it' })
    expect(JSON.stringify(p.notice)).not.toContain('Omar')
  })
})

describe('blockers (the test button)', () => {
  const now = cairo('23:00')
  const zone = 'Africa/Cairo'
  it('nothing in the way', () => {
    expect(blockers({ channel: 'windows', permission: 'granted', subscribed: false }, { quiet_hours_on: false }, now, zone)).toEqual([])
  })
  it('each thing that silences or stops a notice, in plain words', () => {
    const lines = blockers({ channel: 'web', permission: 'denied', subscribed: false }, { notify_paused_until: cairo('23:41').toISOString(), task_reminder_on: false, focus_done_on: false }, now, zone)
    expect(lines).toEqual([
      'Permission denied — allow notifications for this site in the browser’s site settings.',
      'This device isn’t subscribed — tap “Subscribe this device” first.',
      'Notifications are paused until 23:41.',
      'Quiet hours are on — notifications come without a sound.',
      'Turned off: Task reminder, Focus done.',
    ])
  })
  it('Birthday starting off (12i) isn’t in the way; a kind that starts on and was turned off is', () => {
    expect(blockers({ channel: 'windows', permission: 'granted', subscribed: false }, { quiet_hours_on: false, birthday_on: false, sync_problem_on: false }, now, zone)).toEqual(['Turned off: Sync problem.'])
  })
  it('no channel at all; Android permission', () => {
    expect(blockers({ channel: 'web', permission: 'unsupported', subscribed: false }, { quiet_hours_on: false }, now, zone)[0]).toMatch(/^No delivery channel/)
    expect(blockers({ channel: 'android', permission: 'denied', subscribed: false }, { quiet_hours_on: false }, now, zone)[0]).toMatch(/Android Settings/)
    expect(blockers({ channel: 'android', permission: 'prompt', subscribed: false }, { quiet_hours_on: false }, now, zone)).toEqual(['Notifications aren’t allowed yet — the test will ask.'])
  })
})
