// Today's ‹ › and date picker (Kai 2026-10-23: "he doesn't want to be stuck to the today page"): the
// pure half of looking at another day — which day `?day=` asks for, and what belongs to that day on
// the user's own clock (lib/appZone). No React; every function takes the zone, so it's tested in four.
// The day's plan is the evening ritual's seeds model (rituals/loopDay `ritual.seeded` for_date), not a
// second one: a future day's 3 are seeds for that date, which its morning ritual pre-selects.
import { appZone } from '../../lib/appZone'
import { zoneDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import { addDays } from '../../components/pickerMath'
import type { CalendarEvent, Task } from '../../lib/types'

/** The day `?day=` asks for, or null for today — missing, malformed (2026-02-31), or today itself. */
export function viewDay(raw: string | null, today: string): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || addDays(raw, 0) !== raw) return null
  return raw === today ? null : raw
}

/** Noon on `key`, the user's clock: a Date on that day for helpers that read "the day `now` is on". */
export function dayNoon(key: string, zone: string = appZone()): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(zoneWallTimeToIso(zone, y, m, d, 12))
}

/** [start, end) of `key` on the user's clock — a DST day is 23 or 25 hours, never 24 by arithmetic. */
export function dayBounds(key: string, zone: string = appZone()): { start: Date; end: Date } {
  const at = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(zoneWallTimeToIso(zone, y, m, d))
  }
  return { start: at(key), end: at(addDays(key, 1)) }
}

const on = (iso: string | null | undefined, key: string, zone: string) => !!iso && zoneDateKey(new Date(iso), zone) === key

/** That day's work: due that day, or on its calendar (a block, or a Time slot's hold) — Today's own
 * isTodayTask rule (tasks/grouping), for any day. */
export function isOnDay(t: Pick<Task, 'due_at' | 'scheduled_start'>, key: string, zone: string = appZone()): boolean {
  return on(t.due_at, key, zone) || on(t.scheduled_start, key, zone)
}

const live = (t: Task) => !t.deleted_at && !t.someday && !(t.paused && !t.completed_at)

/** A future day's tasks: the open ones on it, in date order (a block's time, else its due time). */
export function futureTasks(tasks: readonly Task[], key: string, zone: string = appZone()): Task[] {
  const at = (t: Task) => Date.parse(t.scheduled_start ?? t.due_at ?? '')
  return tasks.filter((t) => t.status === 'todo' && live(t) && isOnDay(t, key, zone)).sort((a, b) => at(a) - at(b))
}

/** A past day: what was finished on it (that day's picks first — completing keeps `top3_rank` — then
 * by when), and what was on it and is still open. */
export function pastTasks(tasks: readonly Task[], key: string, zone: string = appZone()): { done: Task[]; open: Task[] } {
  const rank = (t: Task) => t.top3_rank ?? Infinity
  const done = tasks
    .filter((t) => t.status === 'done' && !t.deleted_at && on(t.completed_at, key, zone))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(a.completed_at!) - Date.parse(b.completed_at!))
  return { done, open: futureTasks(tasks, key, zone) }
}

/** A past day as Today's page draws it (other-days look A): its Top 3 (the picks done that day, which keep
 * `top3_rank`, plus a pick still starred and open: slipped), the rest done, and the rest left open.
 * ponytail: a star lives on the task, not the day, so a task starred since still reads as that day's slipped pick. */
export function pastPlan(tasks: readonly Task[], key: string, zone: string = appZone()): { picks: Task[]; alsoDone: Task[]; open: Task[] } {
  const { done, open } = pastTasks(tasks, key, zone)
  const rank = (t: Task) => t.top3_rank ?? Infinity
  const picks = [...done.filter((t) => t.top3_rank != null), ...open.filter((t) => t.top3)].sort((a, b) => rank(a) - rank(b)).slice(0, 3)
  const ids = new Set(picks.map((t) => t.id))
  return { picks, alsoDone: done.filter((t) => !ids.has(t.id)), open: open.filter((t) => !ids.has(t.id)) }
}

/** The day's timed blocks, in start order — what its ribbon and its "On the calendar" list draw. A
 * block crossing midnight shows on both days; all-day ones stay off, as on Today (upNext). */
export function dayBlocks<E extends Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'> & { deleted_at?: string | null }>(events: readonly E[], key: string, zone: string = appZone()): E[] {
  const { start, end } = dayBounds(key, zone)
  return events
    .filter((e) => !e.all_day && !e.deleted_at && Date.parse(e.starts_at) < end.getTime() && Date.parse(e.ends_at) > start.getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

const fmt = (key: string, o: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })

/** The header of another day (other-days look A): "Tomorrow" / "Yesterday" with its date beside it, and any
 * further day as its short date with how far off it is ("Tue, Nov 3 · in 8 days"). `long` spells the
 * neighbours' date out for the desktop ("Tuesday, October 27"). The year shows when it isn't this one. */
export function dayTitle(key: string, today: string, style: 'short' | 'long'): { title: string; caption: string } {
  const year = key.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : null
  const off = dayOffset(key, today)
  if (Math.abs(off) === 1) {
    const date = style === 'long' ? { weekday: 'long' as const, month: 'long' as const } : { weekday: 'short' as const, month: 'short' as const }
    return { title: off === 1 ? 'Tomorrow' : 'Yesterday', caption: fmt(key, { ...date, day: 'numeric', ...year }) }
  }
  return { title: fmt(key, { weekday: 'short', month: 'short', day: 'numeric', ...year }), caption: off > 0 ? `in ${off} days` : `${-off} days ago` }
}

const dayOffset = (key: string, today: string) => Math.round((Date.parse(key) - Date.parse(today)) / 86_400_000)

/** "Tomorrow" / "Yesterday", else "Mon, Nov 3" — the phone strip's neighbours and the section names. */
export function dayName(key: string, today: string): string {
  if (key === addDays(today, 1)) return 'Tomorrow'
  if (key === addDays(today, -1)) return 'Yesterday'
  return fmt(key, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Tomorrow" / "Monday" within a week either way, else "The day" — "Monday's three", "The day's tasks". */
export function dayWord(key: string, today: string): string {
  const off = dayOffset(key, today)
  if (off === 1) return 'Tomorrow'
  if (off === -1) return 'Yesterday'
  return Math.abs(off) < 7 ? fmt(key, { weekday: 'long' }) : 'The day'
}

/** The capture bar's text for adding a task to `key`: the command bar's `<date` (P7e A6), the year
 * spelled out so chrono can't read it as last year's. */
export function captureFor(key: string): string {
  return `<${fmt(key, { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')} `
}
