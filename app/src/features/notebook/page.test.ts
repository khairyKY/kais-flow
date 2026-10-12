import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, PRESETS, buildPage, dayNumber, dayTasks, headerDate, moveBlock, pageTaskIds, pageText, parseLayout, presetOf, type NotebookLayout, type PageData } from './page'
import type { CalendarEvent, Routine, RoutineCompletion, Task } from '../../lib/types'

// The page's day: Saturday 10 Oct 2026, Cairo (UTC+3). Every function takes the zone, so the suite
// gives the same answers under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo.
const DAY = '2026-10-10'
const ZONE = 'Africa/Cairo'
const cairo = (hhmm: string, day = 10) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m)).toISOString()
}

let n = 0
const task = (title: string, over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, project_id: null, domain_id: null, area_id: null, title, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, created_at: cairo('08:00', 1), updated_at: cairo('08:00', 1), ...over,
})
const routine = (name: string, weekdays: number[]): Routine => ({
  id: `r-${name}`, name, time_of_day: null, clock_time: null, cadence: { weekdays }, challenge_start: null, challenge_end: null, active: true,
  created_at: cairo('08:00', 1), updated_at: cairo('08:00', 1),
})
const event = (title: string, from: string, to: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `e-${title}`, title, starts_at: cairo(from), ends_at: cairo(to), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null,
  busy: true, type: 'event', color: null, created_at: cairo('08:00', 1), updated_at: cairo('08:00', 1), ...over,
})

const goal = task('GCI homework 1 — NumPy', { top3: true, top3_rank: 1 })
const survey = task('Do GCI lecture 2’s survey', { top3: true, top3_rank: 2 })
const omar = task('Reply to Omar', { due_at: cairo('10:00') })
const milk = task('Buy milk', { scheduled_start: cairo('15:00'), scheduled_end: cairo('15:30') })
const TASKS = [
  goal,
  survey,
  milk,
  omar,
  task('Tomorrow’s thing', { due_at: cairo('10:00', 11) }),
  task('Overdue thing', { due_at: cairo('10:00', 8) }),
  task('Parked', { due_at: cairo('10:00'), someday: true }),
  task('Already done', { due_at: cairo('09:00'), status: 'done', completed_at: cairo('09:30') }),
]
// Kai's habits row: Qur'an · rep (Mon–Wed + Sat) · move · read. A Sunday-only routine rests on a Saturday.
const ROUTINES = [routine('Qur’an', [0, 1, 2, 3, 4, 5, 6]), routine('rep', [1, 2, 3, 6]), routine('move', [0, 1, 2, 3, 4, 5, 6]), routine('read', [0, 1, 2, 3, 4, 5, 6]), routine('Long walk', [0])]
const EVENTS = [event('Gym', '18:00', '19:00'), event('Judge test', '09:00', '10:30'), event('Old', '09:00', '10:00', { deleted_at: cairo('08:00') })]

const data = (over: Partial<PageData> = {}): PageData => ({ day: DAY, zone: ZONE, top3: [goal, survey], tasks: TASKS, events: EVENTS, routines: ROUTINES, completions: [], ...over })

describe("notebook page: Kai's page", () => {
  it('is exactly his paper format — date, TASKS, HABITS, NOTES, the four night lines', () => {
    expect(pageText(buildPage(PRESETS.kai.layout, data()))).toBe(
      [
        'SAT · 10 OCT   woke __ · slept __',
        '',
        'TASKS',
        '☐ ✶ GCI homework 1 — NumPy',
        '☐ Do GCI lecture 2’s survey',
        '☐ Reply to Omar',
        '☐ Buy milk',
        '',
        'HABITS',
        '☐ Qur’an   ☐ rep   ☐ move   ☐ read',
        '',
        'NOTES',
        '',
        '+  what happened',
        '−  what got in the way',
        '→  tomorrow’s three',
        '♡  one true line',
      ].join('\n'),
    )
  })

  it('is the default, and nothing on any preset is prayer — habits are only the user’s routines', () => {
    expect(DEFAULT_LAYOUT).toEqual(PRESETS.kai.layout)
    expect(JSON.stringify(PRESETS)).not.toMatch(/pray|salah|salat/i)
    for (const p of Object.values(PRESETS)) {
      const text = pageText(buildPage(p.layout, data({ routines: [] })))
      expect(text).not.toMatch(/pray|salah|salat|HABITS/i)
    }
  })

  it('draws the NOTES block as ruled lines on paper, and ticks a habit already done', () => {
    const blocks = buildPage(PRESETS.kai.layout, data({ completions: [{ id: 'c', routine_id: 'r-read', completed_on: DAY, created_at: cairo('07:00') } as RoutineCompletion] }))
    expect(blocks.find((b) => b.id === 'notes')!.lines).toHaveLength(6)
    expect(pageText(blocks)).toContain('☐ Qur’an   ☐ rep   ☐ move   ☑ read')
  })
})

describe('notebook page: the blocks', () => {
  const withTop3: NotebookLayout = { ...PRESETS.kai.layout, blocks: PRESETS.kai.layout.blocks.map((b) => ({ ...b, on: b.id !== 'night' })) }

  it('Top 3 in order, the goal marked, then the day’s plan with aligned times on the user’s clock', () => {
    const top3 = buildPage(withTop3, data()).find((b) => b.id === 'top3')!
    expect(pageText([top3])).toBe(['TOP 3', '☐ ✶ GCI homework 1 — NumPy', '☐ Do GCI lecture 2’s survey', 'PLAN', '09:00–10:30  Judge test', '18:00–19:00  Gym'].join('\n'))
  })

  it('a pick listed in the Top 3 block is not listed again under Tasks', () => {
    const tasks = buildPage(withTop3, data()).find((b) => b.id === 'tasks')!
    expect(pageText([tasks])).toBe(['TASKS', '☐ Reply to Omar', '☐ Buy milk'].join('\n'))
  })

  it('a finished pick stays, ticked', () => {
    const done = { ...goal, top3: false, status: 'done' as const, completed_at: cairo('09:00') }
    expect(pageText(buildPage(PRESETS.kai.layout, data({ top3: [done, survey] })))).toContain('☑ ✶ GCI homework 1 — NumPy')
  })

  it('caps a long list: "+ N more in the app"', () => {
    const many = Array.from({ length: 14 }, (_, i) => task(`Task ${i + 1}`, { due_at: cairo(`${String(8 + (i % 10)).padStart(2, '0')}:00`) }))
    const layout = { ...PRESETS.kai.layout, tasks: { cap: 5 } }
    const block = buildPage(layout, data({ top3: [], tasks: many })).find((b) => b.id === 'tasks')!
    expect(block.lines.filter((l) => l.kind === 'item')).toHaveLength(5)
    expect(block.lines.at(-1)).toEqual({ kind: 'more', text: '+ 9 more in the app' })
  })

  it('an empty day is a calm page with blanks to fill in', () => {
    const blocks = buildPage({ ...withTop3 }, data({ top3: [], tasks: [], events: [], routines: [] }))
    expect(blocks.map((b) => b.id)).toEqual(['header', 'tasks', 'notes', 'top3'])
    expect(pageText(blocks.filter((b) => b.id === 'top3'))).toBe('TOP 3\n☐\n☐\n☐')
  })

  it('the bullet journal: • task, ○ event, – note, × done', () => {
    const done = { ...survey, status: 'done' as const, completed_at: cairo('09:00') }
    const blocks = buildPage(PRESETS.bullet.layout, data({ top3: [goal, done] }))
    const text = pageText(blocks)
    expect(text.split('\n').slice(0, 9)).toEqual(['Saturday, 10 October', '', 'TOP 3', '• ✶ GCI homework 1 — NumPy', '× Do GCI lecture 2’s survey', 'PLAN', '○ 09:00–10:30  Judge test', '○ 18:00–19:00  Gym', ''])
    expect(text).toContain('HABITS\n• Qur’an\n• rep\n• move\n• read')
    expect(text).toMatch(/NOTES\n(–\n){7}–$/)
  })

  it('the 12h clock, and an all-day item', () => {
    const layout = { ...withTop3, top3: { plan: true, clock: '12h' as const } }
    const allDay = event('Holiday', '00:00', '00:00', { all_day: true, starts_at: `${DAY}T00:00:00.000Z`, ends_at: '2026-10-11T00:00:00.000Z' })
    const text = pageText(buildPage(layout, data({ events: [...EVENTS, allDay] })))
    expect(text).toContain('PLAN\n9:00am–10:30am  Judge test\n6:00pm–7:00pm  Gym\nall day  Holiday')
  })

  it('the page’s task ids — what a photo of it can tick off', () => {
    expect(pageTaskIds(buildPage(PRESETS.kai.layout, data()))).toEqual([goal.id, survey.id, omar.id, milk.id])
  })
})

describe('notebook page: the day, on the user’s clock', () => {
  it('a task due 01:30 Cairo on the 11th is the 11th’s in Cairo, the 10th’s in UTC', () => {
    const late = task('Late one', { due_at: '2026-10-10T22:30:00.000Z' })
    expect(dayTasks([late], DAY, 'Africa/Cairo')).toEqual([])
    expect(dayTasks([late], DAY, 'UTC')).toEqual([late])
    expect(dayTasks([late], '2026-10-11', 'Africa/Cairo')).toEqual([late])
  })

  it('the date line, short and long', () => {
    expect(headerDate('2026-10-03', false)).toBe('SAT · 3 OCT')
    expect(headerDate('2026-10-03', true)).toBe('Saturday, 3 October')
  })

  it('Day N counts the day the account began as Day 1', () => {
    expect(dayNumber('2026-07-22', '2026-10-13')).toBe(84)
    expect(dayNumber('2026-10-10', '2026-10-10')).toBe(1)
    expect(dayNumber(null, DAY)).toBeNull()
    expect(dayNumber('2026-10-11', DAY)).toBeNull()
  })
})

describe('notebook page: the stored layout', () => {
  it('anything malformed falls back to Kai’s page', () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(parseLayout('x')).toEqual(DEFAULT_LAYOUT)
    expect(parseLayout({ marks: 'stars', tasks: { cap: 7 }, notes: { lines: -1 } })).toEqual(DEFAULT_LAYOUT)
  })

  it('drops unknown or repeated blocks and adds a missing one at the end, off', () => {
    const l = parseLayout({ blocks: [{ id: 'notes', on: true }, { id: 'prayer', on: true }, { id: 'notes', on: false }, { id: 'header', on: true }] })
    expect(l.blocks.map((b) => `${b.id}:${b.on}`)).toEqual(['notes:true', 'header:true', 'top3:false', 'habits:false', 'tasks:false', 'night:false'])
  })

  it('knows its preset, and a change makes it custom', () => {
    expect(presetOf(PRESETS.bullet.layout)).toBe('bullet')
    expect(presetOf(JSON.parse(JSON.stringify(PRESETS.kai.layout)))).toBe('kai')
    expect(presetOf({ ...PRESETS.kai.layout, notes: { lines: 12 } })).toBeNull()
  })

  it('moves a block up or down, never past the edge', () => {
    const up = moveBlock(DEFAULT_LAYOUT, 'habits', -1)!
    expect(up.blocks.slice(0, 3).map((b) => b.id)).toEqual(['header', 'habits', 'tasks'])
    expect(moveBlock(DEFAULT_LAYOUT, 'header', -1)).toBeNull()
    expect(moveBlock(DEFAULT_LAYOUT, 'top3', 1)).toBeNull()
  })
})
