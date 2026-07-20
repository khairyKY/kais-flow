import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activity'
import { localDateKey } from '../routines/streaks'
import type { ActivityLogEntry } from '../../lib/types'

export type RitualKind = 'morning' | 'evening'

/** Total steps each ritual walks — the denominator on Today's ritual cards.
 * Mirrors MorningRitual's STEPS and EveningRitual's BEATS. */
export const RITUAL_STEP_COUNT: Record<RitualKind, number> = { morning: 4, evening: 4 }

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

export function logRitualStep(ritual: RitualKind, step: string): void {
  logActivity('ritual.step_completed', 'ritual', `${ritual}-${localDateKey(new Date())}`, {
    ritual,
    step,
    date: localDateKey(new Date()),
  })
}
