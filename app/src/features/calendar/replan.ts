import { addDays, busyOnDay, freeSlots } from '../../components/pickerMath'
import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent, Task } from '../../lib/types'
import { scheduleSlots, spanIso } from './phoneGridMath'

// ── Kai 2026-10-07: the calendar's planning rail (Overdue · Today · Inbox, Akiflow's sidebar) and
// where a replanned task's blocks go. Pure — the writes are calendar/api's placeTask /
// replanTaskBlocks. Days are the user's (lib/appZone), like every Today / Overdue in the app. ──

const HALF_DAY = 12 * 3_600_000

/** The day a block sits on: a timed block's start; an all-day block's first date, read at its noon
 * (all-day starts are stored as UTC midnight or as the device's midnight, and noon is that date
 * either way). */
export function blockDay(e: Pick<CalendarEvent, 'starts_at' | 'all_day'>): string {
  const t = Date.parse(e.starts_at)
  return cairoDateKey(new Date(e.all_day ? t + HALF_DAY : t))
}

/** The day a block is over: the day of its last minute (an all-day block's last date). */
export function blockLastDay(e: Pick<CalendarEvent, 'ends_at' | 'all_day'>): string {
  return cairoDateKey(new Date(Date.parse(e.ends_at) - (e.all_day ? HALF_DAY : 1)))
}

const latestFirst = (blocks: readonly CalendarEvent[]): CalendarEvent[] => [...blocks].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
const dayDiff = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export interface RailTask {
  task: Task
  /** Its latest live block — for an overdue task, the missed one a drop or a Plan moves. */
  block: CalendarEvent | null
  /** Whole days since it was missed (0 in Today). */
  late: number
}

/** The rail's two task lists. A task on the calendar today or later is planned and in neither.
 * - Overdue: open, and its due date or its last block is before today (a block that ended before
 *   today unfinished — the one that used to sit "stuck" in the past).
 * - Today: open, due today or in the Top 3, with no time on the calendar yet. */
export function railBuckets(tasks: readonly Task[], events: readonly CalendarEvent[], now: Date): { overdue: RailTask[]; today: RailTask[] } {
  const today = cairoDateKey(now)
  const byTask = new Map<string, CalendarEvent[]>()
  for (const e of events) if (e.task_id && !e.deleted_at) byTask.set(e.task_id, [...(byTask.get(e.task_id) ?? []), e])
  const overdue: RailTask[] = []
  const todays: RailTask[] = []
  for (const task of tasks) {
    if (task.status !== 'todo' || task.someday || task.deleted_at) continue
    const own = latestFirst(byTask.get(task.id) ?? [])
    if (own.some((e) => blockLastDay(e) >= today)) continue
    const block = own[0] ?? null
    const due = task.due_at ? cairoDateKey(new Date(task.due_at)) : null
    const missed = [due, block && blockLastDay(block)].filter((d): d is string => !!d && d < today).sort().at(-1)
    if (missed) overdue.push({ task, block, late: dayDiff(missed, today) })
    else if (due === today || task.top3) todays.push({ task, block: null, late: 0 })
  }
  const dueMs = (r: RailTask) => (r.task.due_at ? Date.parse(r.task.due_at) : Infinity)
  overdue.sort((a, b) => b.late - a.late || dueMs(a) - dueMs(b))
  todays.sort((a, b) => dueMs(a) - dueMs(b))
  return { overdue, today: todays }
}

/** A rail item's length on the grid: its missed block's, else its estimate, else 30 minutes. */
export function railMinutes(r: Pick<RailTask, 'task' | 'block'>): number {
  if (r.block && !r.block.all_day) return Math.round((Date.parse(r.block.ends_at) - Date.parse(r.block.starts_at)) / 60_000)
  return r.task.duration_min || 30
}

export interface BlockMoves {
  /** Where the task's block goes: `block` moves there, or a new one is made (null). */
  place: { block: CalendarEvent | null; starts_at: string; ends_at: string } | null
  /** The block that stays put (a date-only replan onto its own day). */
  keep: CalendarEvent | null
  /** Blocks that come off the calendar. */
  clear: CalendarEvent[]
}

/** A task put on the calendar at [startsAt, endsAt): its latest block moves there and any other
 * comes off — a replan never leaves a duplicate or a stale block behind. */
export function placeMoves(blocks: readonly CalendarEvent[], startsAt: string, endsAt: string): BlockMoves {
  const [block = null, ...rest] = latestFirst(blocks)
  return { place: { block, starts_at: startsAt, ends_at: endsAt }, keep: null, clear: rest }
}

/** THE RULE (Kai 2026-10-07, as in Akiflow): a task given a time is on the calendar; a date alone
 * isn't. For a replan of the task's date (any menu, the task sheet, the editor):
 * - no date → its blocks come off the calendar;
 * - a time → one block at that time (its latest block moves there keeping its length, else a new
 *   one of its estimate, 30 minutes by default);
 * - a date only → it waits in that day's list: a block already on that day stays, any other
 *   block (the stuck one from a missed day) comes off. */
export function replanMoves(blocks: readonly CalendarEvent[], dueAt: string | null, timed: boolean, durationMin: number | null): BlockMoves {
  const sorted = latestFirst(blocks)
  if (!dueAt) return { place: null, keep: null, clear: sorted }
  if (timed) {
    const block = sorted[0]
    const len = block && !block.all_day ? Date.parse(block.ends_at) - Date.parse(block.starts_at) : (durationMin || 30) * 60_000
    return placeMoves(sorted, dueAt, new Date(Date.parse(dueAt) + len).toISOString())
  }
  const day = cairoDateKey(new Date(dueAt))
  const keep = sorted.find((e) => blockDay(e) === day) ?? null
  return { place: null, keep, clear: sorted.filter((e) => e !== keep) }
}

/** A due date already missed follows a block placed today or later: the replan is the plan now, so
 * the task stops reading "Overdue" everywhere else too. */
export function dueFollows(dueAt: string | null, startsAt: string, now: Date): boolean {
  const today = cairoDateKey(now)
  return !!dueAt && cairoDateKey(new Date(dueAt)) < today && cairoDateKey(new Date(startsAt)) >= today
}

/** Plan ▸ Next free slot: the first `dur`-minute gap today from now, else the next days' (the phone
 * Schedule sheet's own slots). */
export function nextFreeSlot(events: readonly CalendarEvent[], now: Date, dur: number): { starts_at: string; ends_at: string } | null {
  const s = scheduleSlots(events, now, dur).slots[0]
  return s ? spanIso({ day: s.day, start: s.start, end: s.start + dur }) : null
}

/** Plan ▸ Tomorrow first thing: tomorrow's first `dur`-minute gap from 08:00, else 09:00. */
export function tomorrowFirst(events: readonly CalendarEvent[], now: Date, dur: number): { starts_at: string; ends_at: string } {
  const day = addDays(cairoDateKey(now), 1)
  const start = freeSlots(busyOnDay(events, day), day, now, dur, 1)[0]?.start ?? 9 * 60
  return spanIso({ day, start, end: start + dur })
}
