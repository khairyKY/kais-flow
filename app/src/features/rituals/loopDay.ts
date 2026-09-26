import { cairoDateKey } from '../../lib/dateShortcuts'
import type { ActivityLogEntry, Task } from '../../lib/types'

// ── Loop B (docs/DAILY-CYCLE.md): the pure half of "shutdown feeds the next Plan" and of
// "was the ritual finished today". No React, no Supabase — every function takes `now` or rows
// and returns plain data, so it is tested in three time zones. The hooks that fetch the rows and
// the writers that log them live in ./api.ts. ──

export type RitualKind = 'morning' | 'evening'

/** Cairo wall-clock hour the loop's day turns over. A shutdown at 00:30 still closes the day
 * you were living, so the loop day runs 04:00 → 04:00 Cairo rather than midnight → midnight. */
export const LOOP_DAY_ROLLOVER_HOUR = 4

/** Most seeds a night can plant — the morning keeps a Top 3. */
export const MAX_SEEDS = 3

export const SEED_EVENT = 'ritual.seeded'
export const UNSEED_EVENT = 'ritual.unseeded'

const cairoHour = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', hour: 'numeric' })

/** "YYYY-MM-DD" moved by `days` calendar days. Pure date math, read in UTC so no zone can shift it. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The loop day `now` belongs to, as a Cairo "YYYY-MM-DD": the Cairo calendar date, except that
 * before 04:00 Cairo it is still the previous one. Read from the wall clock (not `now - 4h`), so
 * the spring-forward night, which has no 00:00–01:00, still turns over at 04:00. */
export function loopDayKey(now: Date): string {
  const day = cairoDateKey(now)
  return Number(cairoHour.format(now)) % 24 < LOOP_DAY_ROLLOVER_HOUR ? addDaysToKey(day, -1) : day
}

/** The morning an evening shutdown at `now` seeds: the loop day after this one.
 * 21:00 Sat → Sun; 00:30 Sun (still Saturday's loop day) → Sun, not Monday. */
export function seedTargetDate(now: Date): string {
  return addDaysToKey(loopDayKey(now), 1)
}

// ── Seeds: `ritual.seeded` / `ritual.unseeded`, entity = the task, one row per tap. ──

export interface SeedPayload {
  ritual: 'evening'
  /** The evening beat it came from — lets the Activity page's ritual copy read it as "tomorrow's seeds". */
  step: 'seeds'
  /** The loop day whose morning this seed pre-fills. */
  for_date: string
  /** The loop day it was planted on. */
  date: string
}

export function seedPayload(now: Date): SeedPayload {
  return { ritual: 'evening', step: 'seeds', for_date: seedTargetDate(now), date: loopDayKey(now) }
}

/** Task ids seeded for `forDate`, in the order they were (last) seeded. `rows` must be oldest
 * first, as the seeds query returns them; the last seed/unseed per task wins. Rows planted for
 * any other date are ignored, so an older night's seeds never pre-fill today. */
export function seededTaskIds(rows: readonly ActivityLogEntry[], forDate: string): string[] {
  const seeded = new Set<string>()
  for (const r of rows) {
    if (r.event_type !== SEED_EVENT && r.event_type !== UNSEED_EVENT) continue
    if (r.payload?.for_date !== forDate) continue
    seeded.delete(r.entity_id) // a re-seed moves to the back
    if (r.event_type === SEED_EVENT) seeded.add(r.entity_id)
  }
  return [...seeded]
}

/** The seeds that can still pre-fill a morning, in seeding order, at most three: the task still
 * exists, isn't in Trash and is still open. Done, cancelled and deleted seeds are skipped. */
export function liveSeeds(ids: readonly string[], tasks: readonly Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out: Task[] = []
  for (const id of ids) {
    const t = byId.get(id)
    if (!t || t.deleted_at || t.status !== 'todo') continue
    out.push(t)
    if (out.length === MAX_SEEDS) break
  }
  return out
}

/** The morning Top-3 step's starting selection: last night's seeds first, then whatever is
 * already starred and still open, up to three. */
export function morningPreselection(seeds: readonly Task[], tasks: readonly Task[]): string[] {
  const picked: string[] = []
  const add = (t: Task) => {
    if (picked.length < MAX_SEEDS && !picked.includes(t.id)) picked.push(t.id)
  }
  seeds.forEach(add)
  tasks.filter((t) => t.top3 && t.status === 'todo' && !t.deleted_at).forEach(add)
  return picked
}

/** What confirming a Top-3 selection changes. Unstars are listed first on purpose: applying
 * them before the stars keeps the three-star cap from refusing a pick. */
export function top3Diff(selected: readonly string[], tasks: readonly Task[]): { unstar: Task[]; star: Task[] } {
  const want = new Set(selected)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return {
    unstar: tasks.filter((t) => t.top3 && !want.has(t.id)),
    star: selected.map((id) => byId.get(id)).filter((t): t is Task => !!t && !t.top3 && t.status === 'todo' && !t.deleted_at),
  }
}
