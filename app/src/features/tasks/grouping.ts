import { cairoDateKey } from '../../lib/dateShortcuts'
import type { Area, Project, Task } from '../../lib/types'
import { isTop3Today } from './top3Rule'
import { orderKey } from './manualOrder'

export type SmartList = 'today' | 'week' | 'month' | 'upcoming' | 'someday' | 'overdue' | 'all'

export const SMART_LISTS: readonly SmartList[] = ['today', 'week', 'month', 'upcoming', 'someday', 'overdue', 'all']

type Placed = { domain_id?: string | null; project_id?: string | null; area_id?: string | null }

/** A task's domain: its own, else its project's or area's (the Tasks page's domain chips, smart lists). */
export function effectiveDomainId(task: Placed, projects: readonly Pick<Project, 'id' | 'domain_id'>[], areas: readonly Pick<Area, 'id' | 'domain_id'>[]): string | null {
  if (task.domain_id) return task.domain_id
  if (task.project_id) return projects.find((p) => p.id === task.project_id)?.domain_id ?? null
  if (task.area_id) return areas.find((a) => a.id === task.area_id)?.domain_id ?? null
  return null
}

/** Calendar-day difference from `a` to `b` (positive = b is later), computed on local day keys
 * so a task due 23:00 today reads as day 0, not "tomorrow" via a raw ms comparison. */
function dayDiff(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split('-').map(Number)
  const [by, bm, bd] = bKey.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** A task's bucketing date: its due date, else its scheduled block. Null = undated backlog. */
export function taskDayDiff(task: Pick<Task, 'due_at' | 'scheduled_start'>, now: Date): number | null {
  const iso = task.due_at ?? task.scheduled_start
  if (!iso) return null
  return dayDiff(cairoDateKey(now), cairoDateKey(new Date(iso)))
}

function isScheduledToday(task: Task, now: Date): boolean {
  return !!task.scheduled_start && cairoDateKey(new Date(task.scheduled_start)) === cairoDateKey(now)
}

/** Day-offset of this month's last day from today — the upper bound for the "month" list. */
function monthEndDiff(now: Date): number {
  const [y, m, d] = cairoDateKey(now).split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d
}

/**
 * The set of tasks a smart list shows. Also the source of its count badge — so a task
 * counted here is a task the list will render, no drift. Someday tasks appear only in the
 * `someday` list and are excluded from every other list (and the default) entirely.
 */
export function filterByList(tasks: Task[], list: SmartList | null, now: Date = new Date()): Task[] {
  // A paused series (Perennials ‖) rests on the Perennials page until it's resumed — no list shows it.
  const open = tasks.filter((t) => t.status === 'todo' && !t.paused)
  // Punch 27: `all` is every open task — dated, undated (project filings), and someday alike.
  // It's the one list where nothing can hide; groupTasks gives undated rows their own
  // "No date" group so a fresh Inbox filing is findable in seconds.
  if (list === 'all') return open
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
        return isTop3Today(t, now) || isScheduledToday(t, now) || (diff !== null && diff <= 0)
      case 'week':
        return diff !== null && diff <= 6
      case 'month':
        return diff !== null && diff <= monthEnd
      case 'upcoming':
        return diff !== null && diff > monthEnd
    }
  })
}

/**
 * The rows the Today page lists — its Top-3 section plus "All open" (TodayPage.tsx's `visible`
 * set, verbatim): every non-someday task that isn't finished, plus the ones finished *today*,
 * which stay on the page struck through (A3). Done-ness is `completed_at`, exactly as Today
 * renders it. Unlike the `today` smart list above, it isn't date-bounded: Today is the whole
 * open garden, not "due ≤ today".
 *
 * One selector for the page and its badge (conductor decision 2026-09-26: "the badge counts
 * exactly what Today shows"), so the two can't drift again (audit K-8, "Today badge drift").
 */
export function todayListTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const today = cairoDateKey(now)
  return tasks.filter((t) => {
    if (t.someday || t.status === 'cancelled' || (t.paused && !t.completed_at)) return false
    // Finished rows stay listed (struck through) on the Cairo day they were finished. A `done` row
    // with no completed_at (e.g. a CSV import) can't be placed on a day — never show it as open.
    if (t.completed_at) return cairoDateKey(new Date(t.completed_at)) === today
    return t.status !== 'done'
  })
}

/** The sidebar's Today badge: the rows `todayListTasks` lists that are still open — Today's open
 * Top-3 rows plus its "All open · N". Rows finished today stay listed (struck through) but aren't
 * counted: a badge counts what's left, so ticking a task off drops it by one. */
export function todayOpenCount(tasks: Task[], now: Date = new Date()): number {
  return todayListTasks(tasks, now).filter((t) => !t.completed_at).length
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
  const open = tasks.filter((t) => t.status === 'todo' && !t.someday && !t.paused)
  switch (scope.kind) {
    case 'project':
      return open.filter((t) => t.project_id === scope.id)
    case 'area':
      return open.filter((t) => t.area_id === scope.id)
    case 'domain':
      return open.filter((t) => t.domain_id === scope.id)
  }
}

export type GroupKey = 'overdue' | 'today' | 'scheduled' | 'tomorrow' | 'week' | 'later' | 'unplanned' | 'someday'

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
  // Punch 27: undated tasks get their own group instead of hiding inside "Later",
  // so a project filing with no date is visible the moment it lands.
  { key: 'unplanned', label: 'No date' },
  { key: 'someday', label: 'Someday' },
]

function bucketOf(task: Task, now: Date): GroupKey {
  if (task.someday) return 'someday'
  if (isScheduledToday(task, now)) return 'scheduled'
  const diff = taskDayDiff(task, now)
  if (diff === null) return 'unplanned'
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 6) return 'week'
  return 'later'
}

/** Buckets tasks into ordered, non-empty display groups. Overdue sorts oldest-first (the
 * age-sorted confrontation the phase wants); other groups keep due-ascending order. A task moved
 * with ⌘↑/↓ sorts by its manual order instead (./manualOrder, 0076), on the same scale. */
export function groupTasks(tasks: Task[], now: Date = new Date()): TaskGroup[] {
  const open = tasks.filter((t) => t.status === 'todo')
  const byKey = new Map<GroupKey, Task[]>()
  for (const task of open) {
    const key = bucketOf(task, now)
    const arr = byKey.get(key) ?? []
    arr.push(task)
    byKey.set(key, arr)
  }

  return GROUP_ORDER.flatMap(({ key, label }) => {
    const groupTasksArr = byKey.get(key)
    if (!groupTasksArr || groupTasksArr.length === 0) return []
    groupTasksArr.sort((a, b) => orderKey(a) - orderKey(b)) // oldest-first everywhere; overdue = most negative first
    const totalMinutes = groupTasksArr.reduce((sum, t) => sum + (t.duration_min ?? 0), 0)
    return [{ key, label, tasks: groupTasksArr, totalMinutes }]
  })
}
