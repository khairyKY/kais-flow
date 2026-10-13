// Today's rules on the server, restated from the app so notify (the morning digest), chat and mcp
// say what the Today page shows. Pure — no Deno APIs — so the app's vitest runs it
// (app/src/features/notifications/today.test.ts).
//
// The Top 3 rule (app/src/features/tasks/top3Rule.ts, Kai 2026-10-12): a starred task holds a place
// only while it's still today's work — open (status todo), not someday, not paused, not in Trash, and undated or
// dated today or earlier (its due date, else its calendar block, on the user's clock). A pick moved to
// a later day isn't today's. The order is tasks.top3_rank (1 = the goal of the day), the unranked
// after the ranked.
import { dateKey } from './zone.ts'

export interface DayRow {
  status: string
  someday?: boolean | null
  /** A paused series (Perennials ‖) rests until it's resumed: no list, no pick, no reminder. */
  paused?: boolean | null
  deleted_at?: string | null
  due_at: string | null
  scheduled_start?: string | null
}

export interface Top3Row extends DayRow {
  top3?: boolean | null
  top3_rank?: number | null
  created_at?: string | null
}

/** The task's day on `zone`'s calendar (due date, else its block); null when it has no date. */
function dayOf(t: DayRow, zone: string): string | null {
  const at = t.due_at ?? t.scheduled_start ?? null
  return at ? dateKey(new Date(at), zone) : null
}

const open = (t: DayRow) => t.status === 'todo' && !t.someday && !t.paused && !t.deleted_at

/** Does this starred task still count as one of today's Top 3 (top3Rule.ts isTop3Today)? */
export function isTop3Today(t: Top3Row, now: Date, zone: string): boolean {
  if (!t.top3 || !open(t)) return false
  const day = dayOf(t, zone)
  return day === null || day <= dateKey(now, zone)
}

/** Today's picks, goal first: by top3_rank, the unranked after them oldest first. */
export function todaysTop3<T extends Top3Row>(rows: readonly T[], now: Date, zone: string): T[] {
  const rank = (t: T) => t.top3_rank ?? Infinity
  return rows
    .filter((t) => isTop3Today(t, now, zone))
    .sort((a, b) => (rank(a) === rank(b) ? (a.created_at ?? '').localeCompare(b.created_at ?? '') : rank(a) < rank(b) ? -1 : 1))
}

/** Tasks' Overdue list (grouping.ts filterByList('overdue')): open, not someday or paused, dated before today. */
export function isOverdue(t: DayRow, now: Date, zone: string): boolean {
  const day = dayOf(t, zone)
  return open(t) && day !== null && day < dateKey(now, zone)
}
