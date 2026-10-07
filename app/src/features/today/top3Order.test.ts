import { describe, expect, it } from 'vitest'
import { dayTop3, goalIdOf, moveInTop3, orderTop3, planMakeGoal, rankWrites, starTimes, top3Display } from './top3Order'
import type { Task } from '../../lib/types'

type Row = { id: string; top3_rank?: number | null; completed_at: string | null; scheduled_start?: string | null }
const r = (id: string, rank: number | null = null, done = false, block: string | null = null): Row => ({ id, top3_rank: rank, completed_at: done ? '2026-10-07T08:00:00Z' : null, scheduled_start: block })
const ids = (rows: readonly { id: string }[]) => rows.map((x) => x.id)
const at = (hhmm: string) => `2026-10-07T${hhmm}:00+03:00`
const starred = (pairs: [string, string][]) => new Map(pairs.map(([id, hhmm]) => [id, Date.parse(at(hhmm))]))
const star = (id: string, hhmm: string, type = 'task.starred') => ({ entity_id: id, event_type: type, created_at: new Date(at(hhmm)).toISOString() })

describe('orderTop3 — the user’s order, goal first', () => {
  it('ranked rows by rank (Kai’s order); the unranked after them by block, unscheduled last', () => {
    expect(ids(orderTop3([r('a'), r('b', 2), r('c', 1), r('d', null, false, at('09:00'))], null))).toEqual(['c', 'b', 'd', 'a'])
  })
  it('Kai’s 16:18 screenshot: with no order set, the goal is the first pick starred — moving blocks can’t flip it', () => {
    const picks = [r('read', null, false, at('22:00')), r('crypto', null, false, at('14:45')), r('gym', null, false, at('17:15'))]
    const stars = starred([['crypto', '08:01'], ['gym', '08:02'], ['read', '08:03']])
    expect(ids(orderTop3(picks, null, stars))).toEqual(['crypto', 'gym', 'read'])
    // He moves Crypto's block to the evening: still the goal; the rest by their blocks.
    const moved = [r('read', null, false, at('22:00')), r('crypto', null, false, at('23:00')), r('gym', null, false, at('17:15'))]
    expect(ids(orderTop3(moved, null, stars))).toEqual(['crypto', 'gym', 'read'])
  })
  it('the rest by block start, unscheduled last, then by star time', () => {
    const picks = [r('g'), r('none'), r('late', null, false, at('19:00')), r('early', null, false, at('17:15'))]
    expect(ids(orderTop3(picks, null, starred([['g', '07:00'], ['none', '07:01']])))).toEqual(['g', 'early', 'late', 'none'])
  })
  it('no star times known (offline, an old row): the first in Today’s order leads', () => {
    expect(ids(orderTop3([r('a'), r('b'), r('c')], null))).toEqual(['a', 'b', 'c'])
  })
  it('this device’s legacy pick (Plan my day before 0055) still leads while nothing is ranked', () => {
    expect(ids(orderTop3([r('a'), r('b'), r('c')], 'c', starred([['a', '07:00']])))).toEqual(['c', 'a', 'b'])
    expect(ids(orderTop3([r('a'), r('b')], 'gone'))).toEqual(['a', 'b'])
  })
  it('once anything is ranked, the legacy pick no longer leads', () => {
    expect(ids(orderTop3([r('a'), r('b', 1), r('c')], 'c'))).toEqual(['b', 'a', 'c'])
  })
})

describe('starTimes', () => {
  it('the latest star per task; a task whose latest event is an unstar has none', () => {
    const t = starTimes([star('a', '07:00'), star('a', '09:00'), star('b', '08:00'), star('b', '08:30', 'task.unstarred')])
    expect([...t.keys()]).toEqual(['a'])
    expect(t.get('a')).toBe(Date.parse(at('09:00')))
  })
})

describe('top3Display — what Today draws', () => {
  it('the goal first even when it is done (R4), other finished picks last (A3)', () => {
    expect(ids(top3Display([r('g', 1, true), r('a', 2, true), r('b', 3)]))).toEqual(['g', 'b', 'a'])
    expect(top3Display([])).toEqual([])
  })
})

describe('rankWrites', () => {
  it('only the rows whose place changed', () => {
    expect(rankWrites([r('a', 1), r('b', 3), r('c')]).map((w) => [w.row.id, w.rank])).toEqual([['b', 2], ['c', 3]])
  })
})

describe('moveInTop3 — Move up / down, Alt+↑/↓, a drag', () => {
  const display = [r('g', 1), r('a', 2), r('b', 3)]
  it('moves within the open picks; into the first place it is the goal', () => {
    expect(ids(moveInTop3(display, 'b', 1)!)).toEqual(['g', 'b', 'a'])
    expect(ids(moveInTop3(display, 'a', 0)!)).toEqual(['a', 'g', 'b'])
    expect(ids(moveInTop3(display, 'g', 2)!)).toEqual(['a', 'b', 'g'])
  })
  it('no move off either end, onto itself, or below a finished pick; a finished pick stays', () => {
    expect(moveInTop3(display, 'g', -1)).toBeNull()
    expect(moveInTop3(display, 'b', 3)).toBeNull()
    expect(moveInTop3(display, 'a', 1)).toBeNull()
    const withDone = [r('g', 1), r('a', 2), r('d', 3, true)]
    expect(moveInTop3(withDone, 'a', 2)).toBeNull()
    expect(moveInTop3(withDone, 'd', 0)).toBeNull()
  })
  it('a finished goal gives way to a new goal', () => {
    expect(ids(moveInTop3([r('g', 1, true), r('a', 2), r('b', 3)], 'b', 0)!)).toEqual(['b', 'g', 'a'])
  })
})

describe('planMakeGoal — "a button for making something the goal of the day"', () => {
  it('a pick already in the Top 3 leads; the rest keep their order', () => {
    const p = planMakeGoal([r('g'), r('a'), r('b')], r('b'))
    expect(p).toMatchObject({ out: null, full: false })
    expect(ids(p.order)).toEqual(['b', 'g', 'a'])
  })
  it('a task outside a Top 3 with room joins as the goal', () => {
    expect(planMakeGoal([r('g'), r('a')], r('x'))).toMatchObject({ out: null, full: false })
    expect(ids(planMakeGoal([r('g'), r('a')], r('x')).order)).toEqual(['x', 'g', 'a'])
  })
  it('into a full Top 3: the swap — the last open pick that isn’t the goal makes room, the old goal stays', () => {
    const p = planMakeGoal([r('g'), r('a'), r('b')], r('x'))
    expect(p.full).toBe(true)
    expect(p.out?.id).toBe('b')
    expect(ids(p.order)).toEqual(['x', 'g', 'a'])
  })
  it('finished picks don’t count toward the three, and never make room', () => {
    expect(planMakeGoal([r('g', 1, true), r('a'), r('b')], r('x'))).toMatchObject({ full: false, out: null })
    const p = planMakeGoal([r('g'), r('a'), r('b'), r('d', null, true)], r('x'))
    expect(p.out?.id).toBe('b')
    expect(ids(p.order)).toEqual(['x', 'g', 'a', 'd'])
  })
})

describe('dayTop3 / goalIdOf — from the task list', () => {
  const t = (id: string, over: Partial<Task> = {}): Task =>
    ({ id, title: id, status: 'todo', top3: true, top3_rank: null, someday: false, completed_at: null, due_at: null, scheduled_start: null, deleted_at: null, ...over }) as Task
  const now = new Date('2026-10-07T12:00:00Z')
  it('the ranked goal, wherever it sits in the list', () => {
    const tasks = [t('a', { top3_rank: 2 }), t('b', { top3_rank: 1 }), t('c'), t('x', { top3: false })]
    expect(ids(dayTop3(tasks, null, [], now))).toEqual(['b', 'a', 'c'])
    expect(goalIdOf(tasks, null, [], now)).toBe('b')
  })
  it('a goal finished today stays the goal (its place is kept; completing clears top3)', () => {
    const tasks = [t('a', { top3_rank: 2 }), t('g', { top3: false, top3_rank: 1, status: 'done', completed_at: '2026-10-07T09:00:00Z' })]
    expect(goalIdOf(tasks, null, [], now)).toBe('g')
  })
  it('unranked: the first starred is the goal, and a pick finished while starred stays in', () => {
    const tasks = [t('b'), t('a'), t('done', { top3: false, status: 'done', completed_at: '2026-10-07T09:00:00Z' })]
    const stars = [star('a', '07:00'), star('b', '07:05'), star('done', '07:10')]
    expect(ids(dayTop3(tasks, null, stars, now))).toEqual(['a', 'b', 'done'])
  })
  it('a stale place on a task that left the Top 3 is ignored', () => {
    const tasks = [t('a'), t('old', { top3: false, top3_rank: 1 })]
    expect(goalIdOf(tasks, null, [], now)).toBe('a')
    expect(goalIdOf([], null, [], now)).toBeNull()
  })
})