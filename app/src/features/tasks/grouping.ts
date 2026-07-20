import { localDateKey } from '../routines/streaks'
import { daysUntilNextMonday } from '../../lib/dateShortcuts'
import type { Task } from '../../lib/types'

export type SmartList = 'today' | 'week' | 'month' | 'upcoming' | 'someday' | 'overdue'

export const SMART_LISTS: readonly SmartList[] = ['today', 'week', 'month', 'upcoming', 'someday', 'overdue']

/** Calendar-day difference from `a` to `b` (positive = b is later), computed on local day keys
 * so a task due 23:00 today reads as day 0, not "tomorrow" via a raw ms comparison. */
function dayDiff(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split('-').map(Number)
  const [by, bm, bd] = bKey.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** A task's bucketing date: its due date, else its scheduled block. Null = undated backlog. */
function taskDayDiff(task: Task, now: Date): number | null {
  const iso = task.due_at ?? task.scheduled_start
  if (!iso) return null
  return dayDiff(localDateKey(now), localDateKey(new Date(iso)))
}

function isScheduledToday(task: Task, now: Date): boolean {
  return !!task.scheduled_start && localDateKey(new Date(task.scheduled_start)) === localDateKey(now)
}

/** Day-offset of this month's last day from today — the upper bound for the "month" list. */
function monthEndDiff(now: Date): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return dayDiff(localDateKey(now), localDateKey(end))
}

/**
 * The set of tasks a smart list shows. Also the source of its count badge — so a task
 * counted here is a task the list will render, no drift. Someday tasks appear only in the
 * `someday` list and are excluded from every other list (and the default) entirely.
 */
export function filterByList(tasks: Task[], list: SmartList | null, now: Date = new Date()): Task[] {
  const open = tasks.filter((t) => t.status === 'todo')
  if (list === 'someday') return open.filter((t) => t.someday)
  const pending = open.filter((t) => !t.someday)
  if (!list) return pending
  const monthEnd = monthEndDiff(now)
  return pending.filter((t) => {
    const diff = taskDayDiff(t, now)
    switch (list) {
      // R4-12 (2026-07-20 audit): Kai wants an overdue-only view — strictly past its date,
      // never today's work and never an undated backlog item.
      case 'overdue':
        return diff !== null && diff < 0
      case 'today':
        return t.top3 || isScheduledToday(t, now) || (diff !== null && diff <= 0)
      case 'week':
        return diff !== null && diff <= 6
      case 'month':
        return diff !== null && diff <= monthEnd
      case 'upcoming':
        return diff !== null && diff > monthEnd
    }
  })
}

export type RailScopeKind = 'smart' | 'project' | 'area' | 'domain'

export interface RailScope {
  kind: RailScopeKind
  id: string
}

/** The calendar rail's scope-able panel: any smart list, or any single project/area/domain,
 * over open tasks — reuses the same list engine `filterByList` already drives, per the phase's
 * own "filters over one list engine, not new pages" rule. Non-smart scopes exclude `someday`
 * (the rail is for placing work on the calendar, and someday tasks are explicitly parked). */
export function filterByScope(tasks: Task[], scope: RailScope, now: Date = new Date()): Task[] {
  if (scope.kind === 'smart') return filterByList(tasks, scope.id as SmartList, now)
  const open = tasks.filter((t) => t.status === 'todo' && !t.someday)
  switch (scope.kind) {
    case 'project':
      return open.filter((t) => t.project_id === scope.id)
    case 'area':
      return open.filter((t) => t.area_id === scope.id)
    case 'domain':
      return open.filter((t) => t.domain_id === scope.id)
  }
}

export type GroupKey = 'overdue' | 'today' | 'scheduled' | 'tomorrow' | 'week' | 'later' | 'someday'

export interface TaskGroup {
  key: GroupKey
  label: string
  tasks: Task[]
  /** Summed `duration_min` across the group, for the section header time total. */
  totalMinutes: number
}

const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'scheduled', label: 'Scheduled on calendar' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'someday', label: 'Someday' },
]

function bucketOf(task: Task, now: Date): GroupKey {
  if (task.someday) return 'someday'
  if (isScheduledToday(task, now)) return 'scheduled'
  const diff = taskDayDiff(task, now)
  if (diff === null) return 'later'
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 6) return 'week'
  return 'later'
}

/** Buckets tasks into ordered, non-empty display groups. Overdue sorts oldest-first (the
 * age-sorted confrontation the phase wants); other groups keep due-ascending order. */
export function groupTasks(tasks: Task[], now: Date = new Date()): TaskGroup[] {
  const open = tasks.filter((t) => t.status === 'todo')
  const byKey = new Map<GroupKey, Task[]>()
  for (const task of open) {
    const key = bucketOf(task, now)
    const arr = byKey.get(key) ?? []
    arr.push(task)
    byKey.set(key, arr)
  }

  const dateValue = (t: Task) => new Date(t.due_at ?? t.scheduled_start ?? 8.64e15).getTime()

  return GROUP_ORDER.flatMap(({ key, label }) => {
    const groupTasksArr = byKey.get(key)
    if (!groupTasksArr || groupTasksArr.length === 0) return []
    groupTasksArr.sort((a, b) => dateValue(a) - dateValue(b)) // oldest-first everywhere; overdue = most negative first
    const totalMinutes = groupTasksArr.reduce((sum, t) => sum + (t.duration_min ?? 0), 0)
    return [{ key, label, tasks: groupTasksArr, totalMinutes }]
  })
}

export type PlanningColumnKey = 'today' | 'tomorrow' | 'week' | 'nextWeek' | 'someday'

export interface PlanningColumn {
  key: PlanningColumnKey
  label: string
  tasks: Task[]
}

const PLANNING_COLUMN_ORDER: { key: PlanningColumnKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'nextWeek', label: 'Next week' },
  { key: 'someday', label: 'Someday' },
]

function planningBucketOf(task: Task, now: Date): PlanningColumnKey {
  if (task.someday) return 'someday'
  const diff = taskDayDiff(task, now)
  if (diff === null) return 'nextWeek' // undated backlog folds into the catch-all column
  if (diff <= 0) return 'today' // overdue lands in Today — the board is about placement, not confrontation
  if (diff === 1) return 'tomorrow'
  // "This week" boundary is the same coming-Monday `scheduleNextWeek` targets, not a fixed
  // diff<=6 — otherwise a task just dropped on Next week re-buckets into This week on most
  // weekdays (next Monday is often <6 days out), which is the bug this line fixes.
  if (diff < daysUntilNextMonday(now)) return 'week'
  return 'nextWeek'
}

/** The Upcoming planning board's 5 fixed columns — unlike `groupTasks`, empty columns are kept
 * (every column is a drop target, not just a display of what already has tasks). */
export function planningColumns(tasks: Task[], now: Date = new Date()): PlanningColumn[] {
  const open = tasks.filter((t) => t.status === 'todo')
  const byKey = new Map<PlanningColumnKey, Task[]>()
  for (const task of open) {
    const key = planningBucketOf(task, now)
    const arr = byKey.get(key) ?? []
    arr.push(task)
    byKey.set(key, arr)
  }
  const dateValue = (t: Task) => new Date(t.due_at ?? t.scheduled_start ?? 8.64e15).getTime()
  return PLANNING_COLUMN_ORDER.map(({ key, label }) => {
    const colTasks = (byKey.get(key) ?? []).sort((a, b) => dateValue(a) - dateValue(b))
    return { key, label, tasks: colTasks }
  })
}
