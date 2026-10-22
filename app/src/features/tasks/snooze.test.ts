import { describe, expect, it, beforeAll } from 'vitest'
import { setHour24 } from '../../lib/clock'
import { backFromSnooze, isSnoozed, snoozeLine, snoozeWhen } from './snooze'
import { filterByList, filterByScope, groupTasks, todayListTasks } from './grouping'
import { isTop3Today, releaseTop3 } from './top3Rule'
import { taskMenuSpec } from './taskMenuSpec'
import type { Task } from '../../lib/types'

// These read times on the 24-hour clock (lib/clock, Kai 2026-10-22); the 12-hour one is lib/clock.test's.
beforeAll(() => setHour24(true))

// Snooze (Kai 2026-10-17). Sat 17 Oct 2026, 10:00 in Cairo (UTC+3) — the user's clock (lib/appZone's
// default), whatever zone the machine runs in: CI runs this file in Cairo, UTC, Los Angeles and Tokyo.
const NOW = new Date('2026-10-17T07:00:00Z')
const cairo = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m)).toISOString()
}

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, project_id: null, domain_id: null, area_id: null, title: id, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null,
  someday: false, reminder_at: null, reminder_sent: false, completed_at: null, created_at: cairo(1, '09:00'), updated_at: cairo(1, '09:00'), ...over,
})

describe('snooze: hidden until its time, then back', () => {
  it('is snoozed only while snoozed_until is ahead', () => {
    expect(isSnoozed(task('a', { snoozed_until: cairo(17, '13:00') }), NOW)).toBe(true)
    expect(isSnoozed(task('a', { snoozed_until: cairo(17, '09:59') }), NOW)).toBe(false)
    expect(isSnoozed(task('a', { snoozed_until: cairo(17, '10:00') }), NOW)).toBe(false) // its moment: back
    expect(isSnoozed(task('a'), NOW)).toBe(false)
  })

  it('"Back from snooze" for the rest of the user\'s day it came back on — open tasks only', () => {
    expect(backFromSnooze(task('a', { snoozed_until: cairo(17, '08:00') }), NOW)).toBe(true)
    expect(backFromSnooze(task('a', { snoozed_until: cairo(16, '18:00') }), NOW)).toBe(false) // yesterday's
    expect(backFromSnooze(task('a', { snoozed_until: cairo(17, '13:00') }), NOW)).toBe(false) // still away
    expect(backFromSnooze(task('a', { snoozed_until: cairo(17, '08:00'), completed_at: cairo(17, '09:00') }), NOW)).toBe(false)
    // The day is Cairo's, not UTC's: at 00:30 on the 18th (21:30Z on the 17th), 23:50 on the 17th is yesterday.
    const lateNight = new Date('2026-10-17T21:30:00Z')
    expect(backFromSnooze(task('a', { snoozed_until: cairo(18, '00:10') }), lateNight)).toBe(true)
    expect(backFromSnooze(task('a', { snoozed_until: cairo(17, '23:50') }), lateNight)).toBe(false)
  })

  it('says when it is back on the user\'s clock: a time today, Tomorrow, else the day', () => {
    expect(snoozeWhen(cairo(17, '15:00'), NOW)).toBe('15:00')
    expect(snoozeWhen(cairo(18, '09:00'), NOW)).toBe('Tomorrow · 09:00')
    expect(snoozeWhen(cairo(19, '09:00'), NOW)).toBe('Mon 19 Oct · 09:00')
    expect(snoozeLine(cairo(17, '15:00'), 1, NOW)).toBe('Snoozed until 15:00')
    expect(snoozeLine(cairo(18, '09:00'), 3, NOW)).toBe('3 tasks snoozed until Tomorrow · 09:00')
  })
})

describe('snooze: the lists', () => {
  const later = task('later', { due_at: cairo(17, '09:00'), snoozed_until: cairo(19, '09:00') })
  const soon = task('soon', { snoozed_until: cairo(17, '13:00'), project_id: 'p1' })
  const back = task('back', { due_at: cairo(17, '09:00'), snoozed_until: cairo(17, '08:00') })
  const plain = task('plain', { due_at: cairo(17, '09:00'), project_id: 'p1' })
  const all = [later, soon, back, plain]
  const ids = (ts: Task[]) => ts.map((t) => t.id)

  it('a snoozed task leaves Today, every list and the rail — it keeps its due date', () => {
    expect(ids(filterByList(all, 'today', NOW))).toEqual(['back', 'plain'])
    expect(ids(filterByList(all, 'all', NOW))).toEqual(['back', 'plain'])
    expect(ids(filterByList(all, null, NOW))).toEqual(['back', 'plain'])
    expect(ids(todayListTasks(all, NOW))).toEqual(['back', 'plain'])
    expect(ids(filterByScope(all, { kind: 'project', id: 'p1' }, NOW))).toEqual(['plain'])
    expect(later.due_at).toBe(cairo(17, '09:00'))
  })

  it('Snoozed lists them, soonest back first, in one group — and nothing done', () => {
    const done = task('done', { status: 'done', snoozed_until: cairo(18, '09:00') })
    expect(ids(filterByList([...all, done], 'snoozed', NOW))).toEqual(['soon', 'later'])
    expect(groupTasks(filterByList(all, 'snoozed', NOW), NOW).map((g) => [g.key, ids(g.tasks)])).toEqual([['snoozed', ['soon', 'later']]])
  })

  it('at its time it is back on its own (no write needed)', () => {
    const afterNine = new Date('2026-10-19T06:30:00Z') // Mon 09:30 Cairo
    expect(ids(filterByList(all, 'snoozed', afterNine))).toEqual([])
    expect(ids(todayListTasks(all, afterNine))).toEqual(['later', 'soon', 'back', 'plain'])
  })

  it('a snoozed Top 3 pick gives its place up, as a move off today does; Undo (no snooze) keeps it', () => {
    const pick = task('pick', { top3: true, top3_rank: 1, snoozed_until: cairo(17, '13:00') })
    expect(isTop3Today(pick, NOW)).toBe(false)
    expect(releaseTop3(pick, NOW)).toMatchObject({ top3: false, top3_rank: null })
    const kept = { ...pick, snoozed_until: null }
    expect(releaseTop3(kept, NOW)).toBe(kept)
  })

  it('the row menu: Snooze… after the plan rows; a snoozed task says when it is back and offers Unsnooze', () => {
    const spec = (t: Task, bulkCount?: number) => taskMenuSpec(t, { tomorrowHint: 'Sun 09:00', bulkCount, selected: !!bulkCount }).map((e) => [e.key, e.label, e.hint ?? null])
    expect(spec(plain).slice(0, 3)).toEqual([['plan', 'Plan…', null], ['snooze', 'Snooze…', null], ['project', 'Move to…', 'None']])
    expect(spec(task('x', { snoozed_until: '2099-01-01T00:00:00Z' }))[1]).toEqual(['unsnooze', 'Unsnooze', 'back Thu 1 Jan · 02:00'])
    expect(spec(plain, 3)[1]).toEqual(['snooze', 'Snooze… (3)', null])
  })
})
