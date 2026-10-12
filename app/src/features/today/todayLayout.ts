// Today, each item once (Kai 2026-09-28; design-export/SCREENS-2026-09-28.md §Today, rulings 1–6):
// which block the NOW slip shows, what Up next still lists, what the fold's Open keeps, the meta a
// task row gets from its block, and the phone header's workload line. Pure — TodayPage feeds it what
// it already reads. Every clock rule reads Cairo's wall clock, whatever the device zone (B2).

import { cairoDateKey, cairoWallTimeToIso } from '../../lib/dateShortcuts'
import { daysToWeekend } from '../../lib/weekend'
import { cairoTimeKey } from '../calendar/eventTime'
import { filterByList, taskDayDiff } from '../tasks/grouping'
import { formatDuration } from '../tasks/taskDisplay'
import { isTop3Today } from '../tasks/top3Rule'
import type { Task } from '../../lib/types'
import type { DayPhase } from './dayPhase'
import type { NowKind } from './nowCard'
import { isInProgress, upNextEvents, type UpNextEvent } from './upNext'

export interface Block extends UpNextEvent {
  id: string
  task_id: string | null
  /** calendar_events.type — 'event' is a meeting, 'time_block' / 'task' are work. */
  type?: string
}

const ms = (iso: string) => new Date(iso).getTime()
const lengthMin = (b: UpNextEvent) => Math.round((ms(b.ends_at) - ms(b.starts_at)) / 60_000)
const untilMin = (b: UpNextEvent, now: Date) => Math.round((ms(b.starts_at) - now.getTime()) / 60_000)

/** The NOW slip's block: a timed block actually running (start ≤ now < end) whose task, if it has
 * one, isn't done. Overlapping blocks → the one that started last (what you just moved on to). */
export function runningBlock<E extends Block>(events: readonly E[], now: Date, doneTaskIds: ReadonlySet<string>): E | null {
  let best: E | null = null
  for (const e of events) {
    if (e.all_day || !isInProgress(e.starts_at, e.ends_at, now)) continue
    if (e.task_id && doneTaskIds.has(e.task_id)) continue
    if (!best || ms(e.starts_at) > ms(best.starts_at)) best = e
  }
  return best
}

/** Ruling 3: the slip and the ritual card never show together — while something is under way (a
 * block running or running over, a paused round, one just done: ./nowCard) the slip wins. Nothing
 * during an idle day (Kai 2026-09-27). An empty day shows neither. */
export function topCard(phase: DayPhase, now: NowKind | null, empty: boolean): 'slip' | 'plan' | 'shutdown' | 'closed' | null {
  if (now) return 'slip'
  if (empty || phase === 'now') return null
  return phase
}

/** Ruling 4: Up next = what's running or still to come today (upNext.ts), minus the slip's block
 * and any block of a Top 3 task — that task's row carries the block's time instead. */
export function upNextItems<E extends Block>(events: readonly E[], now: Date, slip: Block | null, top3Ids: ReadonlySet<string>): E[] {
  return upNextEvents(events, now).filter((e) => e.id !== slip?.id && !(e.task_id && top3Ids.has(e.task_id)))
}

/** A task's block today that hasn't ended yet (running, else the next), for its row's meta. */
export function blockOf<E extends Block>(taskId: string, events: readonly E[], now: Date): E | null {
  return upNextEvents(events, now).find((e) => e.task_id === taskId) ?? null
}

/** Within this many minutes a block's row says "starts in …" instead of its length. */
export const STARTS_SOON_MIN = 30

/** A block's meta on its task row (Today Phone 2b/2c goal card): "13:30–15:00", then "Now" while it
 * runs, "starts in 20M" within STARTS_SOON_MIN, else its length. */
export function blockMeta(b: UpNextEvent, now: Date): string[] {
  const range = `${cairoTimeKey(new Date(b.starts_at))}–${cairoTimeKey(new Date(b.ends_at))}`
  if (isInProgress(b.starts_at, b.ends_at, now)) return [range, 'Now']
  const until = untilMin(b, now)
  return [range, until <= STARTS_SOON_MIN ? `starts in ${formatDuration(until)}` : formatDuration(lengthMin(b))]
}

/** Ruling 5, the event rows' meta (Today Phone 2a/2b): each row its length; a running one "Now";
 * the first still to come also how far off it is ("1H30M · in 1H20M"). */
export function eventMetas(items: readonly UpNextEvent[], now: Date): string[][] {
  const next = items.find((e) => !isInProgress(e.starts_at, e.ends_at, now))
  return items.map((e) => {
    const len = formatDuration(lengthMin(e))
    if (isInProgress(e.starts_at, e.ends_at, now)) return [len, 'Now']
    return e === next ? [len, `in ${formatDuration(untilMin(e, now))}`] : [len]
  })
}

/** The fold's Open: Today's rows that aren't in Top 3 and aren't already shown as the slip or an Up
 * next block — each item once. */
export function foldOpen<T extends { id: string }>(rows: readonly T[], top3Ids: ReadonlySet<string>, shown: readonly Block[]): T[] {
  const shownIds = new Set(shown.map((b) => b.task_id))
  return rows.filter((t) => !top3Ids.has(t.id) && !shownIds.has(t.id))
}

export interface WorkItem {
  id: string
  duration_min: number | null
}

/** What's left of the day's plan (MK Workload): every open Top 3 (its block's remaining time, else
 * its duration) and every other block still to come today that isn't a done task's. It ends no
 * earlier than the last of those blocks; the finish is rounded up to the next 10 minutes. */
export function remainingWork(openTop3: readonly WorkItem[], events: readonly Block[], now: Date, doneTaskIds: ReadonlySet<string>): { minutes: number; finishAt: Date } {
  const t = now.getTime()
  const blocks = workBlocks(events, now, doneTaskIds)
  const minutes = workLeft(openTop3, blocks, t, Infinity)
  const lastEnd = Math.max(t, ...blocks.map((e) => ms(e.ends_at)))
  const finish = Math.max(t + minutes * 60_000, lastEnd)
  return { minutes: Math.round(minutes), finishAt: new Date(Math.ceil(finish / 600_000) * 600_000) }
}

const workBlocks = (events: readonly Block[], now: Date, doneTaskIds: ReadonlySet<string>) =>
  upNextEvents(events, now).filter((e) => !(e.task_id && doneTaskIds.has(e.task_id)))

/** Minutes of work left from `from` to `to`: every open Top 3 (its block's time in the window, else
 * its duration) plus every other block's time in the window. */
function workLeft(openTop3: readonly WorkItem[], blocks: readonly Block[], from: number, to: number): number {
  const left = (e: Block) => Math.max(0, Math.min(to, ms(e.ends_at)) - Math.max(from, ms(e.starts_at))) / 60_000
  const top3Ids = new Set(openTop3.map((w) => w.id))
  let minutes = 0
  for (const w of openTop3) {
    const b = blocks.find((e) => e.task_id === w.id)
    minutes += b ? left(b) : (w.duration_min ?? 0)
  }
  for (const e of blocks) if (!(e.task_id && top3Ids.has(e.task_id))) minutes += left(e)
  return minutes
}

/** `min` minutes past midnight today on the user's clock, as epoch ms (DST-safe: the tz database). */
function dayAt(now: Date, min: number): number {
  const [y, m, d] = cairoDateKey(now).split('-').map(Number)
  return Date.parse(cairoWallTimeToIso(y, m, d, Math.floor(min / 60), min % 60))
}

/** Today 2a's day ribbon runs 8 AM–8 PM. */
export const RIBBON_FROM_MIN = 8 * 60
export const RIBBON_TO_MIN = 20 * 60

/** Where an instant sits on today's ribbon, 0–100 (clamped). */
export function ribbonPct(at: number, now: Date): number {
  const from = dayAt(now, RIBBON_FROM_MIN)
  const to = dayAt(now, RIBBON_TO_MIN)
  return Math.min(100, Math.max(0, ((at - from) / (to - from)) * 100))
}

/** A block's place on the ribbon (left, width in %), clipped to 8–20; null when none of it is on it. */
export function ribbonSpan(b: UpNextEvent, now: Date): { left: number; width: number } | null {
  const left = ribbonPct(ms(b.starts_at), now)
  const width = ribbonPct(ms(b.ends_at), now) - left
  return b.all_day || width <= 0 ? null : { left, width }
}

/** The working day the workload is measured against — Plan my day's 09:00–18:00 (rituals/ritualLogic
 * DAY_FROM / DAY_TO; an 18:00 gym isn't workload). */
export const WORK_FROM_MIN = 9 * 60
export const WORK_TO_MIN = 18 * 60

/** MK Workload "over capacity": minutes of the plan that don't fit in what's left of today's working
 * day (from now, or 09:00, to 18:00, on the user's clock) — 0 when it fits. */
export function overCapacity(openTop3: readonly WorkItem[], events: readonly Block[], now: Date, doneTaskIds: ReadonlySet<string>): number {
  const from = Math.max(now.getTime(), dayAt(now, WORK_FROM_MIN))
  const to = dayAt(now, WORK_TO_MIN)
  const work = workLeft(openTop3, workBlocks(events, now, doneTaskIds), from, to)
  return Math.max(0, Math.round(work - Math.max(0, (to - from) / 60_000)))
}

/** "2 of 6 done" (Today 2a's summary, MK Workload's hairline): today's own work — the Top 3, what's
 * due or scheduled today — plus what was finished today. The overdue pile has its own fold and
 * isn't counted (Kai 2026-10-07: "More for today · 320"). */
export function dayCounts(tasks: Task[], now: Date): { done: number; total: number } {
  const today = cairoDateKey(now)
  const done = tasks.filter((t) => t.completed_at && cairoDateKey(new Date(t.completed_at)) === today).length
  const open = filterByList(tasks, 'today', now).filter((t) => isTop3Today(t, now) || (taskDayDiff(t, now) ?? 0) >= 0).length
  return { done, total: done + open }
}

/** The weekly review's day is the first day of the user's weekend (lib/weekend: Fri + Sat → Friday;
 * Sat + Sun by default). Today prompts it that day until the week is closed — a `review.week_closed`
 * in the last seven days (closing it earlier in the week counts). No weekend, no review day. */
export function reviewDue(now: Date, weekend: readonly number[], closedAt: readonly string[]): boolean {
  const key = cairoDateKey(now)
  if (daysToWeekend(new Date(`${key}T12:00:00Z`).getUTCDay(), weekend) !== 0) return false
  const day = (k: string) => Date.parse(`${k}T00:00:00Z`) / 86_400_000
  return !closedAt.some((c) => {
    const ago = day(key) - day(cairoDateKey(new Date(c)))
    return ago >= 0 && ago < 7
  })
}

/** "Today's three · 1h 30m planned": each pick's block today (its whole length), else its duration. */
export function top3Planned(picks: readonly WorkItem[], events: readonly Block[], now: Date): number {
  const today = cairoDateKey(now)
  return picks.reduce((sum, p) => {
    const b = events.find((e) => e.task_id === p.id && !e.all_day && cairoDateKey(new Date(e.starts_at)) === today)
    return sum + (b ? lengthMin(b) : (p.duration_min ?? 0))
  }, 0)
}

/** Ruling 1's "Day N": Cairo calendar days since the first record, that day being Day 1 — one
 * number all day long, whatever the hour. */
export function dayOfJourney(firstIso: string | null, now: Date): number {
  if (!firstIso) return 1
  const day = (d: Date) => Date.parse(`${cairoDateKey(d)}T00:00:00Z`) / 86_400_000
  return Math.max(1, day(now) - day(new Date(firstIso)) + 1)
}

/** Minutes of focus logged on today's Cairo date (time_entries). */
export function focusedToday(entries: readonly { started_at: string; duration_min: number }[], now: Date): number {
  const today = cairoDateKey(now)
  return entries.reduce((sum, e) => (cairoDateKey(new Date(e.started_at)) === today ? sum + e.duration_min : sum), 0)
}

/** "2h 10m" — the header's spoken length (the rows' meta keep formatDuration's "2H10M"). */
export function span(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

export interface WorkloadInput {
  /** Day N since the first record. */
  day: number
  phase: DayPhase
  /** Nothing planted and nothing on the calendar (Today Phone 2f). */
  empty: boolean
  /** Today's Top 3: picked (open + finished today) and finished. */
  top3: { picked: number; done: number }
  /** When the last Top 3 was finished. */
  top3DoneAt: string | null
  /** Tasks finished today. */
  doneToday: number
  remaining: { minutes: number; finishAt: Date }
  focusedMin: number
}

/** Ruling 1: the header's workload line ("Day 84 · …"), by state (Today Phone 2a–2i). */
export function workloadLine(i: WorkloadInput): string {
  const day = `Day ${i.day}`
  const focused = i.focusedMin > 0 ? ` · ${span(i.focusedMin)} focused` : ''
  if (i.empty) return `${day} · a fresh page`
  if (i.phase === 'closed') return `${day} · ${i.doneToday} done${focused}`
  if (i.phase === 'shutdown') return `${day} · ${i.top3.picked > 0 ? `${i.top3.done} of ${i.top3.picked}` : i.doneToday} done${focused}`
  if (i.phase === 'plan') return `${day} · not planned yet`
  if (i.top3.picked > 0 && i.top3.done >= i.top3.picked) {
    const by = i.top3DoneAt ? ` by ${cairoTimeKey(new Date(i.top3DoneAt))}` : ''
    return `${day} · ${i.top3.picked === 3 ? 'all three' : 'Top 3'} done${by}`
  }
  const m = i.remaining.minutes
  if (m > 0) {
    const size = m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`
    return `${day} · ~${size} ${i.doneToday > 0 ? 'left' : 'planned'} · you'll finish ~${cairoTimeKey(i.remaining.finishAt)}`
  }
  return `${day} · ${i.doneToday} done`
}
