import { describe, expect, it } from 'vitest'
import { dayPicks, isOverdue, isTop3Today, todaysTop3, type Top3Row } from '../../../../supabase/functions/_shared/today.ts'
import { isTop3Today as appIsTop3Today } from '../tasks/top3Rule'
import type { Task } from '../../lib/types'

// The server's Top 3 rule (notify's digest, chat, mcp) — the app's top3Rule.ts, restated on the
// user's clock. Sun 4 Oct 2026 11:00 UTC = 14:00 Cairo (UTC+3), 04:00 Los Angeles, 20:00 Tokyo.
const NOW = new Date('2026-10-04T11:00:00Z')
const CAIRO = 'Africa/Cairo'
const row = (over: Partial<Top3Row> & { title?: string } = {}): Top3Row & { title: string } => ({
  title: 'x',
  status: 'todo',
  someday: false,
  deleted_at: null,
  due_at: null,
  scheduled_start: null,
  top3: true,
  top3_rank: null,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('the Top 3 rule on the server', () => {
  it('a pick counts while undated or dated today or earlier', () => {
    expect(isTop3Today(row(), NOW, CAIRO)).toBe(true) // undated = "today, whenever"
    expect(isTop3Today(row({ due_at: '2026-10-04T20:30:00Z' }), NOW, CAIRO)).toBe(true) // 23:30 tonight
    expect(isTop3Today(row({ due_at: '2026-10-03T06:00:00Z' }), NOW, CAIRO)).toBe(true) // yesterday's, carried
    expect(isTop3Today(row({ due_at: '2026-10-04T21:30:00Z' }), NOW, CAIRO)).toBe(false) // 00:30 tomorrow
    expect(isTop3Today(row({ scheduled_start: '2026-10-08T06:00:00Z' }), NOW, CAIRO)).toBe(false) // a block on Thursday
    // The due date wins over the block, as taskDayDiff reads it.
    expect(isTop3Today(row({ due_at: '2026-10-08T06:00:00Z', scheduled_start: '2026-10-04T08:00:00Z' }), NOW, CAIRO)).toBe(false)
  })

  it('never someday, paused, Trash, done, cancelled or unstarred', () => {
    for (const over of [{ someday: true }, { paused: true }, { deleted_at: '2026-10-03T00:00:00Z' }, { status: 'done' }, { status: 'cancelled' }, { top3: false }]) {
      expect(isTop3Today(row(over), NOW, CAIRO)).toBe(false)
    }
  })

  it("is the user's day, not the server's: 00:30 Cairo tomorrow is still today in Los Angeles", () => {
    const late = row({ due_at: '2026-10-04T21:30:00Z' })
    expect(isTop3Today(late, NOW, 'America/Los_Angeles')).toBe(true)
    expect(isTop3Today(row({ due_at: '2026-10-04T16:00:00Z' }), NOW, 'Asia/Tokyo')).toBe(false) // 01:00 Monday in Tokyo
  })

  it('says what the app says, row for row', () => {
    const rows = [row(), row({ someday: true }), row({ paused: true }), row({ due_at: '2026-10-08T06:00:00Z' }), row({ due_at: '2026-10-03T06:00:00Z' }), row({ status: 'cancelled' })]
    // The app reads the zone from appZone() (Cairo by default) — the server is handed it.
    for (const r of rows) expect(isTop3Today(r, NOW, CAIRO)).toBe(appIsTop3Today(r as unknown as Task, NOW))
  })

  it('orders by top3_rank — 1 is the goal — then the unranked, oldest first', () => {
    const picks = [
      row({ title: 'unranked new', created_at: '2026-10-03T00:00:00Z' }),
      row({ title: 'second', top3_rank: 2 }),
      row({ title: 'moved', top3_rank: 1, due_at: '2026-10-08T06:00:00Z' }),
      row({ title: 'goal', top3_rank: 1 }),
      row({ title: 'unranked old', created_at: '2026-09-30T00:00:00Z' }),
    ]
    expect(todaysTop3(picks, NOW, CAIRO).map((t) => t.title)).toEqual(['goal', 'second', 'unranked old', 'unranked new'])
  })
})

describe('overdue on the server (the digest\'s "N overdue")', () => {
  it('open, not someday, dated before the user\'s today — by day, not by the hour', () => {
    expect(isOverdue(row({ top3: false, due_at: '2026-10-04T06:00:00Z' }), NOW, CAIRO)).toBe(false) // 09:00 today: not overdue at 14:00
    expect(isOverdue(row({ top3: false, due_at: '2026-10-03T20:59:00Z' }), NOW, CAIRO)).toBe(true) // 23:59 yesterday
    expect(isOverdue(row({ top3: false, scheduled_start: '2026-10-02T06:00:00Z' }), NOW, CAIRO)).toBe(true) // a missed block, no due date
    expect(isOverdue(row({ due_at: '2026-10-01T06:00:00Z', someday: true }), NOW, CAIRO)).toBe(false)
    expect(isOverdue(row({ due_at: '2026-10-01T06:00:00Z', paused: true }), NOW, CAIRO)).toBe(false) // a paused series rests
    expect(isOverdue(row({ due_at: '2026-10-01T06:00:00Z', deleted_at: '2026-10-02T00:00:00Z' }), NOW, CAIRO)).toBe(false)
    expect(isOverdue(row({ due_at: '2026-10-01T06:00:00Z', status: 'done' }), NOW, CAIRO)).toBe(false)
    expect(isOverdue(row(), NOW, CAIRO)).toBe(false) // undated
  })
})

describe('dayPicks — the Top 3 as drawn (P1 2026-10-31)', () => {
  it('a goal finished today stays first; open picks, then the finished ones', () => {
    const goal = row({ title: 'goal', status: 'done', top3: false, top3_rank: 1 })
    const b = row({ title: 'b', top3_rank: 2 })
    const c = row({ title: 'c', status: 'done', top3: false, top3_rank: 3 })
    const d = row({ title: 'd' }) // starred later, unranked
    expect(dayPicks([b, d], [c, goal], NOW, CAIRO).map((t) => t.title)).toEqual(['goal', 'b', 'd', 'c'])
  })

  it('a finished task with no place is not a pick', () => {
    expect(dayPicks([row({ title: 'open' })], [row({ title: 'plain', status: 'done', top3: false })], NOW, CAIRO).map((t) => t.title)).toEqual(['open'])
  })
})
