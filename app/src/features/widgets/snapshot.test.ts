import { describe, expect, it } from 'vitest'
import { buildFocus, buildSnapshot, mask, type FocusInput, type SnapshotInput } from './snapshot'
import { makeColorResolver } from '../../../../supabase/functions/_shared/colorFollows.ts'
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

  it("draws today's blocks in order, in palette C as the calendar does (event Rose, task Iris, an old colour as its new swatch, the goal flagged)", () => {
    expect(s.blocks.map((b) => [b.id, b.color, b.goal])).toEqual([['b0', 'rose', false], ['b1', 'iris', true], ['b2', 'moss', false], ['b3', 'iris', false]])
    const own = buildSnapshot(input({ events: [event('c1', 'Own', '10:00', '11:00', { color: '#47BFC5' }), event('c2', 'Custom', '12:00', '13:00', { color: '#123456' })] }))
    expect(own.blocks.map((b) => b.color)).toEqual(['lagoon', 'indigo'])
  })

  it("colour follows where it lives: a block with none of its own draws its project's (or area's) swatch; its own wins", () => {
    const colorOf = makeColorResolver([{ id: 'p1', color: '#72BF8E' }], [{ id: 'a1', color: 'var(--acc-hydrangea)' }], [{ id: 'tk', project_id: 'p1', area_id: null }])
    const events = [event('f1', 'Task in a project', '10:00', '11:00', { task_id: 'tk' }), event('f2', 'Filed in an area', '12:00', '13:00', { area_id: 'a1' }), event('f3', 'Own wins', '14:00', '15:00', { color: '#B36670', area_id: 'a1' }), event('f4', 'Nowhere', '16:00', '17:00')]
    expect(buildSnapshot(input({ events, colorOf })).blocks.map((b) => b.color)).toEqual(['fern', 'lagoon', 'wine', 'iris'])
  })

  it("lists Today's tasks apart from the Top 3, overdue and Also open, and counts Also open", () => {
    const x = buildSnapshot(input({ tasks: [goal, skim, read, task('t1', 'Due today', { top3: false }), task('a1', 'Someday soon', { top3: false, due_at: null })] }))
    expect(x.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(x.alsoOpen).toBe(1)
    expect(buildSnapshot(input({ hour24: true })).hour24).toBe(true)
    expect(s.hour24).toBe(false)
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

  it('F7: a multi-day event counts on every day it covers in the week strip', () => {
    // Mon 5 Oct 00:00Z → Thu 8 Oct 00:00Z all-day = Mon, Tue, Wed
    const base = buildSnapshot(input())
    const trip = { ...event('trip', 'Trip', '08:00', '09:00'), all_day: true, starts_at: '2026-10-05T00:00:00.000Z', ends_at: '2026-10-08T00:00:00.000Z' }
    const s = buildSnapshot(input({ events: [...input().events, trip] }))
    const grew = s.week.filter((d, k) => d.n === base.week[k].n + 1).map((d) => d.day)
    expect(grew).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
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
    expect(f).toMatchObject({ state: 'running', mode: 'focus', endsAt: clock + 600_000, breakEndsAt: 0, left: 600, roundMin: 25, taskId: 'g1', title: 'Crypto — heavy session', color: 'iris' })
    expect(f.segments).toEqual([{ kind: 'focus', min: 25, state: 'now' }]) // no block: the one round
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

// Focus D3 on the home screen: the same segments the page draws, as kept / now / todo.
describe('the focus widget', () => {
  const plan = { focusRoundMin: 25, shortBreakMin: 5, longBreakMin: 20, roundsBeforeLongBreak: 4 }
  const block = { title: 'CNN notes', start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T02:10:00.000Z', srcStart: '', srcEnd: '', color: 'var(--blk-rose)', ink: '', rounds: 4, fill: true, fromCalendar: true, eventId: null }
  const clock = 1_000_000
  const run = (over: Partial<FocusInput>) => buildFocus({ mode: 'pomodoro', isRunning: true, secondsLeft: 600, roundMin: 25, taskId: 't', block, kept: 0, plan, pomodoroStartIso: 'x', ...over }, 'CNN notes', clock)
  const states = (f: ReturnType<typeof run>) => f.segments.map((g) => (g.state === 'kept' ? 'K' : g.state === 'now' ? 'N' : 't')).join('')

  it('a running round: the bar is the rounds, the leftover block is not drawn', () => {
    const f = run({ kept: 1 })
    expect(f).toMatchObject({ mode: 'focus', state: 'running', round: 2, rounds: 4, endsAt: clock + 600_000, color: 'rose' })
    expect(f.segments.map((g) => g.kind[0] + g.min).join(' ')).toBe('f25 b5 f25 b5 f25 b5 f25')
    expect(states(f)).toBe('KKNtttt')
  })

  it('a break: the break segment is under way, the next round is still to come', () => {
    const f = run({ mode: 'break', kept: 2, secondsLeft: 200, pomodoroStartIso: null, breakType: 'short' })
    expect(f).toMatchObject({ mode: 'break', state: 'running', endsAt: 0, breakEndsAt: clock + 200_000, round: 2, left: 200 })
    expect(states(f)).toBe('KKKNttt')
  })

  it('a break waiting to start holds at its full length', () => {
    const f = run({ mode: 'break', isRunning: false, kept: 1, secondsLeft: 300, pomodoroStartIso: null })
    expect(f).toMatchObject({ mode: 'break', state: 'paused', breakEndsAt: 0, left: 300 })
    expect(states(f)).toBe('KNttttt')
  })

  it('a held round is paused with the seconds left; idle has no bar', () => {
    expect(run({ isRunning: false })).toMatchObject({ mode: 'focus', state: 'paused', endsAt: 0, left: 600 })
    const idle = run({ isRunning: false, secondsLeft: 25 * 60, pomodoroStartIso: null })
    expect(idle).toMatchObject({ mode: 'idle', state: 'idle', segments: [] })
  })

  it('a long plan shows 16 segments around the one under way', () => {
    const long = { ...block, rounds: 12, end: '2026-01-01T07:00:00.000Z' }
    const early = run({ block: long })
    expect(early.segments).toHaveLength(16)
    expect(early.segments[0].state).toBe('now')
    const late = run({ block: long, kept: 9 })
    expect(late.segments).toHaveLength(16)
    expect(late.segments.filter((g) => g.state === 'now')).toHaveLength(1)
    expect(late.segments.at(-1)?.state).toBe('todo')
  })

  it('a custom colour is its nearest swatch; none is Iris', () => {
    expect(run({ block: { ...block, color: '#E58F99' } }).color).toBe('rose')
    expect(run({ block: null }).color).toBe('iris')
  })

  it('hide titles clears the name and nothing else carries one', () => {
    const m = mask(buildSnapshot(input({ focus: { mode: 'pomodoro', isRunning: true, secondsLeft: 600, roundMin: 25, taskId: 'g1', block, kept: 0, plan } }))).focus
    expect(m.title).toBe('Your focus')
    expect(JSON.stringify(m.segments)).not.toMatch(/[A-Za-z]{6,}/)
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
