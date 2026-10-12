import { describe, expect, it } from 'vitest'
import { isTop3Today, openTop3Count, releaseTop3 } from './top3Rule'
import { railBuckets } from '../calendar/replan'
import type { Task } from '../../lib/types'

// Kai 2026-10-12: a Top 3 pick replanned to another day kept its slot. Wed 2026-10-07, 15:00 Cairo
// (UTC+3 — Egypt keeps summer time until the end of October).
const NOW = new Date('2026-10-07T15:00:00+03:00')
const at = (day: number, hour = 9) => new Date(Date.UTC(2026, 9, 7 + day, hour - 3)).toISOString()

const pick = (over: Partial<Task> = {}): Task =>
  ({
    id: crypto.randomUUID(), title: 'x', status: 'todo', due_at: at(0), scheduled_start: null, scheduled_end: null,
    top3: true, top3_rank: 2, someday: false, deleted_at: null, completed_at: null, ...over,
  }) as Task

describe('a Top 3 pick keeps its place only while it is today’s', () => {
  it('moved to tomorrow (Tomorrow, a picked date, a drag) — the place is given up', () => {
    expect(isTop3Today(pick({ due_at: at(1) }), NOW)).toBe(false)
    expect(releaseTop3(pick({ due_at: at(1) }), NOW)).toMatchObject({ top3: false, top3_rank: null })
    expect(isTop3Today(pick({ due_at: null, scheduled_start: at(3, 14) }), NOW)).toBe(false)
  })
  it('still today (any time today, or moved within today) — kept, untouched', () => {
    const p = pick({ due_at: at(0, 23) })
    expect(isTop3Today(p, NOW)).toBe(true)
    expect(releaseTop3(p, NOW)).toBe(p)
  })
  it('not a pick — never touched', () => {
    const t = pick({ top3: false, top3_rank: null, due_at: at(5) })
    expect(isTop3Today(t, NOW)).toBe(false)
    expect(releaseTop3(t, NOW)).toBe(t)
  })
})

describe('the 3-slot cap and the rail count today’s open picks, not stale flags', () => {
  it('a pick moved to Thursday frees its slot', () => {
    const tasks = [pick(), pick(), pick({ due_at: at(1) })]
    expect(openTop3Count(tasks, NOW)).toBe(2)
  })
  it('a finished pick and the task being starred are not counted', () => {
    const me = pick()
    expect(openTop3Count([me, pick({ completed_at: NOW.toISOString() }), pick()], NOW, me.id)).toBe(1)
  })
  it('the calendar rail’s Today no longer lists a pick dated tomorrow', () => {
    expect(railBuckets([pick({ due_at: at(1) })], [], NOW).today).toHaveLength(0)
    expect(railBuckets([pick()], [], NOW).today).toHaveLength(1)
  })
})

describe('the rule’s other cases (conductor decision 2026-10-12)', () => {
  it('someday, Trash, cancelled — no place', () => {
    expect(isTop3Today(pick({ someday: true }), NOW)).toBe(false)
    expect(isTop3Today(pick({ deleted_at: NOW.toISOString() }), NOW)).toBe(false)
    expect(isTop3Today(pick({ status: 'cancelled' }), NOW)).toBe(false)
  })
  it('undated, and yesterday’s unfinished pick, stay today’s', () => {
    expect(isTop3Today(pick({ due_at: null }), NOW)).toBe(true)
    expect(isTop3Today(pick({ due_at: at(-1) }), NOW)).toBe(true)
  })
})
