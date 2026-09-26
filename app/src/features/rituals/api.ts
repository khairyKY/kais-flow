import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activity'
import { queryClient } from '../../lib/queryClient'
import { localDateKey } from '../routines/streaks'
import type { ActivityLogEntry } from '../../lib/types'

export type RitualKind = 'morning' | 'evening'

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
