import { describe, expect, it } from 'vitest'
import { filterByList, filterByScope, groupTasks, isTodayTask, todayListTasks, todayOpenCount } from './grouping'
import type { Task } from '../../lib/types'

// Fixed "now": Wed 2026-07-08, mid-afternoon in Cairo. B2/T-2: the app's day boundary is
// Cairo's, so fixtures pin explicit Cairo instants — never device-local ones, which shift
// with the machine running the tests. July–August 2026 is Cairo summer time (UTC+3) throughout.
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

/** ISO for `hour`:00 Cairo time on the Cairo day `dayOffset` days from NOW's (every offset
 * used below stays inside Cairo summer time, UTC+3) */
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

describe('todayListTasks / todayOpenCount (the Today page and its sidebar badge)', () => {
  // The drift fixture from the audit (K-8): the old badge was filterByList('today') = top-3 OR
  // scheduled today OR due ≤ today, while the Today page lists every open non-someday task.
  const tasks = [
    task({ id: 'top3', top3: true }),
    task({ id: 'dueToday', due_at: at(0) }),
    task({ id: 'overdue', due_at: at(-3) }),
    task({ id: 'scheduledToday', scheduled_start: at(0, 15), scheduled_end: at(0, 16) }),
    task({ id: 'in5days', due_at: at(5) }),
    task({ id: 'undated' }),
    task({ id: 'in20days', due_at: at(20) }),
    task({ id: 'someday', someday: true }),
    task({ id: 'doneToday', status: 'done', completed_at: at(0, 8) }),
    task({ id: 'doneYesterday', status: 'done', completed_at: at(-1, 20) }),
  ]

  // What TodayPage.tsx renders, restated independently: its `visible` filter.
  const todayPageRows = (list: Task[], now: Date) => {
    const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
    return list.filter((t) => !t.someday && (!t.completed_at || key(new Date(t.completed_at)) === key(now)))
  }

  it('lists every open non-someday task, dated or not, plus the ones finished today', () => {
    const ids = todayListTasks(tasks, NOW).map((t) => t.id)
    expect(ids.sort()).toEqual(['doneToday', 'dueToday', 'in20days', 'in5days', 'overdue', 'scheduledToday', 'top3', 'undated'])
  })

  it("is the Today page's row set for ordinary tasks (TodayPage now calls it directly)", () => {
    expect(todayListTasks(tasks, NOW)).toEqual(todayPageRows(tasks, NOW))
  })

  it('never lists a cancelled task, or a done task with no completion time (e.g. a CSV import), as open', () => {
    const odd = [
      task({ id: 'cancelled', status: 'cancelled' }),
      task({ id: 'doneNoTime', status: 'done', completed_at: null }),
      task({ id: 'open' }),
    ]
    expect(todayListTasks(odd, NOW).map((t) => t.id)).toEqual(['open'])
    expect(todayOpenCount(odd, NOW)).toBe(1)
  })

  it('the badge counts the listed rows that are still open — not the done-today row, never someday', () => {
    expect(todayOpenCount(tasks, NOW)).toBe(7)
    expect(todayOpenCount(tasks, NOW)).toBe(todayPageRows(tasks, NOW).filter((t) => !t.completed_at).length)
  })

  it('differs from the Due Today smart list — the drift this fixes', () => {
    expect(filterByList(tasks, 'today', NOW).length).toBe(4)
    expect(todayOpenCount(tasks, NOW)).not.toBe(filterByList(tasks, 'today', NOW).length)
  })

  it('ticking a task off drops the badge by one while the row stays listed', () => {
    const ticked = tasks.map((t) => (t.id === 'in5days' ? { ...t, status: 'done' as const, completed_at: at(0, 14) } : t))
    expect(todayOpenCount(ticked, NOW)).toBe(6)
    expect(todayListTasks(ticked, NOW).map((t) => t.id)).toContain('in5days')
  })

  it("'finished today' is Cairo's day: 00:30 Cairo is today, 23:30 Cairo the night before is not", () => {
    const edge = [
      task({ id: 'justAfterMidnight', status: 'done', completed_at: '2026-07-08T00:30:00+03:00' }),
      task({ id: 'lateYesterday', status: 'done', completed_at: '2026-07-07T23:30:00+03:00' }),
    ]
    expect(todayListTasks(edge, NOW).map((t) => t.id)).toEqual(['justAfterMidnight'])
    expect(todayOpenCount(edge, NOW)).toBe(0)
  })

  it('an empty garden counts 0', () => {
    expect(todayOpenCount([], NOW)).toBe(0)
  })
})

describe("isTodayTask (Today's tasks vs Also open, Kai 2026-10-22)", () => {
  it('due today or on the calendar today is today; overdue, later and undated are not', () => {
    expect(isTodayTask(task({ due_at: at(0, 23) }), NOW)).toBe(true)
    expect(isTodayTask(task({ scheduled_start: at(0, 18) }), NOW)).toBe(true)
    expect(isTodayTask(task({ due_at: at(3), scheduled_start: at(0, 10) }), NOW)).toBe(true) // planned today, due later
    expect(isTodayTask(task({ due_at: at(-1) }), NOW)).toBe(false)
    expect(isTodayTask(task({ due_at: at(1, 0) }), NOW)).toBe(false) // just past midnight, Cairo
    expect(isTodayTask(task({}), NOW)).toBe(false)
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

describe('a paused series (Perennials ‖) rests off every list (Kai 2026-10-12 audit)', () => {
  const paused = task({ id: 'p', recurrence_rule: 'FREQ=DAILY', due_at: NOW.toISOString(), paused: true })
  const live = task({ id: 'l', recurrence_rule: 'FREQ=DAILY', due_at: NOW.toISOString() })
  it('no smart list shows it, All included', () => {
    for (const list of ['today', 'week', 'month', 'all', null] as const) {
      expect(filterByList([paused, live], list, NOW).map((t) => t.id), String(list)).toEqual(['l'])
    }
  })
  it('Today and its badge leave it out; the rail scopes too', () => {
    expect(todayListTasks([paused, live], NOW).map((t) => t.id)).toEqual(['l'])
    expect(todayOpenCount([paused, live], NOW)).toBe(1)
    expect(filterByScope([paused, live], { kind: 'smart', id: 'today' }, NOW).map((t) => t.id)).toEqual(['l'])
  })
})
