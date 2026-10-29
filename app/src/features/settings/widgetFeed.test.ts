import { describe, expect, it } from 'vitest'
import { blockColor, buildFeed, cherryStage, LEGACY_TO_C, PALETTE_C, TASKS_SHOWN, type FeedEvent } from '../../../../supabase/functions/widget/feed.ts'
import type { TaskRow } from '../../../../supabase/functions/mcp/tools.ts'
import { BLOCK_SWATCHES, LEGACY_SWATCHES, nearestSwatch } from '../calendar/blockHue'
import { cherryStage as appCherryStage } from '../../lib/growthStages'
import { dayLoad } from '../today/todayLayout'

// The desktop widgets' feed (supabase/functions/widget): the app's own rules, restated on the server.
// Sun 4 Oct 2026 11:00 UTC = 14:00 in Cairo (UTC+3) — the app's default zone, so todayLayout's
// Cairo-clock helpers agree with the feed's.
const NOW = new Date('2026-10-04T11:00:00Z')
const CAIRO = 'Africa/Cairo'
const tid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n: number, title: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id: tid(n), title, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, someday: false,
  paused: false, labels: [], priority: null, duration_min: null, project_id: null, domain_id: null, area_id: null, milestone_id: null,
  parent_task_id: null, recurrence_rule: null, reminder_at: null, reminder_sent: false, snoozed_until: null, completed_at: null,
  created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z', ...over,
})
const ev = (n: number, title: string, s: string, e: string, over: Partial<FeedEvent> = {}): FeedEvent => ({
  id: tid(900 + n), title, starts_at: s, ends_at: e, all_day: false, task_id: null, type: 'event', color: null, ...over,
})

describe('blockColor (calendar/blockHue, as the calendar draws a block)', () => {
  it('palette C is the app’s, and a pre-palette-C colour is its nearest new swatch', () => {
    expect(PALETTE_C).toEqual(BLOCK_SWATCHES.map((s) => s.value))
    for (const v of LEGACY_SWATCHES) expect(LEGACY_TO_C[v.toLowerCase()]).toBe(nearestSwatch(v).value)
    expect(blockColor({ color: '#a8a0be', type: 'event', task_id: null })).toBe('#B59CE3')
    expect(blockColor({ color: '#e58f99', type: 'event', task_id: null })).toBe('#E58F99')
  })
  it('a custom hex as itself; none → Iris for a task or Time block, Rose for an event', () => {
    expect(blockColor({ color: '#123abc', type: 'event', task_id: null })).toBe('#123ABC')
    expect(blockColor({ color: null, type: 'task', task_id: tid(1) })).toBe('#B59CE3')
    expect(blockColor({ color: null, type: 'time_block', task_id: null })).toBe('#B59CE3')
    expect(blockColor({ color: 'var(--x)', type: 'event', task_id: null })).toBe('#E58F99')
  })
})

describe('cherryStage', () => {
  it('is growthStages.cherryStage', () => {
    for (const [o, d] of [[0, 0], [0, 2], [3, 0], [3, 2]]) expect(cherryStage(o, d)).toBe(appCherryStage(o, d))
  })
})

describe('buildFeed', () => {
  const goal = task(1, 'Write the essay', { top3: true, top3_rank: 1, duration_min: 90, priority: 1 })
  const pick2 = task(2, 'Call Omar', { top3: true, top3_rank: 2, duration_min: 30 })
  const doneGoal = task(3, 'Gym', { status: 'done', top3: false, top3_rank: 1, completed_at: '2026-10-04T06:00:00Z' })
  const todays = task(4, 'Pay rent', { due_at: '2026-10-04T15:00:00Z' })
  const overdue = task(5, 'Old thing', { due_at: '2026-10-01T09:00:00Z' })
  const someday = task(6, 'Someday', { someday: true, due_at: '2026-10-04T09:00:00Z' })
  const goalBlock = ev(1, 'Write the essay', '2026-10-04T10:30:00Z', '2026-10-04T12:00:00Z', { type: 'task', task_id: goal.id })
  const meeting = ev(2, 'Standup', '2026-10-04T12:30:00Z', '2026-10-04T13:00:00Z', { color: '#d4a8b0' })
  const later = ev(3, 'Dinner', '2026-10-04T16:00:00Z', '2026-10-04T17:00:00Z')
  const evening = ev(4, 'Read', '2026-10-04T18:00:00Z', '2026-10-04T19:00:00Z', { type: 'time_block' })
  const allDay = ev(5, 'Holiday', '2026-10-04T00:00:00Z', '2026-10-05T00:00:00Z', { all_day: true })
  const base = { now: NOW, zone: CAIRO, open: [goal, pick2, todays, overdue, someday], doneToday: [] as TaskRow[], events: [goalBlock, meeting, later, evening, allDay], names: true, canTick: false }

  it('the goal, the Top 3, today’s tasks and the overdue count', () => {
    const f = buildFeed(base)
    expect(f.goal).toEqual({ id: goal.id, title: 'Write the essay', done: false, priority: 1 })
    expect(f.top3.map((t) => t.title)).toEqual(['Write the essay', 'Call Omar'])
    expect(f.tasks.map((t) => t.title)).toEqual(['Pay rent'])
    expect(f.overdue).toBe(1)
    expect(f.date).toBe('2026-10-04')
    expect(f.zone).toBe(CAIRO)
    expect(f.can_tick).toBe(false)
  })

  it('a goal finished today stays the goal, struck through (top3Display); open picks before finished ones', () => {
    const f = buildFeed({ ...base, open: [task(1, 'Write the essay', { top3: true, top3_rank: 2 }), pick2], doneToday: [doneGoal] })
    expect(f.top3.map((t) => [t.title, t.done])).toEqual([['Gym', true], ['Write the essay', false], ['Call Omar', false]])
    expect(f.goal?.title).toBe('Gym')
  })

  it('now = the running block, next = the next two to start, day = every timed block today', () => {
    const f = buildFeed(base)
    expect(f.now_block).toMatchObject({ title: 'Write the essay', start_hm: '13:30', end_hm: '15:00', color: '#B59CE3', kind: 'task', is_goal: true })
    expect(f.next_blocks.map((b) => [b.title, b.start_hm, b.color])).toEqual([['Standup', '15:30', '#E58F99'], ['Dinner', '19:00', '#E58F99']])
    expect(f.day.map((b) => [b.from_min, b.to_min, b.is_goal])).toEqual([[810, 900, true], [930, 960, false], [1140, 1200, false], [1260, 1320, false]])
  })

  it('a done task’s block is never “now”', () => {
    const f = buildFeed({ ...base, doneToday: [{ ...goal, status: 'done', completed_at: '2026-10-04T10:45:00Z' }], open: [pick2] })
    expect(f.now_block).toBeNull()
    expect(f.day[0].done).toBe(true)
  })

  it('progress and the plant: done today ÷ (done today + today’s open work)', () => {
    const f = buildFeed({ ...base, doneToday: [doneGoal] })
    expect([f.done, f.total, f.progress, f.plant]).toEqual([1, 4, 0.25, 'bloom'])
    expect(buildFeed({ ...base, open: [], events: [] })).toMatchObject({ progress: 0, plant: 'bud' })
  })

  it('load is today-v2’s dayLoad, to the minute', () => {
    const f = buildFeed(base)
    const app = dayLoad([goal, pick2], base.events, NOW, new Set())
    expect(f.load).toEqual({ planned_min: app.planned, free_min: app.free, over_min: app.over })
    expect(f.load.free_min).toBe(240) // 14:00 → 18:00
  })

  it('names=0 hides every title (widgets/snapshot mask)', () => {
    const f = buildFeed({ ...base, names: false })
    expect(JSON.stringify(f)).not.toMatch(/Write the essay|Call Omar|Pay rent|Standup|Dinner/)
    expect([f.goal?.title, f.top3[1].title, f.tasks[0].title, f.now_block?.title, f.next_blocks[0].title]).toEqual(['Your goal', 'Pick 2', 'A task', 'Your goal', 'Busy'])
  })

  it('caps today’s tasks', () => {
    const many = Array.from({ length: TASKS_SHOWN + 5 }, (_, n) => task(100 + n, `T${n}`, { due_at: '2026-10-04T15:00:00Z' }))
    const f = buildFeed({ ...base, open: many })
    expect([f.tasks.length, f.tasks_more]).toEqual([TASKS_SHOWN, 5])
  })
})
