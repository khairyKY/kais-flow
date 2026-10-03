import type { Cadence, Routine, RoutineCompletion } from '../../lib/types'

/** YYYY-MM-DD in LOCAL time — never UTC, or midnight-adjacent completions land on the wrong day. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isScheduled(d: Date, cadence: Cadence): boolean {
  return cadence.weekdays.includes(d.getDay())
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export interface StreakResult {
  current: number
  best: number
}

const MAX_LOOKBACK_DAYS = 3650 // ~10 years safety bound against pathological cadences

/** Backward grace walk shared by computeStreak and computeGraceStreak — Routines.dc.html
 * turn 4 ("Gentle Rain"): one missed scheduled day per calendar month doesn't break the
 * streak (it "rains" instead); the second miss in a month snaps it. Today, if scheduled but
 * not yet completed, doesn't break the current streak — the day isn't over. `since` (a
 * routine's first day, see `routineStartKey`) ends the walk: days before a routine existed are
 * neither misses nor rain. It can never change `current` — no completion predates `since`. */
function walkCurrentStreak(completed: Set<string>, cadence: Cadence, today: Date, since?: string): { current: number; rainedDates: string[] } {
  if (cadence.weekdays.length === 0) return { current: 0, rainedDates: [] }
  const rainUsedByMonth = new Set<string>()
  const rainedDates: string[] = []
  let current = 0

  let cursor = new Date(today)
  if (isScheduled(cursor, cadence) && !completed.has(localDateKey(cursor))) {
    cursor = addDays(cursor, -1) // today not over yet — doesn't break, doesn't count
  }
  let steps = 0
  while (steps < MAX_LOOKBACK_DAYS) {
    if (since && localDateKey(cursor) < since) break
    if (isScheduled(cursor, cadence)) {
      const key = localDateKey(cursor)
      if (completed.has(key)) {
        current++
      } else {
        const monthKey = key.slice(0, 7)
        if (rainUsedByMonth.has(monthKey)) break
        rainUsedByMonth.add(monthKey)
        rainedDates.push(key)
      }
    }
    cursor = addDays(cursor, -1)
    steps++
  }
  return { current, rainedDates }
}

/**
 * completedDates: local YYYY-MM-DD strings the routine was checked off.
 * Only days the cadence schedules count toward a streak; unscheduled days are skipped over
 * without breaking anything. Punch item 44: this is THE one user-facing streak everywhere
 * (row flame, trellis header, Today's circle, sidebar, Focus) and it is grace-forgiving per
 * the trellis's own legend — see `walkCurrentStreak`. `best` applies the same one-rain-per-
 * calendar-month-per-run grace walking forward.
 */
export function computeStreak(completedDates: string[], cadence: Cadence, today: Date = new Date()): StreakResult {
  const completed = new Set(completedDates)
  const { current } = walkCurrentStreak(completed, cadence, today)

  let best = 0
  if (completed.size > 0 && cadence.weekdays.length > 0) {
    const earliest = Array.from(completed).sort()[0]
    const todayKey = localDateKey(today)
    let cursor = new Date(`${earliest}T00:00:00`)
    let run = 0
    let rainUsedByMonth = new Set<string>()
    let steps = 0
    while (cursor <= today && steps < MAX_LOOKBACK_DAYS) {
      if (isScheduled(cursor, cadence)) {
        const key = localDateKey(cursor)
        if (completed.has(key)) {
          run++
          best = Math.max(best, run)
        } else if (key !== todayKey) {
          // a miss: forgiven once per calendar month within a run, same rule as the backward walk
          const monthKey = key.slice(0, 7)
          if (rainUsedByMonth.has(monthKey)) {
            run = 0
            rainUsedByMonth = new Set()
          } else {
            rainUsedByMonth.add(monthKey)
          }
        }
      }
      cursor = addDays(cursor, 1)
      steps++
    }
  }

  // ponytail: backward walk rains the *latest* miss of a month, forward walk the *oldest* —
  // in rare splits current could exceed the forward best, so clamp for coherence.
  return { current, best: Math.max(best, current) }
}

/** 'growing' — a live streak (current > 0). 'lost' — current is 0 but a streak existed once.
 * 'new' — no scheduled day has ever been checked off: nothing was ever there to lose, so a
 * routine planted today (or never yet tended) must not read as a broken streak. */
export type StreakStatus = 'growing' | 'new' | 'lost'

export interface RoutineStreak extends StreakResult {
  status: StreakStatus
}

/** `computeStreak` plus the honest reading of a zero — the one place the row label and the
 * garden card decide between "no streak yet" and "streak lost". */
export function routineStreak(completedDates: string[], cadence: Cadence, today: Date = new Date()): RoutineStreak {
  const { current, best } = computeStreak(completedDates, cadence, today)
  const status: StreakStatus = current > 0 ? 'growing' : best > 0 ? 'lost' : 'new'
  return { current, best, status }
}

/** A routine's first real day (local YYYY-MM-DD): the earlier of the day it was planted
 * (`created_at`) and its oldest completion — history may predate `created_at` (a backfilled
 * check-off), and it must never be hidden. Undefined when neither is known. Uses the same
 * device-local day as every other key in this file (the Cairo-day gap is T-2's, not widened here). */
export function routineStartKey(createdAt: string | null | undefined, completedDates: string[]): string | undefined {
  const created = createdAt ? new Date(createdAt) : null
  const createdKey = created && !Number.isNaN(created.getTime()) ? localDateKey(created) : undefined
  const earliest = completedDates.length > 0 ? [...completedDates].sort()[0] : undefined
  if (createdKey && earliest) return createdKey < earliest ? createdKey : earliest
  return createdKey ?? earliest
}

export interface TodayTally {
  /** Routines that belong to today: scheduled by their cadence, or already checked off today. */
  due: number
  done: number
  remaining: number
}

function doneTodayIds(completions: RoutineCompletion[], today: Date): Set<string> {
  const todayKey = localDateKey(today)
  return new Set(completions.filter((c) => c.completed_on === todayKey).map((c) => c.routine_id))
}

/** The routines that belong to today, in their given order: active, and either scheduled by
 * their cadence today or already checked off today. Exactly the set `todayTally` counts, so a
 * list drawn from it always matches its "done/due" header (Polish D: Today's rail listed every
 * active routine — a Sunday-only one on a Saturday — under a count of all of them). */
export function routinesForToday<T extends Routine>(routines: T[], completions: RoutineCompletion[], today: Date = new Date()): T[] {
  const doneIds = doneTodayIds(completions, today)
  return routines.filter((r) => r.active && (doneIds.has(r.id) || isScheduled(today, r.cadence)))
}

/** The "N of M tended" count. Only active routines count, and only when today is theirs: a
 * routine whose cadence rests today is neither due nor remaining. One checked off on a resting
 * day still counts as tended (and so as due), so `done` never exceeds `due`. */
export function todayTally(routines: Routine[], completions: RoutineCompletion[], today: Date = new Date()): TodayTally {
  const doneIds = doneTodayIds(completions, today)
  const dueToday = routinesForToday(routines, completions, today)
  const done = dueToday.filter((r) => doneIds.has(r.id)).length
  return { due: dueToday.length, done, remaining: dueToday.length - done }
}

function scheduledAndDone(cadence: Cadence, completedDates: string[], days: number, today: Date, since?: string): { scheduled: number; done: number } {
  const completed = new Set(completedDates)
  let scheduled = 0
  let done = 0
  for (let n = 0; n < days; n++) {
    const d = addDays(today, -n)
    if (!isScheduled(d, cadence)) continue
    const key = localDateKey(d)
    if (since && key < since) continue // the routine didn't exist yet — not a miss
    scheduled++
    if (completed.has(key)) done++
  }
  return { scheduled, done }
}

/** Percent of scheduled days actually completed in the trailing `days`-day window (today
 * inclusive). 0 when the cadence never schedules a day in that window, rather than NaN. Pass
 * `since` (`routineStartKey`) so days before the routine was planted don't count against it —
 * the same rule `computeTrellisDays` draws beside it (Polish D). */
export function completionRate(completedDates: string[], cadence: Cadence, days: 7 | 30, today: Date = new Date(), since?: string): number {
  const { scheduled, done } = scheduledAndDone(cadence, completedDates, days, today, since)
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
}

/** The header's all-routines rate: scheduled/done counts summed across every active routine
 * first, then divided once — a weighted rate, not an average of each routine's own percentage
 * (a daily routine and a once-a-week one shouldn't count equally). */
export function aggregateCompletionRate(routines: Routine[], completions: RoutineCompletion[], days: 7 | 30, today: Date = new Date()): number {
  let scheduled = 0
  let done = 0
  for (const routine of routines) {
    const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
    const w = scheduledAndDone(routine.cadence, dates, days, today)
    scheduled += w.scheduled
    done += w.done
  }
  return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
}

/** One ratio (0..1) per day, oldest first — the sparkline's path data. A day with nothing
 * scheduled across any routine reads as 0 rather than being skipped, so the line stays a fixed
 * length. */
export function dailyCompletionRatios(routines: Routine[], completions: RoutineCompletion[], days: number, today: Date = new Date()): number[] {
  const ratios: number[] = []
  for (let n = days - 1; n >= 0; n--) {
    const d = addDays(today, -n)
    const key = localDateKey(d)
    const scheduled = routines.filter((r) => isScheduled(d, r.cadence))
    if (scheduled.length === 0) {
      ratios.push(0)
      continue
    }
    const done = scheduled.filter((r) => completions.some((c) => c.routine_id === r.id && c.completed_on === key))
    ratios.push(done.length / scheduled.length)
  }
  return ratios
}

export type TrellisDayState = 'grew' | 'rained' | 'broke' | 'off'
export interface TrellisDay {
  key: string
  state: TrellisDayState
}

/** Same grace walk as `computeStreak`'s current, but also returns which days rained — the
 * streak-trellis (4a) draws a droplet on each. Punch item 44: `current` here and
 * `computeStreak().current` are the SAME number by construction (one shared walk). Pass
 * `since` (`routineStartKey`) so days before the routine existed don't read as rain. */
export function computeGraceStreak(completedDates: string[], cadence: Cadence, today: Date = new Date(), since?: string): { current: number; rainedDates: string[] } {
  return walkCurrentStreak(new Set(completedDates), cadence, today, since)
}

/** Per-day states for the trailing `days`-day trellis (4a): 'grew' (scheduled + done —
 * including today, the moment it's checked), 'rained' (scheduled + missed, forgiven — first
 * miss of its calendar month), 'broke' (scheduled + missed, grace already spent), 'off'
 * (not scheduled, before `since` — the routine didn't exist yet — or today-scheduled-but-not-
 * yet-done: the day isn't over, so it never reads as a miss). Oldest first, fixed length —
 * same shape convention as `dailyCompletionRatios`. */
export function computeTrellisDays(completedDates: string[], cadence: Cadence, days: number, today: Date = new Date(), since?: string): TrellisDay[] {
  const completed = new Set(completedDates)
  const todayKey = localDateKey(today)
  const rainUsedByMonth = new Set<string>()
  const start = addDays(today, -(days - 1))
  const out: TrellisDay[] = []
  for (let n = 0; n < days; n++) {
    const d = addDays(start, n)
    const key = localDateKey(d)
    if (!isScheduled(d, cadence) || (since && key < since) || (key === todayKey && !completed.has(key))) {
      out.push({ key, state: 'off' })
      continue
    }
    if (completed.has(key)) {
      out.push({ key, state: 'grew' })
      continue
    }
    const monthKey = key.slice(0, 7)
    if (rainUsedByMonth.has(monthKey)) {
      out.push({ key, state: 'broke' })
    } else {
      rainUsedByMonth.add(monthKey)
      out.push({ key, state: 'rained' })
    }
  }
  return out
}

/** The rains the trellis header may claim ("N rain held"): only rains that are holding a live
 * streak. A 0-day streak has nothing held up, so "0 days · 1 rain held" read as a contradiction
 * (conductor decision 2026-09-26, polish-f1) — none are shown then. */
export function rainHeld(current: number, rainedDates: string[]): string[] {
  return current > 0 ? rainedDates : []
}

/** Which handwritten caption the streak trellis (4a) closes with — the words live in
 * StreakTrellis. A live streak keeps its story: the latest rain it survived, else the latest
 * snap, else a clean run. A 0-day streak never tells the rain story ("the vine held on" when it
 * didn't): a routine never tended keeps its "starts bare" hint, one that snapped says when, and
 * one whose snap is older than the window is simply bare. */
export type TrellisCaption =
  | { kind: 'rained'; key: string }
  | { kind: 'broke'; key: string }
  | { kind: 'new' }
  | { kind: 'bare' }
  | { kind: 'clean' }

export function trellisCaption(days: TrellisDay[], current: number, status: StreakStatus): TrellisCaption {
  const lastRain = [...days].reverse().find((d) => d.state === 'rained')
  const lastBreak = [...days].reverse().find((d) => d.state === 'broke')
  if (current > 0) {
    if (lastRain) return { kind: 'rained', key: lastRain.key }
    if (lastBreak) return { kind: 'broke', key: lastBreak.key }
    return { kind: 'clean' }
  }
  if (status === 'new') return { kind: 'new' }
  if (lastBreak) return { kind: 'broke', key: lastBreak.key }
  return { kind: 'bare' }
}

/** No `goal` field exists on a routine, so "streak vs. goal" is read as "streak vs. today":
 * flags the routine with the longest streak that's scheduled today, not yet done, and would
 * break if skipped. Null when nothing active is actually at risk right now. */
export function streakRiskMessage(routines: Routine[], completions: RoutineCompletion[], today: Date = new Date()): string | null {
  const todayKey = localDateKey(today)
  let worst: { name: string; current: number } | null = null
  for (const routine of routines) {
    if (!isScheduled(today, routine.cadence)) continue
    const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
    if (dates.includes(todayKey)) continue
    const { current } = computeStreak(dates, routine.cadence, today)
    if (current > 0 && (!worst || current > worst.current)) worst = { name: routine.name, current }
  }
  if (!worst) return null
  return `${worst.name}'s ${worst.current}-day streak is on the line — complete it today to keep it.`
}

/** Days in a challenge window, both ends counted ("YYYY-MM-DD" keys; Sep 1 → Sep 30 = 30). */
export function challengeDays(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
}

/** A streak against its goal (migration 0046): "12 / 30", or just "12" with no goal. */
export function streakOfGoal(current: number, goalDays: number | null | undefined): string {
  return goalDays ? `${current} / ${goalDays}` : String(current)
}
