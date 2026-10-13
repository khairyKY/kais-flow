import { cairoDateKey } from '../../lib/dateShortcuts'

// "Day N" — the phone header's "Day 84", the sidebar foot's "day 42" (Today 2a), the tray and the
// widgets. Its own module so the shell can import it without todayLayout's graph in its first chunk.

/** Ruling 1's "Day N": the user's calendar days since the first record, that day being Day 1 — one
 * number all day long, whatever the hour. */
export function dayOfJourney(firstIso: string | null, now: Date): number {
  if (!firstIso) return 1
  const day = (d: Date) => Date.parse(`${cairoDateKey(d)}T00:00:00Z`) / 86_400_000
  return Math.max(1, day(now) - day(new Date(firstIso)) + 1)
}

/** The earliest `created_at` across the user's records (tasks, inbox, projects, routines) — Day 1. */
export function firstCreatedAt(...lists: readonly (readonly { created_at: string }[])[]): string | null {
  return lists.flatMap((l) => l.map((r) => r.created_at)).sort()[0] ?? null
}
