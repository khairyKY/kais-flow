// The Now card's state — MK Now Card.dc.html (the NOW slip on a phone) and Today.dc.html 2a's "Now"
// card on desktop read the same thing: what is under way. DS-CHANGELOG §3 NOW slip states:
//
//   done     a Now item just checked off — struck through with Undo while the toast is up
//   paused   the focus round is paused — hairline ring, time frozen
//   running  a block is running (start ≤ now < end) — the ring fills with the time spent
//   over     a task's block ended and the task is still open — amber, "+20"
//
// Earlier rows win; null = nothing under way. deviation(2026-10-12 ruling): MK Now Card also draws
// "Next" (≤ 15 min, a count-down) and "Free" (a gap → pick from Top 3). Kai ruled the card away
// during an idle day (2026-09-27 "no card during the day"; 2026-09-28 the slip "only while something
// runs", ROADMAP v1.0.10), so neither is built — Up next and the Top 3 already say what's next.
// Pure: the page feeds it the calendar, its tasks, the focus store and the clock. Every day rule is
// the user's zone (cairoDateKey reads lib/appZone; the name is historical).
import { cairoDateKey } from '../../lib/dateShortcuts'
import { runningBlock, type Block } from './todayLayout'

/** A block that ran over stops being "now" after this long (it then reads as a missed block on the
 * calendar). ponytail: fixed, a setting if Kai wants longer. */
export const OVER_FOR_MIN = 60
/** "Just done · with Undo toast": the toast's 4s dwell + its exit (lib/undo, ToastHost). */
export const JUST_DONE_MS = 4200

export interface NowTask {
  id: string
  status: string
  completed_at: string | null
}

/** The focus store, as the card reads it. */
export interface FocusNow {
  taskId: string
  running: boolean
  /** Seconds left in the round (frozen while paused). */
  secondsLeft: number
  roundSeconds: number
  /** When this device saw it paused (ms), if it did. */
  pausedAt: number | null
}

export type NowKind = 'done' | 'paused' | 'running' | 'over'

export type NowState<E, T> =
  | { kind: 'done'; task: T; block?: E; at: Date }
  | { kind: 'paused'; task: T; block?: E; leftMin: number; pct: number; since: Date | null }
  | { kind: 'running'; block: E; task?: T; leftMin: number; pct: number }
  | { kind: 'over'; block: E; task: T; overMin: number }

export interface NowInput<E, T> {
  events: readonly E[]
  taskOf: (id: string) => T | undefined
  /** The page's minute clock. */
  now: Date
  /** The wall clock (ms) for the Just done window — the minute clock is too coarse for 4s. */
  clockMs?: number
  focus?: FocusNow | null
}

const ms = (iso: string) => new Date(iso).getTime()
const MIN = 60_000
const isDone = (t: NowTask) => t.status === 'done' || !!t.completed_at

export function nowState<E extends Block, T extends NowTask>(i: NowInput<E, T>): NowState<E, T> | null {
  const t = i.now.getTime()
  const clock = i.clockMs ?? t
  const today = cairoDateKey(i.now)
  // Today's timed blocks, and one that began before today but still runs.
  const timed = i.events.filter((e) => !e.all_day && (cairoDateKey(new Date(e.starts_at)) === today || (ms(e.starts_at) <= t && t < ms(e.ends_at))))
  const taskOf = (e: E) => (e.task_id ? i.taskOf(e.task_id) : undefined)
  const doneIds = new Set(timed.flatMap((e) => { const k = taskOf(e); return k && isDone(k) ? [k.id] : [] }))

  // 1 · Just done: a task the card was about (its block running or just over; the focus task)
  // finished inside the toast's window.
  const near = timed.filter((e) => ms(e.starts_at) <= t && ms(e.ends_at) > t - OVER_FOR_MIN * MIN)
  const subjects = [...near.map((e) => [taskOf(e), e] as const), ...(i.focus ? [[i.taskOf(i.focus.taskId), undefined] as const] : [])]
  let done: { task: T; block?: E; at: number } | null = null
  for (const [k, e] of subjects) {
    if (!k?.completed_at) continue
    const at = ms(k.completed_at)
    if (clock - at < 0 || clock - at >= JUST_DONE_MS) continue
    if (!done || at > done.at) done = { task: k, block: e, at }
  }
  if (done) return { kind: 'done', task: done.task, block: done.block, at: new Date(done.at) }

  // 2 · Paused focus — a round paused inside a work block (a time block, its own task's block) is
  // the moment; a meeting, or another task's block, running now outranks it.
  const run = runningBlock(timed, i.now, doneIds)
  const f = i.focus
  const focusTask = f ? i.taskOf(f.taskId) : undefined
  const runOutranks = !!run && (run.task_id ? run.task_id !== f?.taskId : run.type === 'event')
  if (f && !f.running && focusTask && !isDone(focusTask) && !runOutranks) {
    const pct = Math.round(Math.min(1, Math.max(0, 1 - f.secondsLeft / Math.max(1, f.roundSeconds))) * 100)
    return { kind: 'paused', task: focusTask, block: run ?? undefined, leftMin: Math.max(1, Math.ceil(f.secondsLeft / 60)), pct, since: f.pausedAt != null ? new Date(f.pausedAt) : null }
  }

  // 3 · Running.
  if (run) {
    const start = ms(run.starts_at)
    const end = ms(run.ends_at)
    return { kind: 'running', block: run, task: taskOf(run), leftMin: Math.max(1, Math.ceil((end - t) / MIN)), pct: Math.round(((t - start) / Math.max(1, end - start)) * 100) }
  }

  // 4 · Running over: the task block that ended last, its task still open, nothing started since.
  const over = timed
    .filter((e) => { const k = taskOf(e); return !!k && !isDone(k) && ms(e.ends_at) <= t && t - ms(e.ends_at) < OVER_FOR_MIN * MIN })
    .sort((a, b) => ms(b.ends_at) - ms(a.ends_at))[0]
  if (over && !timed.some((e) => e !== over && ms(e.starts_at) >= ms(over.ends_at) && ms(e.starts_at) <= t)) {
    return { kind: 'over', block: over, task: taskOf(over)!, overMin: Math.max(1, Math.round((t - ms(over.ends_at)) / MIN)) }
  }
  return null
}

/** The block the card stands for (Up next skips it — each item once). */
export function nowBlock<E>(s: NowState<E, unknown> | null): E | null {
  return s && 'block' in s && s.block ? s.block : null
}
