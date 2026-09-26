import { describe, expect, it } from 'vitest'
import { filterByList, filterByScope, groupTasks, planningColumns } from './grouping'
import { scheduleNextWeek } from '../../lib/dateShortcuts'
import type { Task } from '../../lib/types'

// Fixed "now": Wed 2026-07-08, mid-afternoon Cairo (UTC+3 in July). Pinned to Cairo, not
// device-local, because grouping buckets by Cairo day (B2) — a device-local fixture fails on
// any non-Cairo machine (CI, cloud sessions).
const NOW = new Date('2026-07-08T15:00:00+03:00')

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? crypto.randomUUID(),
    project_id: null,
    domain_id: null,
    area_id: null,
    title: 'x',
    notes: null,
    status: 'todo',
    due_at: null,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    snoozed_until: null,
    recurrence_rule: null,
    labels: [],
    priority: null,
    duration_min: null,
    someday: false,
    reminder_at: null,
    reminder_sent: false,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

/** ISO for a day offset from NOW, at the given Cairo wall-clock hour */
function at(dayOffset: number, hour = 9): string {
  return new Date(Date.UTC(2026, 6, 8 + dayOffset, hour - 3)).toISOString()
}

describe('groupTasks', () => {
  it('buckets by calendar day, not raw 24h — a task due 23:00 today is Today, not Tomorrow', () => {
    const groups = groupTasks([task({ due_at: at(0, 23) })], NOW)
    expect(groups.map((g) => g.key)).toEqual(['today'])
  })

  it('a task due 23:00 yesterday is Overdue (1 day), not Today', () => {
    const groups = groupTasks([task({ due_at: at(-1, 23) })], NOW)
    expect(groups.map((g) => g.key)).toEqual(['overdue'])
  })

  it('sorts Overdue oldest-first', () => {
    const groups = groupTasks(
      [task({ id: 'recent', due_at: at(-2) }), task({ id: 'oldest', due_at: at(-9) })],
      NOW,
    )
    expect(groups[0].key).toBe('overdue')
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['oldest', 'recent'])
  })

  it('a task blocked on today\'s calendar goes to Scheduled, not its due bucket', () => {
    const groups = groupTasks([task({ due_at: at(3), scheduled_start: at(0, 14) })], NOW)
    expect(groups.map((g) => g.key)).toEqual(['scheduled'])
  })

  it('undated non-someday tasks get their own No date group (punch 27)', () => {
    const groups = groupTasks([task({})], NOW)
    expect(groups.map((g) => g.key)).toEqual(['unplanned'])
    expect(groups[0].label).toBe('No date')
  })

  it('someday tasks bucket into Someday regardless of any date', () => {
    const groups = groupTasks([task({ someday: true, due_at: at(-5) })], NOW)
    expect(groups.map((g) => g.key)).toEqual(['someday'])
  })

  it('sums duration per group and drops empty groups, in fixed order', () => {
    const groups = groupTasks(
      [task({ due_at: at(0), duration_min: 30 }), task({ due_at: at(0), duration_min: 45 }), task({ due_at: at(1) })],
      NOW,
    )
    expect(groups.map((g) => g.key)).toEqual(['today', 'tomorrow'])
    expect(groups[0].totalMinutes).toBe(75)
  })

  it('ignores done/cancelled tasks', () => {
    const groups = groupTasks([task({ status: 'done', due_at: at(-1) }), task({ status: 'cancelled' })], NOW)
    expect(groups).toEqual([])
  })
})

describe('filterByList', () => {
  const tasks = [
    task({ id: 'overdue', due_at: at(-2) }),
    task({ id: 'today', due_at: at(0) }),
    task({ id: 'thisweek', due_at: at(4) }),
    task({ id: 'nextmonth', due_at: at(40) }),
    task({ id: 'undated' }),
    task({ id: 'someday', someday: true }),
    task({ id: 'top3', top3: true }),
    task({ id: 'done', status: 'done', due_at: at(0) }),
  ]

  it('today = overdue + due-today + top3, never someday or done', () => {
    const ids = filterByList(tasks, 'today', NOW).map((t) => t.id)
    expect(ids.sort()).toEqual(['overdue', 'today', 'top3'])
  })

  it('week includes overdue through 6 days out, excludes next month', () => {
    const ids = filterByList(tasks, 'week', NOW).map((t) => t.id)
    expect(ids.sort()).toEqual(['overdue', 'thisweek', 'today'])
  })

  it('upcoming is only dated beyond this month', () => {
    expect(filterByList(tasks, 'upcoming', NOW).map((t) => t.id)).toEqual(['nextmonth'])
  })

  it('someday list is only someday tasks', () => {
    expect(filterByList(tasks, 'someday', NOW).map((t) => t.id)).toEqual(['someday'])
  })

  it('someday tasks are excluded from every non-someday list and the default', () => {
    for (const list of ['today', 'week', 'month', 'upcoming', null] as const) {
      expect(filterByList(tasks, list, NOW).some((t) => t.id === 'someday')).toBe(false)
    }
  })

  it('default (no list) is all open non-someday tasks', () => {
    const ids = filterByList(tasks, null, NOW).map((t) => t.id)
    expect(ids).not.toContain('someday')
    expect(ids).not.toContain('done')
    expect(ids).toContain('undated')
  })

  it('all = every open task, someday and undated included, never done (punch 27)', () => {
    const ids = filterByList(tasks, 'all', NOW).map((t) => t.id)
    expect(ids.sort()).toEqual(['nextmonth', 'overdue', 'someday', 'thisweek', 'today', 'top3', 'undated'])
  })
})

describe('filterByScope', () => {
  const tasks = [
    task({ id: 'p1', project_id: 'proj-a' }),
    task({ id: 'p2', project_id: 'proj-b' }),
    task({ id: 'a1', area_id: 'area-a' }),
    task({ id: 'd1', domain_id: 'dom-a' }),
    task({ id: 'someday-in-proj', project_id: 'proj-a', someday: true }),
    task({ id: 'done-in-proj', project_id: 'proj-a', status: 'done' }),
    task({ id: 'today', due_at: at(0) }),
  ]

  it('smart scope delegates to filterByList', () => {
    expect(filterByScope(tasks, { kind: 'smart', id: 'today' }, NOW).map((t) => t.id)).toEqual(['today'])
  })

  it('project scope filters by project_id, excluding someday and done', () => {
    expect(filterByScope(tasks, { kind: 'project', id: 'proj-a' }, NOW).map((t) => t.id)).toEqual(['p1'])
  })

  it('area scope filters by area_id', () => {
    expect(filterByScope(tasks, { kind: 'area', id: 'area-a' }, NOW).map((t) => t.id)).toEqual(['a1'])
  })

  it('domain scope filters by domain_id', () => {
    expect(filterByScope(tasks, { kind: 'domain', id: 'dom-a' }, NOW).map((t) => t.id)).toEqual(['d1'])
  })
})

describe('planningColumns', () => {
  it('keeps all 5 columns, even empty ones, as drop targets', () => {
    const cols = planningColumns([], NOW)
    expect(cols.map((c) => c.key)).toEqual(['today', 'tomorrow', 'week', 'nextWeek', 'someday'])
  })

  it('overdue tasks land in Today, not a separate bucket', () => {
    const cols = planningColumns([task({ due_at: at(-3) })], NOW)
    expect(cols.find((c) => c.key === 'today')!.tasks).toHaveLength(1)
  })

  it('undated tasks fold into Next week', () => {
    const cols = planningColumns([task({})], NOW)
    expect(cols.find((c) => c.key === 'nextWeek')!.tasks).toHaveLength(1)
  })

  it('day 2-6 out is This week, day 7+ is Next week', () => {
    const cols = planningColumns([task({ id: 'mid', due_at: at(4) }), task({ id: 'far', due_at: at(9) })], NOW)
    expect(cols.find((c) => c.key === 'week')!.tasks.map((t) => t.id)).toEqual(['mid'])
    expect(cols.find((c) => c.key === 'nextWeek')!.tasks.map((t) => t.id)).toEqual(['far'])
  })

  it('someday tasks land in Someday regardless of date', () => {
    const cols = planningColumns([task({ someday: true, due_at: at(0) })], NOW)
    expect(cols.find((c) => c.key === 'someday')!.tasks).toHaveLength(1)
    expect(cols.find((c) => c.key === 'today')!.tasks).toHaveLength(0)
  })

  it('a task just dropped on Next week stays in Next week, on every weekday — regression for the bug where next Monday landed in This week on Tue–Sat', () => {
    for (let i = 0; i < 7; i++) {
      const now = new Date('2026-07-06T15:00:00') // a Monday
      now.setDate(now.getDate() + i)
      const due = scheduleNextWeek(now)
      const cols = planningColumns([task({ due_at: due })], now)
      // Sunday is the one real exception: "next Monday" literally is tomorrow, and the
      // board's own Tomorrow column takes precedence over Next week for a diff of 1 — not
      // the bug being guarded against here (that was This week wrongly swallowing it).
      const isSundayEdgeCase = now.getDay() === 0
      const expectedKey = isSundayEdgeCase ? 'tomorrow' : 'nextWeek'
      expect(cols.find((c) => c.key === expectedKey)!.tasks, `weekday offset ${i}`).toHaveLength(1)
      expect(cols.find((c) => c.key === 'week')!.tasks, `weekday offset ${i}`).toHaveLength(0)
    }
  })
})
