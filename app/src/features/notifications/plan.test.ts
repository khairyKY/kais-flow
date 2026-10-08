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
    expect(p.notice.actions.map((a) => a.action)).toEqual(['done', 'tomorrow'])
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

  it('nudge = done that day · open and due by its end; an empty day has none', () => {
    const done = task('x', { status: 'done', completed_at: cairo('10:00').toISOString() })
    const n = localPlan(base({ ...day, tasks: [...top3, done] })).find((p) => p.notice.kind === 'evening_nudge')!
    expect(n.notice.body).toBe('1 done · 1 left')
    expect(kinds(base({ ...day, tasks: [] }))).toEqual([`morning_digest@${cairo('08:00').toISOString()}`])
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
  it('no channel at all; Android permission', () => {
    expect(blockers({ channel: 'web', permission: 'unsupported', subscribed: false }, { quiet_hours_on: false }, now, zone)[0]).toMatch(/^No delivery channel/)
    expect(blockers({ channel: 'android', permission: 'denied', subscribed: false }, { quiet_hours_on: false }, now, zone)[0]).toMatch(/Android Settings/)
    expect(blockers({ channel: 'android', permission: 'prompt', subscribed: false }, { quiet_hours_on: false }, now, zone)).toEqual(['Notifications aren’t allowed yet — the test will ask.'])
  })
})
