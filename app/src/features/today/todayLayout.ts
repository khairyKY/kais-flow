// Today, each item once (Kai 2026-09-28; design-export/SCREENS-2026-09-28.md §Today, rulings 1–6):
// which block the NOW slip shows, what Up next still lists, what the fold's Open keeps, the meta a
// task row gets from its block, and the phone header's workload line. Pure — TodayPage feeds it what
// it already reads. Every clock rule reads Cairo's wall clock, whatever the device zone (B2).

import { cairoDateKey } from '../../lib/dateShortcuts'
import { cairoTimeKey } from '../calendar/eventTime'
import { formatDuration } from '../tasks/taskDisplay'
import type { DayPhase } from './dayPhase'
import { isInProgress, upNextEvents, type UpNextEvent } from './upNext'

export interface Block extends UpNextEvent {
  id: string
  task_id: string | null
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

/** Ruling 3: the slip and the ritual card never show together — while a block runs, the slip wins.
 * An empty day (nothing planted, nothing on the calendar) shows neither. */
export function topCard(phase: DayPhase, slip: Block | null, empty: boolean): 'slip' | 'plan' | 'shutdown' | 'closed' | null {
  if (slip) return 'slip'
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
  const blocks = upNextEvents(events, now).filter((e) => !(e.task_id && doneTaskIds.has(e.task_id)))
  const left = (e: Block) => (ms(e.ends_at) - Math.max(t, ms(e.starts_at))) / 60_000
  const top3Ids = new Set(openTop3.map((w) => w.id))
  let minutes = 0
  for (const w of openTop3) {
    const b = blocks.find((e) => e.task_id === w.id)
    minutes += b ? left(b) : (w.duration_min ?? 0)
  }
  for (const e of blocks) if (!(e.task_id && top3Ids.has(e.task_id))) minutes += left(e)
  const lastEnd = Math.max(t, ...blocks.map((e) => ms(e.ends_at)))
  const finish = Math.max(t + minutes * 60_000, lastEnd)
  return { minutes: Math.round(minutes), finishAt: new Date(Math.ceil(finish / 600_000) * 600_000) }
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
function span(min: number): string {
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
