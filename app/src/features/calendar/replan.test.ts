import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Task } from '../../lib/types'
import { blockLastDay, dueFollows, nextFreeSlot, placeMoves, railBuckets, railMinutes, replanMoves, tomorrowFirst } from './replan'

// The user's zone is the default Africa/Cairo (UTC+3 until the last Thursday of October 2026), so
// every instant below is a Cairo wall time — and the suite runs under 4 device zones in CI.
const cairo = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - 3, m)).toISOString()
}
const NOW = new Date(cairo('2026-10-07', '15:00')) // Wed 7 Oct, 15:00 Cairo
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, status: 'todo', someday: false, top3: false, due_at: null, scheduled_start: null, scheduled_end: null, duration_min: null, ...over }) as Task
const block = (id: string, taskId: string | null, day: string, from: string, to: string, over: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, task_id: taskId, title: id, starts_at: cairo(day, from), ends_at: cairo(day, to), all_day: false, type: taskId ? 'task' : 'event', busy: true, ...over }) as CalendarEvent
const ids = (rows: { task: Task }[]) => rows.map((r) => r.task.id)

describe('railBuckets — the rail\'s Overdue and Today', () => {
  it('a task due before today is overdue; due today with no time is Today', () => {
    const r = railBuckets([task('late', { due_at: cairo('2026-10-05', '09:00') }), task('now', { due_at: cairo('2026-10-07', '09:00') })], [], NOW)
    expect(ids(r.overdue)).toEqual(['late'])
    expect(r.overdue[0].late).toBe(2)
    expect(ids(r.today)).toEqual(['now'])
  })

  it('a block that ended before today, not done, is overdue — even with a later due date (the stuck block)', () => {
    const missed = block('b1', 'crypto', '2026-10-06', '15:00', '16:30')
    const r = railBuckets([task('crypto', { due_at: cairo('2026-10-09', '09:00') })], [missed], NOW)
    expect(ids(r.overdue)).toEqual(['crypto'])
    expect(r.overdue[0].block?.id).toBe('b1')
    expect(railMinutes(r.overdue[0])).toBe(90)
  })

  it('on the calendar today or later = planned: in neither list (a run-over block from this morning too)', () => {
    const r = railBuckets(
      [task('dragged', { due_at: cairo('2026-10-04', '09:00') }), task('ranover', { due_at: cairo('2026-10-07', '09:00') }), task('both')],
      [block('b1', 'dragged', '2026-10-07', '16:00', '16:30'), block('b2', 'ranover', '2026-10-07', '04:00', '04:30'), block('b3', 'both', '2026-10-06', '10:00', '11:00'), block('b4', 'both', '2026-10-08', '10:00', '11:00')],
      NOW,
    )
    expect(r.overdue).toEqual([])
    expect(r.today).toEqual([])
  })

  it('done, cancelled, someday and deleted tasks stay out; a Top 3 task with no date is Today', () => {
    const y = cairo('2026-10-06', '09:00')
    const r = railBuckets(
      [task('done', { status: 'done', due_at: y }), task('cxl', { status: 'cancelled', due_at: y }), task('park', { someday: true, due_at: y }), task('gone', { due_at: y, deleted_at: y }), task('star', { top3: true }), task('loose')],
      [block('b', 'done', '2026-10-06', '10:00', '11:00')],
      NOW,
    )
    expect(r.overdue).toEqual([])
    expect(ids(r.today)).toEqual(['star'])
  })

  it('an all-day block on an earlier day is overdue, whichever midnight it was stored at', () => {
    const utc = { ...block('a', 'x', '2026-10-06', '00:00', '00:00'), all_day: true, starts_at: '2026-10-06T00:00:00.000Z', ends_at: '2026-10-07T00:00:00.000Z' }
    const local = { ...block('b', 'y', '2026-10-06', '00:00', '00:00'), all_day: true, starts_at: cairo('2026-10-06', '00:00'), ends_at: cairo('2026-10-07', '00:00') }
    expect(blockLastDay(utc)).toBe('2026-10-06')
    expect(blockLastDay(local)).toBe('2026-10-06')
    expect(ids(railBuckets([task('x'), task('y')], [utc, local], NOW).overdue).sort()).toEqual(['x', 'y'])
  })

  it('oldest miss first; Today by due time', () => {
    const r = railBuckets(
      [task('a', { due_at: cairo('2026-10-06', '09:00') }), task('b', { due_at: cairo('2026-10-01', '09:00') }), task('c', { due_at: cairo('2026-10-07', '18:00') }), task('d', { due_at: cairo('2026-10-07', '08:00') })],
      [],
      NOW,
    )
    expect(ids(r.overdue)).toEqual(['b', 'a'])
    expect(ids(r.today)).toEqual(['d', 'c'])
  })
})

describe('replanMoves — THE RULE: a task given a time is on the calendar, a date alone isn\'t', () => {
  const missed = block('old', 't', '2026-10-06', '15:00', '16:30')
  const dupe = block('dupe', 't', '2026-10-05', '09:00', '09:30')

  it('a time: the latest block moves there keeping its length; any other block comes off', () => {
    const m = replanMoves([dupe, missed], cairo('2026-10-07', '04:00'), true, 30)
    expect(m.place).toEqual({ block: missed, starts_at: cairo('2026-10-07', '04:00'), ends_at: cairo('2026-10-07', '05:30') })
    expect(m.clear.map((e) => e.id)).toEqual(['dupe'])
  })

  it('a time on a task with no block: a new one of its estimate (30 minutes without one)', () => {
    expect(replanMoves([], cairo('2026-10-07', '04:00'), true, 45).place).toEqual({ block: null, starts_at: cairo('2026-10-07', '04:00'), ends_at: cairo('2026-10-07', '04:45') })
    expect(replanMoves([], cairo('2026-10-07', '04:00'), true, null).place?.ends_at).toBe(cairo('2026-10-07', '04:30'))
  })

  it('a date alone on another day: the stuck block comes off, nothing placed', () => {
    const m = replanMoves([missed], cairo('2026-10-08', '09:00'), false, 30)
    expect(m).toEqual({ place: null, keep: null, clear: [missed] })
  })

  it('a date alone on the block\'s own day keeps it (Today on a task already blocked today)', () => {
    const today = block('today', 't', '2026-10-07', '16:00', '17:00')
    const m = replanMoves([missed, today], cairo('2026-10-07', '09:00'), false, 30)
    expect(m.keep?.id).toBe('today')
    expect(m.clear.map((e) => e.id)).toEqual(['old'])
  })

  it('no date: every block comes off', () => {
    expect(replanMoves([missed, dupe], null, false, 30).clear.map((e) => e.id).sort()).toEqual(['dupe', 'old'])
  })

  it('placing a task (a drop, Plan ▸): never a second block', () => {
    const m = placeMoves([dupe, missed], cairo('2026-10-07', '16:00'), cairo('2026-10-07', '17:30'))
    expect(m.place?.block?.id).toBe('old')
    expect(m.clear.map((e) => e.id)).toEqual(['dupe'])
  })
})

describe('the small rules beside it', () => {
  it('dueFollows: a missed due date follows a block placed today or later, never backwards', () => {
    expect(dueFollows(cairo('2026-10-05', '09:00'), cairo('2026-10-07', '04:00'), NOW)).toBe(true)
    expect(dueFollows(cairo('2026-10-05', '09:00'), cairo('2026-10-06', '10:00'), NOW)).toBe(false)
    expect(dueFollows(cairo('2026-10-09', '09:00'), cairo('2026-10-07', '16:00'), NOW)).toBe(false)
    expect(dueFollows(null, cairo('2026-10-07', '16:00'), NOW)).toBe(false)
  })

  it('Next free slot: today\'s first gap from now; Tomorrow first thing: from 08:00, around what\'s there', () => {
    const busy = [block('m', null, '2026-10-07', '15:00', '16:00'), block('t', null, '2026-10-08', '08:00', '09:30')]
    expect(nextFreeSlot(busy, NOW, 30)).toEqual({ starts_at: cairo('2026-10-07', '16:00'), ends_at: cairo('2026-10-07', '16:30') })
    expect(tomorrowFirst(busy, NOW, 60)).toEqual({ starts_at: cairo('2026-10-08', '09:30'), ends_at: cairo('2026-10-08', '10:30') })
    expect(tomorrowFirst([], NOW, 60).starts_at).toBe(cairo('2026-10-08', '08:00'))
  })
})
