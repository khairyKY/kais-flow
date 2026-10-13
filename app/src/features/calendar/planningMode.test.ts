import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'
import { blockedOn, dueWord, footerLine, freeGaps, freeLeft, groupPlan, minutesLabel, planningTasks, sortPlan, totalLine } from './planningMode'

// Calendar §4 planning mode. The user's zone is the default Africa/Cairo (UTC+3 until the last
// Thursday of October 2026): every instant below is a Cairo wall time, so it holds under the 4 device
// zones the suite runs in.
const cairo = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 3, m)).toISOString()
}
const DAY = '2026-07-10'
const NOW = new Date(cairo(DAY, '10:00')) // Fri 10 Jul, 10:00 Cairo
const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: id, status: 'todo', someday: false, top3: false, due_at: null, scheduled_start: null, scheduled_end: null, duration_min: 30, priority: null, project_id: null, ...over }) as Task
const block = (id: string, taskId: string | null, day: string, from: string, to: string, over: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, task_id: taskId, title: id, starts_at: cairo(day, from), ends_at: cairo(day, to), all_day: false, type: taskId ? 'task' : 'event', busy: true, ...over }) as CalendarEvent
const ids = (rows: { task: Task }[]) => rows.map((r) => r.task.id)

const TASKS = [
  task('emails', { project_id: 'shaheen', due_at: cairo('2026-07-11', '09:00') }),
  task('kit', { project_id: 'shaheen', duration_min: 45 }),
  task('photographer', { project_id: 'shaheen', duration_min: 15 }),
  task('forecast', { project_id: 'forecasting', priority: 1 }),
  task('github', { due_at: cairo('2026-07-07', '09:00'), duration_min: 45 }), // overdue 3d
  task('today', { due_at: cairo(DAY, '09:00') }),
  task('planned', { due_at: cairo(DAY, '09:00') }), // on the calendar later today
  task('someday', { someday: true }),
  task('done', { status: 'done' }),
]
const EVENTS = [block('b-planned', 'planned', DAY, '15:00', '16:00'), block('deep', null, DAY, '09:00', '11:00'), block('sync', null, DAY, '13:00', '13:45')]

describe('planningTasks — All · Today · Overdue', () => {
  it('All: every open unscheduled task (overdue first, then today, then the rest); planned, someday and done stay out', () => {
    expect(ids(planningTasks(TASKS, EVENTS, NOW, 'all'))).toEqual(['github', 'today', 'emails', 'kit', 'photographer', 'forecast'])
  })
  it('Today and Overdue are the rail’s own lists', () => {
    expect(ids(planningTasks(TASKS, EVENTS, NOW, 'today'))).toEqual(['today'])
    const overdue = planningTasks(TASKS, EVENTS, NOW, 'overdue')
    expect(ids(overdue)).toEqual(['github'])
    expect(overdue[0].late).toBe(3)
  })
  it('All is exactly: open (not done, not cancelled, not trashed), not Someday, no block today or later — each once', () => {
    const rows = planningTasks(
      [
        task('open'),
        task('missed'),
        task('later-today'),
        task('tomorrow'),
        task('done', { status: 'done' }),
        task('cancelled', { status: 'cancelled' }),
        task('trashed', { deleted_at: cairo(DAY, '08:00') }),
        task('someday', { someday: true }),
        task('due-today', { due_at: cairo(DAY, '09:00') }),
      ],
      [
        block('b1', 'missed', '2026-07-08', '10:00', '11:00'),
        block('b2', 'later-today', DAY, '17:00', '18:00'),
        block('b3', 'tomorrow', '2026-07-11', '10:00', '11:00'),
        block('b4', 'done', '2026-07-11', '10:00', '11:00', { deleted_at: cairo(DAY, '08:00') }),
      ],
      NOW,
      'all',
    )
    expect(ids(rows)).toEqual(['missed', 'due-today', 'open'])
  })
  it('a task whose only block was missed yesterday is unscheduled again (overdue)', () => {
    const rows = planningTasks([task('crypto')], [block('b', 'crypto', '2026-07-09', '15:00', '16:30')], NOW, 'all')
    expect(rows.map((r) => [r.task.id, r.late, r.block?.id])).toEqual([['crypto', 1, 'b']])
  })
})

describe('Sort ↕', () => {
  const rows = planningTasks(TASKS, EVENTS, NOW, 'all')
  it('Due date: most overdue, then by due date, none last (then A–Z)', () => {
    expect(ids(sortPlan(rows, 'due'))).toEqual(['github', 'today', 'emails', 'forecast', 'kit', 'photographer'])
  })
  it('Priority: !!! first', () => {
    expect(ids(sortPlan(rows, 'priority'))[0]).toBe('forecast')
  })
  it('Shortest first', () => {
    expect(ids(sortPlan(rows, 'length')).slice(0, 1)).toEqual(['photographer'])
    expect(ids(sortPlan(rows, 'length')).slice(-2).sort()).toEqual(['github', 'kit'])
  })
  it('A–Z', () => {
    expect(ids(sortPlan(rows, 'title'))).toEqual(['emails', 'forecast', 'github', 'kit', 'photographer', 'today'])
  })
})

describe('4a groups and totals', () => {
  const rows = sortPlan(planningTasks(TASKS, EVENTS, NOW, 'all'), 'due')
  const groups = groupPlan(rows, (t) => t.project_id)

  it('one group per project in the order its first task comes; No project last', () => {
    expect(groups.map((g) => [g.key, ids(g.rows)])).toEqual([
      ['shaheen', ['emails', 'kit', 'photographer']],
      ['forecasting', ['forecast']],
      ['none', ['github', 'today']],
    ])
  })
  it('each with its total length: "Shaheen · 3 tasks · 1h 30m"', () => {
    expect(groups.map((g) => minutesLabel(g.minutes))).toEqual(['1h 30m', '30m', '1h 15m'])
  })
  it('the footer: "6 tasks · 3h 15m total"', () => {
    expect(totalLine(rows)).toBe('6 tasks · 3h 15m total')
    expect(totalLine(rows.slice(0, 1))).toBe('1 task · 45m total')
  })
  it('minutesLabel', () => {
    expect([30, 60, 90, 390, 0].map(minutesLabel)).toEqual(['30m', '1h', '1h 30m', '6h 30m', '0m'])
  })
})

describe('the strip: free gaps and the footer line', () => {
  it('gaps of an hour or more inside 08:00–20:00, from now on today: "2h free" (conductor 2026-10-13: 60, not 90)', () => {
    expect(freeGaps(EVENTS, DAY, NOW).map((g) => [g.label, g.start, g.end])).toEqual([
      ['2h free', cairo(DAY, '11:00'), cairo(DAY, '13:00')],
      // 13:45–15:00 is 75 minutes: a one-hour task fits, so it shows
      ['1h 15m free', cairo(DAY, '13:45'), cairo(DAY, '15:00')],
      ['4h free', cairo(DAY, '16:00'), cairo(DAY, '20:00')],
    ])
  })
  it('exactly an hour shows; 45 minutes does not', () => {
    // from 10:00: 12:00–13:00 is an hour, 19:15–20:00 is 45 minutes
    const day = [block('a', null, DAY, '10:00', '12:00'), block('b', null, DAY, '13:00', '19:15')]
    expect(freeGaps(day, DAY, NOW).map((g) => g.label)).toEqual(['1h free'])
  })
  it('the part of a gap behind the clock is not free', () => {
    expect(freeGaps(EVENTS, DAY, new Date(cairo(DAY, '11:30')))[0]).toMatchObject({ label: '1h 30m free', start: cairo(DAY, '11:30') })
    // at 12:15 only 45 minutes are left before 13:00: not marked
    expect(freeGaps(EVENTS, DAY, new Date(cairo(DAY, '12:15'))).map((g) => g.label)).toEqual(['1h 15m free', '4h free'])
  })
  it('another day is free from 08:00; a past day has none', () => {
    expect(freeGaps([], '2026-07-11', NOW).map((g) => g.label)).toEqual(['12h free'])
    expect(freeGaps([], '2026-07-09', NOW)).toEqual([])
  })
  it('"4 blocked today · 6h free" for one day, "… · 1 blocked tomorrow" for two', () => {
    expect(blockedOn(EVENTS, DAY)).toBe(3)
    // free from 10:00: 11–13, 13:45–15, 16–20 = 2h + 1h15 + 4h = 7h15 → 7h 30m (half hours)
    expect(footerLine(EVENTS, [DAY], NOW)).toBe('3 blocked today · 7h 30m free')
    expect(footerLine([...EVENTS, block('table', null, '2026-07-11', '18:00', '19:00')], [DAY, '2026-07-11'], NOW)).toBe('3 blocked today · 1 blocked tomorrow')
    expect(footerLine([], ['2026-07-12', '2026-07-13'], NOW)).toBe('0 blocked Sun · 0 blocked Mon')
  })
  it('the rail footer (p7e A15): a Free event neither blocks nor takes free time; past and off-hours time is not free', () => {
    const free = block('lunch', null, DAY, '13:00', '14:00', { busy: false })
    expect(blockedOn([...EVENTS, free], DAY)).toBe(3)
    expect(freeLeft([...EVENTS, free], DAY, NOW)).toBe(freeLeft(EVENTS, DAY, NOW))
    // 21:00 is past the day's 20:00 end: nothing left
    expect(freeLeft([], DAY, new Date(cairo(DAY, '21:00')))).toBe(0)
  })
})

describe('a card’s due word', () => {
  it('today · tomorrow (tmrw on a 4b line) · a weekday this coming week · a date', () => {
    expect(dueWord(cairo(DAY, '18:00'), NOW)).toBe('Due today')
    expect(dueWord(cairo('2026-07-11', '00:30'), NOW)).toBe('Due tomorrow')
    expect(dueWord(cairo('2026-07-11', '00:30'), NOW, true)).toBe('Due tmrw')
    expect(dueWord(cairo('2026-07-13', '09:00'), NOW)).toBe('Due Mon')
    expect(dueWord(cairo('2026-07-18', '09:00'), NOW)).toBe('Due Jul 18')
  })
})
