export const NAMED_TIMES = ['morning', 'afternoon', 'evening'] as const
export type NamedTime = (typeof NAMED_TIMES)[number]

const LABELS: Record<NamedTime, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

export interface RoutineTimeGroup<T> {
  key: string
  label: string
  items: T[]
}

/**
 * Buckets routines into the 3 fixed named times, plus a 4th "Anytime" catch-all for a custom
 * label, a clock time, or no time at all (migration 0019) — so a routine with a freeform
 * `time_of_day` never silently disappears from a time-bucketed list. Shared by RoutinesPage and
 * TodayPage's routines widget, which both used to filter on the 3 named values only.
 */
export function groupRoutinesByTime<T extends { time_of_day: string | null }>(routines: T[]): RoutineTimeGroup<T>[] {
  const groups: RoutineTimeGroup<T>[] = NAMED_TIMES.map((key) => ({
    key,
    label: LABELS[key],
    items: routines.filter((r) => r.time_of_day === key),
  }))
  const anytime = routines.filter((r) => !NAMED_TIMES.includes(r.time_of_day as NamedTime))
  if (anytime.length > 0) groups.push({ key: 'anytime', label: 'Anytime', items: anytime })
  return groups
}
