// design-export/Calendar.dc.html §4 "Collapsed calendar — the unscheduled rail takes over" (planning
// mode, 4a one day · 4b two days), the pure half: which tasks the swollen rail lists (All · Today ·
// Overdue), their order (Sort ↕), the per-project groups with their totals, and the strip's free gaps
// and the footer's counts. Days are the user's (lib/appZone). It replaces the parked Planning board.

import { addDays, busyOnDay, freeSlots } from '../../components/pickerMath'
import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../../lib/types'
import { blockLastDay, railBuckets, railMinutes, type RailTask } from './replan'
import { cairoToIso } from './eventTime'

export type PlanTab = 'all' | 'today' | 'overdue'
export type PlanSort = 'due' | 'priority' | 'length' | 'title'

export const PLAN_SORTS: { value: PlanSort; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'length', label: 'Shortest first' },
  { value: 'title', label: 'A–Z' },
]

/** "Unscheduled" (conductor 2026-10-13): every open task — not done, not cancelled, not trashed, not
 * Someday — with no block on the calendar today or later (a block it missed on an earlier day doesn't
 * count: it is unscheduled again, in Overdue). Today and Overdue are the rail's own lists
 * (replan.railBuckets); All is those plus every other such task, each once. */
export function planningTasks(tasks: readonly Task[], events: readonly CalendarEvent[], now: Date, tab: PlanTab): RailTask[] {
  const { overdue, today } = railBuckets(tasks, events, now)
  if (tab === 'overdue') return overdue
  if (tab === 'today') return today
  const day = cairoDateKey(now)
  const placed = new Set<string>()
  for (const e of events) if (e.task_id && !e.deleted_at && blockLastDay(e) >= day) placed.add(e.task_id)
  const listed = new Set([...overdue, ...today].map((r) => r.task.id))
  const rest = tasks
    .filter((t) => t.status === 'todo' && !t.someday && !t.deleted_at && !placed.has(t.id) && !listed.has(t.id))
    .map((task) => ({ task, block: null, late: 0 }))
  return [...overdue, ...today, ...rest]
}

const dueMs = (r: RailTask) => (r.task.due_at ? Date.parse(r.task.due_at) : Infinity)
const byTitle = (a: RailTask, b: RailTask) => a.task.title.localeCompare(b.task.title)

/** Sort ↕. Due date: the most overdue first, then by due date (none last). Priority: !!! first.
 * Shortest first: the quick wins. A–Z. Ties fall back to the due date, then the title. */
export function sortPlan(rows: readonly RailTask[], sort: PlanSort): RailTask[] {
  const due = (a: RailTask, b: RailTask) => b.late - a.late || dueMs(a) - dueMs(b) || byTitle(a, b)
  const cmp: Record<PlanSort, (a: RailTask, b: RailTask) => number> = {
    due,
    priority: (a, b) => (a.task.priority ?? 9) - (b.task.priority ?? 9) || due(a, b),
    length: (a, b) => railMinutes(a) - railMinutes(b) || due(a, b),
    title: (a, b) => byTitle(a, b) || due(a, b),
  }
  return [...rows].sort(cmp[sort])
}

/** "1h 30m" · "6h 30m" · "45m" · "1h" — the frame's totals. */
export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

export interface PlanGroup<K extends string = string> {
  key: K | 'none'
  rows: RailTask[]
  minutes: number
}

/** 4a's groups: one per place (`placeOf` — the task's project, area…), in the order their first task
 * comes in the sorted list, "No project" last. Each with its count and total length. */
export function groupPlan(rows: readonly RailTask[], placeOf: (t: Task) => string | null): PlanGroup[] {
  const groups = new Map<string, PlanGroup>()
  for (const r of rows) {
    const key = placeOf(r.task) ?? 'none'
    const g = groups.get(key) ?? { key, rows: [], minutes: 0 }
    g.rows.push(r)
    g.minutes += railMinutes(r)
    groups.set(key, g)
  }
  const none = groups.get('none')
  groups.delete('none')
  return [...groups.values(), ...(none ? [none] : [])]
}

/** "12 tasks · 6h 30m total" */
export function totalLine(rows: readonly RailTask[]): string {
  const n = rows.length
  return `${n} ${n === 1 ? 'task' : 'tasks'} · ${minutesLabel(rows.reduce((s, r) => s + railMinutes(r), 0))} total`
}

/** Timed, live, busy blocks on `day` (the footers' "4 blocked today"). A Free event blocks nothing (p7e A15). */
export function blockedOn(events: readonly CalendarEvent[], day: string): number {
  return events.filter((e) => !e.deleted_at && !e.all_day && e.busy !== false && cairoDateKey(new Date(e.starts_at)) === day).length
}

/** The free minutes left on `day`: every gap between busy blocks inside 08:00–20:00, from now on
 * (pickerMath.freeSlots — past and off-hours time and Free events don't count), to the half hour
 * past the first hour. The footers' "6h free". */
export function freeLeft(events: readonly CalendarEvent[], day: string, now: Date): number {
  const free = freeSlots(busyOnDay(events, day), day, now, 15, 48).reduce((s, g) => s + g.end - g.start, 0)
  return free >= 60 ? Math.round(free / 30) * 30 : free
}

/** The strip's free stretches on `day` worth planting into: the gaps between busy blocks inside
 * 08:00–20:00 (pickerMath.freeSlots — from now on, today; a past day has none) of at least `min`
 * minutes — an hour by default, so a one-hour task's slot shows (conductor 2026-10-13) — as instants,
 * with their "2h free" label. deviation(2026-10-13): 4a also marks a gap before the now-line; a gap in
 * the past can't be planted into, so it isn't marked. */
export function freeGaps(events: readonly CalendarEvent[], day: string, now: Date, min = 60): { start: string; end: string; label: string; minutes: number }[] {
  return freeSlots(busyOnDay(events, day), day, now, 15, 48)
    .filter((s) => s.end - s.start >= min)
    .map((s) => ({ start: at(day, s.start), end: at(day, s.end), label: `${minutesLabel(s.end - s.start)} free`, minutes: s.end - s.start }))
}

const at = (day: string, m: number) => cairoToIso(day, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)

/** The footer's second line: "4 blocked today · 6h free" (one day) or "4 blocked today · 3 blocked
 * tomorrow" (two). The free time is every gap left on the first day, from now. */
export function footerLine(events: readonly CalendarEvent[], days: readonly string[], now: Date): string {
  const today = cairoDateKey(now)
  const word = (d: string) => (d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }))
  const first = `${blockedOn(events, days[0])} blocked ${word(days[0])}`
  if (days.length > 1) return `${first} · ${blockedOn(events, days[1])} blocked ${word(days[1])}`
  return `${first} · ${minutesLabel(freeLeft(events, days[0], now))} free`
}

/** A card's due word (4a): "Due today" · "Due tomorrow" · "Due Mon" (this coming week) · "Due Jul 18";
 * 4b's one-line card says "tmrw". */
export function dueWord(dueIso: string, now: Date, short = false): string {
  const today = cairoDateKey(now)
  const day = cairoDateKey(new Date(dueIso))
  const noon = new Date(`${day}T12:00:00Z`)
  if (day === today) return 'Due today'
  if (day === addDays(today, 1)) return short ? 'Due tmrw' : 'Due tomorrow'
  if (day > today && day < addDays(today, 7)) return `Due ${noon.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}`
  return `Due ${noon.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

/** What FullCalendar drops for a rail / planning card: its title and length (`data-*`). `create: false`:
 * the drop only reports (CalendarGrid's `drop` → gridDrop writes the block); left at FullCalendar's default
 * it also added its own copy of the card to the grid, which stayed drawn whenever the drop wrote nothing —
 * a task let go inside the Time block already holding it showed twice (shot-bugs, Kai 2026-10-27). */
export function cardDragData(el: HTMLElement): { title: string; duration: string; create: false } {
  const min = Number(el.dataset.duration) || 30
  return { create: false, title: el.dataset.title ?? '', duration: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` }
}
