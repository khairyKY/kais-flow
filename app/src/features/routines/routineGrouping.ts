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

/** The named time a Cairo hour falls in: morning before 12:00, afternoon until 17:00, then evening. */
export function namedTimeAt(hour: number): NamedTime {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

/**
 * Kai 2026-10-03 (Today Phone 2a draws "Morning 1/3"): Today shows the routines for the time it is
 * now, plus Anytime ones; every other named group folds into one quiet line, "Earlier" or "Later",
 * so nothing is hidden — the evening routines just don't crowd the morning.
 */
export function splitByTimeOfDay<T>(groups: RoutineTimeGroup<T>[], hour: number) {
  const now = namedTimeAt(hour)
  const shown = groups.filter((g) => g.key === now || g.key === 'anytime')
  const folded = groups
    .filter((g) => !shown.includes(g))
    .map((g) => ({ ...g, when: NAMED_TIMES.indexOf(g.key as NamedTime) < NAMED_TIMES.indexOf(now) ? ('Earlier' as const) : ('Later' as const) }))
  return { shown, folded }
}
