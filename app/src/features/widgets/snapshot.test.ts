import { describe, expect, it } from 'vitest'
import { buildSnapshot, mask, type SnapshotInput } from './snapshot'
import { applyOps, parseQueue, type OpWrites } from './queue'
import type { CalendarEvent, Routine, RoutineCompletion, Task } from '../../lib/types'

// Kai's sample day (render_widgets.mjs): Wednesday 7 Oct 2026, 14:52 in Cairo (UTC+3, EEST).
const at = (hhmm: string, day = 7) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm: string, day = 7) => at(hhmm, day).toISOString()
const NOW = at('14:52')

function task(id: string, title: string, over: Partial<Task> = {}): Task {
  return {
    id, title, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: iso('09:00'), scheduled_start: null, scheduled_end: null,
    top3: true, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null,
    reminder_sent: false, completed_at: null, created_at: iso('08:00', 1), updated_at: iso('08:00', 1), ...over,
  }
}
function event(id: string, title: string, from: string, to: string, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'time_block',
    color: null, created_at: iso('08:00', 1), updated_at: iso('08:00', 1), ...over,
  }
}

const goal = task('g1', 'Crypto — heavy session')
const skim = task('p1', 'Skim OS lectures 1 + 2')
const read = task('p2', 'Read 2 pages', { status: 'done', completed_at: iso('12:00') })
const gym: Routine = { id: 'r1', name: 'Gym', time_of_day: null, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, goal_days: 30, created_at: iso('08:00', 1), updated_at: iso('08:00', 1) }
const done = (day: number): RoutineCompletion => ({ id: `c${day}`, routine_id: 'r1', completed_on: `2026-10-0${day}`, created_at: iso('08:00', day) })

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    now: NOW,
    zone: 'Africa/Cairo',
    online: true,
    hideTitles: false,
    tasks: [goal, skim, read, task('o1', 'Call the tyre supplier', { top3: false, due_at: iso('09:00', 1) })],
    events: [
      event('b0', 'OS lecture', '10:00', '11:00', { type: 'event' }),
      event('b1', goal.title, '14:45', '16:15', { task_id: 'g1' }),
      event('b2', skim.title, '16:15', '16:55', { task_id: 'p1', color: '#8A9A7E' }),
      event('b3', 'Gym', '18:00', '19:00'),
    ],
    projects: [],
    domains: [],
    top3: [goal, skim, read],
    dayN: 83,
    phase: 'now',
    focus: { mode: 'pomodoro', isRunning: false, secondsLeft: 25 * 60, roundMin: 25, taskId: null },
    routines: [gym],
    completions: [done(5), done(6), done(7)],
    inbox: 3,
    slipping: [],
    journalLine: null,
    resurface: null,
    specimen: null,
    weather: { tempC: 31, condition: 'clear' },
    ...over,
  }
}

describe('buildSnapshot', () => {
  const s = buildSnapshot(input())

  it('puts the goal first with its block time, then the picks, done ones marked', () => {
    expect(s.goal).toEqual({ id: 'g1', title: 'Crypto — heavy session', start: at('14:45').getTime(), end: at('16:15').getTime(), done: false })
    expect(s.picks.map((p) => [p.id, p.done])).toEqual([['p1', false], ['p2', true]])
  })

  it("draws today's blocks in order, in their calendar colours (goal gold, meeting blossom, own hue)", () => {
    expect(s.blocks.map((b) => [b.id, b.color])).toEqual([['b0', 'blossom'], ['b1', 'goal'], ['b2', '#8A9A7E'], ['b3', 'lavender']])
  })

  it('writes the day on the user clock, the zone, and the week Monday first', () => {
    expect(s.day).toBe('2026-10-07')
    expect(s.zone).toBe('Africa/Cairo')
    expect(s.week[0].day).toBe('2026-10-05')
    expect(s.week.find((d) => d.day === '2026-10-07')?.n).toBe(4)
  })

  it('counts overdue tasks, oldest first', () => {
    expect(s.overdue).toEqual({ count: 1, oldestDays: 6, titles: ['Call the tyre supplier'] })
  })

  it('gives routines their week and the longest streak', () => {
    expect(s.routines).toHaveLength(1)
    expect(s.routines[0]).toMatchObject({ id: 'r1', done: true })
    expect(s.routines[0].week.slice(-3)).toEqual([2, 2, 2])
    expect(s.streak).toEqual({ id: 'r1', title: 'Gym', days: 3, goal: 30 })
  })

  it('reads the focus timer: a running round ends secondsLeft from the real clock', () => {
    const clock = NOW.getTime() + 30_000
    const f = buildSnapshot(input({ clock, focus: { mode: 'pomodoro', isRunning: true, secondsLeft: 600, roundMin: 25, taskId: 'g1' } })).focus
    expect(f).toEqual({ state: 'running', endsAt: clock + 600_000, left: 600, roundMin: 25, taskId: 'g1', title: 'Crypto — heavy session' })
    expect(buildSnapshot(input({ focus: { mode: 'pomodoro', isRunning: false, secondsLeft: 600, roundMin: 25, taskId: null } })).focus.state).toBe('paused')
    expect(s.focus.state).toBe('idle')
  })

  it('writes the season and the weather', () => {
    expect(s.season).toEqual({ name: 'Autumn', weather: '31° clear', art: 'daisy_midday' })
  })

  it('says offline when the app is', () => {
    expect(buildSnapshot(input({ online: false })).offline).toBe(true)
  })
})

describe('Hide titles on the home screen', () => {
  it('swaps every name for what it is', () => {
    const s = buildSnapshot(input({ hideTitles: true, journalLine: 'a private line' }))
    expect(s.goal?.title).toBe('Your goal')
    expect(s.picks.map((p) => p.title)).toEqual(['Pick 2', 'Pick 3'])
    expect(s.blocks.map((b) => b.title)).toEqual(['Busy', 'Your goal', 'A task', 'Busy'])
    expect(s.overdue.titles).toEqual([])
    expect(s.routines[0].title).toBe('A routine')
    expect(s.journal.line).toBeNull()
    expect(JSON.stringify(s)).not.toMatch(/Crypto|tyre|Skim|private/)
  })
  it('mask keeps times, ids and done states', () => {
    const s = buildSnapshot(input())
    expect(mask(s).goal).toEqual({ ...s.goal, title: 'Your goal' })
  })
})

describe('home-screen ticks', () => {
  it('parses the shell queue, dropping junk', () => {
    expect(parseQueue('[{"t":"task","id":"a","at":1},null,3,{"x":1}]')).toEqual([{ t: 'task', id: 'a', at: 1 }])
    expect(parseQueue('not json')).toEqual([])
    expect(parseQueue(undefined)).toEqual([])
  })
  it('applies them in order through the app writes', () => {
    const log: string[] = []
    const w: OpWrites = {
      completeTasks: (ids) => log.push(`done ${ids}`),
      checkRoutine: (id, when) => log.push(`routine ${id} ${when.getTime()}`),
      stopFocus: () => log.push('stop'),
    }
    applyOps(parseQueue('[{"t":"task","id":"g1","at":1},{"t":"routine","id":"r1","at":5},{"t":"focus-done","id":"p1","at":6},{"t":"focus-stop","id":"round","at":7}]'), w)
    expect(log).toEqual(['done g1', 'routine r1 5', 'stop', 'done p1', 'stop'])
  })
})
