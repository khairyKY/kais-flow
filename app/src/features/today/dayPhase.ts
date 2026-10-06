// The Day card's one decision: what is the next move right now? (Loop A, docs/DAILY-CYCLE.md,
// "Today = the loop's home" §1.) Pure — TodayPage feeds it what it already reads.
//
//   state                                                       card
//   ──────────────────────────────────────────────────────────  ─────────────────────────────
//   evening ritual finished today                               Day closed ✿ (tomorrow's seeds)
//   17:00 or later — not shut down                              Shut down the day · ~3 min
//   not planned, before 17:00                                   Plan your day · ~5 min
//   otherwise (planned)                                         Now — the next move (below)
//
//   planned = the morning ritual finished today, or ≥1 Top 3 picked and it's 12:00 or later, or
//   every picked Top 3 already done. Today Phone 2i (2026-09-28): a Top 3 finished early is a
//   quiet "All three tended" line, not a Shut down prompt — the evening card waits for 17:00.
//   Kai (2026-09-28, rituals): Plan my day is only ever today's plan; from 17:00 the card offers
//   Shut down, the one evening entry for tomorrow's 3 (no "Plan tomorrow").
//
//   Now's item: an event that is running or starts within NOW_SOON_MIN; otherwise the first
//   unfinished Top 3 (you can work it right now); otherwise the next event, however far off.
//
// Earlier rows win: a closed day stays closed; an evening is for shutting down even if the
// morning was never planned. All clock rules read the user's wall clock (app_settings.timezone,
// lib/appZone.ts), whatever the device zone — the app's one day boundary (B2).
//
// Kai's R4-5a pins still mean what they said ("should be able to choose whether they stay pinned"
// to Today): an unpinned ritual is never *prompted* by the card — its Plan / Shut down state falls
// through to Now. It stays one tap away in the card's ritual links and on Routines.
import { perZone } from '../../lib/appZone'

export type DayPhase = 'plan' | 'now' | 'shutdown' | 'closed'

export interface RitualState {
  /** Steps walked today. */
  done: number
  total: number
  /** Finished today. Defaults to every step walked. */
  finished?: boolean
}

export interface DayPhaseInput<E, T> {
  now: Date
  morning: RitualState
  evening: RitualState
  /** Today's Top 3: how many were picked (open + finished today) and how many are finished. */
  top3: { picked: number; done: number }
  /** The running or next Up next item still to do (Up next order), or null. */
  nextUp: E | null
  /** `nextUp` is running or starts within NOW_SOON_MIN. Defaults to true. */
  nextUpSoon?: boolean
  /** The first unfinished Top 3 task, or null. */
  firstOpenTop3: T | null
  /** Which rituals the card may prompt (R4-5a pins). Both by default. */
  prompts?: { morning: boolean; evening: boolean }
}

export type NowItem<E, T> = { kind: 'event'; event: E } | { kind: 'task'; task: T }

export type DayCardState<E, T> =
  | { phase: 'plan' }
  | { phase: 'now'; item: NowItem<E, T> | null }
  | { phase: 'shutdown' }
  | { phase: 'closed' }

/** Minutes since Cairo midnight: planning is "before 17:00", shutdown "from 17:00". */
export const PLANNED_BY_TOP3_FROM = 12 * 60
export const PLAN_UNTIL = 17 * 60
export const SHUTDOWN_FROM = 17 * 60
/** An event this close (minutes) outranks the Top 3 as Now's item. */
export const NOW_SOON_MIN = 30

const cairoClock = perZone((timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))

/** Minutes since midnight on the user's wall clock (lib/appZone.ts; the name is historical). */
export function cairoMinutes(now: Date): number {
  let h = 0
  let m = 0
  for (const p of cairoClock().formatToParts(now)) {
    if (p.type === 'hour') h = Number(p.value) % 24
    else if (p.type === 'minute') m = Number(p.value)
  }
  return h * 60 + m
}

export function ritualFinished(r: RitualState): boolean {
  return r.finished ?? (r.total > 0 && r.done >= r.total)
}

/** A ritual's step count, or ✓ once finished (the count is per calendar date, the finish per loop
 * day — so after midnight a closed evening would otherwise read 0/5). */
export function ritualProgress(r: RitualState): string {
  return ritualFinished(r) ? '✓' : `${r.done}/${r.total}`
}

export function isPlanned(input: Pick<DayPhaseInput<unknown, unknown>, 'now' | 'morning' | 'top3'>): boolean {
  const { picked, done } = input.top3
  return ritualFinished(input.morning) || (picked >= 1 && (done >= picked || cairoMinutes(input.now) >= PLANNED_BY_TOP3_FROM))
}

export function dayPhase<E, T>(input: DayPhaseInput<E, T>): DayCardState<E, T> {
  const prompts = input.prompts ?? { morning: true, evening: true }
  const minutes = cairoMinutes(input.now)
  if (ritualFinished(input.evening)) return { phase: 'closed' }
  if (prompts.evening && minutes >= SHUTDOWN_FROM) return { phase: 'shutdown' }
  if (prompts.morning && !isPlanned(input) && minutes < PLAN_UNTIL) return { phase: 'plan' }
  const soon = input.nextUp && (input.nextUpSoon ?? true)
  const item: NowItem<E, T> | null = soon && input.nextUp
    ? { kind: 'event', event: input.nextUp }
    : input.firstOpenTop3
      ? { kind: 'task', task: input.firstOpenTop3 }
      : input.nextUp
        ? { kind: 'event', event: input.nextUp }
        : null
  return { phase: 'now', item }
}

// ── The ritual step counts the card reads (RITUAL_STEP_COUNT denominators, rituals/api). ──

/** The morning ritual's time-block step has no Next/Finish of its own (MorningRitual.tsx renders
 * no footer on it — its only way out is the header "skip", which by punch 43 never logs), so it
 * can never be logged as walked and the ritual could never read 4/4. Its outcome is observable,
 * though — the spec's "Top 3 on the calendar": a task blocked onto today's calendar. So once the
 * ritual was walked today (≥1 step logged), a task block today counts that step as done. When the
 * ritual logs the step itself, the set already has it and nothing is added. */
export const MORNING_BLOCK_STEP = 'block'

export function morningState(logged: ReadonlySet<string>, total: number, hasTaskBlockToday: boolean): RitualState {
  const inferred = logged.size > 0 && hasTaskBlockToday && !logged.has(MORNING_BLOCK_STEP) ? 1 : 0
  return { done: Math.min(total, logged.size + inferred), total }
}

/** "The garden's closed." — pressing Done on the evening ritual's last beat (it logs `goodnight`)
 * finishes the ritual even when an earlier beat was skipped (the sweep's "skip for now" advances
 * without logging, punch 43). */
export const EVENING_LAST_STEP = 'goodnight'

export function eveningState(logged: ReadonlySet<string>, total: number): RitualState {
  return { done: Math.min(total, logged.size), total, finished: logged.has(EVENING_LAST_STEP) || (total > 0 && logged.size >= total) }
}
