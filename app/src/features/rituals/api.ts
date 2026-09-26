import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { activityRow, logActivity } from '../../lib/activity'
import { writeRow } from '../../lib/outbox'
import { queryClient } from '../../lib/queryClient'
import { localDateKey } from '../routines/streaks'
import { useTasks } from '../tasks/api'
import { SEED_EVENT, UNSEED_EVENT, liveSeeds, seedPayload, seededTaskIds, type RitualKind } from './loopDay'
import type { ActivityLogEntry, Task } from '../../lib/types'

export type { RitualKind } from './loopDay'

/** Total steps each ritual walks — the denominator on Today's ritual cards.
 * Mirrors MorningRitual's STEPS and EveningRitual's BEATS (5 since ruling D-2 folded
 * the 1e "Sweep today" beat in as evening beat 1 — punch item 43). */
export const RITUAL_STEP_COUNT: Record<RitualKind, number> = { morning: 4, evening: 5 }

/** R4-D1 (Kai's 2026-07-20 ruling (a)): rituals and routines are fully separate. A ritual's
 * progress is its OWN steps walked today — it used to be derived from how many `time_of_day`-
 * tagged *routines* were checked off, so adding a routine called "morning routine" silently
 * moved the Morning-ritual bar. Steps live in `activity_log` (the spine — same as every other
 * domain event) rather than a new table: one append per step, deduped by (ritual, step) here. */
export function useRitualStepsToday() {
  return useQuery({
    queryKey: ['activity_log', 'ritual_steps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('event_type', 'ritual.step_completed')
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      if (error) throw error
      return data as ActivityLogEntry[]
    },
    select: (rows) => {
      const today = localDateKey(new Date())
      const done: Record<RitualKind, Set<string>> = { morning: new Set(), evening: new Set() }
      for (const r of rows) {
        const p = r.payload as { ritual?: RitualKind; step?: string; date?: string } | null
        if (!p?.ritual || !p.step || p.date !== today) continue
        done[p.ritual]?.add(p.step)
      }
      return done
    },
  })
}

/** Punch item 45: the weekly-review sweep persists through the activity spine, not component
 * state — read back this week's `domain.swept` and `review.verdict` events to rebuild the
 * swept set and per-project verdicts after a reload. Week-keyed twice over: the query only
 * fetches rows created since the week started, and rows carrying a `payload.week` are checked
 * against it, so last week's sweep never counts for this one. */
export function useReviewEventsThisWeek(weekStartIso: string) {
  return useQuery({
    queryKey: ['activity_log', 'review_week', weekStartIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .in('event_type', ['domain.swept', 'review.verdict'])
        .gte('created_at', weekStartIso)
        // J-27: a re-opened sweep can revise a verdict, and the page folds these rows into a
        // Map in order — oldest first so the LATEST verdict is the one that survives a reload.
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ActivityLogEntry[]
    },
  })
}

/** J-27: log a sweep / verdict AND fold it into this week's cached review events. A re-opened
 * sweep exists to revise verdicts; without the cache write, leaving the page and coming back
 * inside the 30s staleTime (or reloading — the cache is persisted) re-read the pre-edit list,
 * so a revised verdict looked lost until the next refetch. The outbox's write-behind re-apply
 * only covers a table's own `[table]` key, not this `['activity_log', 'review_week', …]` one. */
export function logReviewEvent(
  weekStartIso: string,
  eventType: 'domain.swept' | 'review.verdict',
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): void {
  logActivity(eventType, entityType, entityId, payload)
  queryClient.setQueryData<ActivityLogEntry[]>(['activity_log', 'review_week', weekStartIso], (old) =>
    old
      ? [...old, { id: crypto.randomUUID(), event_type: eventType, entity_type: entityType, entity_id: entityId, payload, created_at: new Date().toISOString() }]
      : old,
  )
}

export function logRitualStep(ritual: RitualKind, step: string): void {
  logActivity('ritual.step_completed', 'ritual', `${ritual}-${localDateKey(new Date())}`, {
    ritual,
    step,
    date: localDateKey(new Date()),
  })
}

/** Writes one activity row through the outbox AND folds it into a ritual query's cache, so the
 * screen that wrote it sees it at once. Same reason as logReviewEvent above: the outbox only
 * re-applies pending writes to a table's own `[table]` key. Unlike there, an empty cache is
 * seeded with the row: these keys hold one shape only, and an in-flight first fetch cancelled
 * by another write (writeRow cancels every `['activity_log', …]` query) would otherwise drop it. */
function logRitualEvent(key: readonly unknown[], eventType: string, entityType: string, entityId: string, payload: Record<string, unknown>): void {
  const row = activityRow(eventType, entityType, entityId, payload)
  writeRow('activity_log', row)
  const entry: ActivityLogEntry = { ...row, created_at: new Date().toISOString() }
  queryClient.setQueryData<ActivityLogEntry[]>(key, (old) => (old ? [...old, entry] : [entry]))
}

// ── Loop B: the evening seeds tomorrow's Top 3 (docs/DAILY-CYCLE.md, "shutdown feeds the next
// Plan"). A seed is an activity row, not a column or a table: `ritual.seeded` / `ritual.unseeded`,
// entity = the task, payload { ritual: 'evening', step: 'seeds', for_date, date } — see loopDay.ts.
// Seeding no longer stars the task tonight; the morning ritual's Top-3 step pre-selects the seeds
// and one tap keeps them. Rows sync like every activity row, so a phone at night seeds the
// laptop's morning. ──

const SEEDS_KEY = ['activity_log', 'ritual_seeds'] as const

/** Seed/unseed rows from the last three days, oldest first (the order seededTaskIds replays). */
export function useRitualSeedRows() {
  return useQuery({
    queryKey: SEEDS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .in('event_type', [SEED_EVENT, UNSEED_EVENT])
        .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ActivityLogEntry[]
    },
  })
}

/** The live seeds planted for the morning of `forDate` (a loop-day key): open tasks only, in
 * seeding order, at most three. `useSeedsFor(loopDayKey(now))` is this morning's; the evening
 * shows `useSeedsFor(seedTargetDate(now))`, tomorrow's. */
export function useSeedsFor(forDate: string): Task[] {
  const { data: rows } = useRitualSeedRows()
  const { data: tasks } = useTasks()
  return useMemo(() => liveSeeds(seededTaskIds(rows ?? [], forDate), tasks ?? []), [rows, tasks, forDate])
}

/** Plant (or take back) a seed for the next morning — the loop day after `now`'s. */
export function setSeed(task: Task, seeded: boolean, now: Date = new Date()): void {
  logRitualEvent(SEEDS_KEY, seeded ? SEED_EVENT : UNSEED_EVENT, 'task', task.id, { ...seedPayload(now) })
}
