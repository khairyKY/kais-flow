// Today's Top 3, finished ones included (Loop A, 2026-09-26 daily cycle).
//
// Completing a task clears its `top3` flag (completion.ts planCompletion — a done task frees its
// slot), so from the task row alone a finished pick looks like any other finished task: it fell
// out of the Top 3 section into "All open", and nothing could tell "all three done" from "none
// picked". The Day card needs exactly that ("Top 3 x/3", "every picked Top 3 done → shut down"),
// and R4 (2026-07-20) wanted a finished goal "still displayed, just crossed out".
//
// No new table (DAILY-CYCLE: "loop state is read from the activity log"): starring logs
// `task.starred`, unstarring `task.unstarred` (tasks/api toggleTop3), and completing logs neither.
// So a task finished today was a Top 3 pick when its latest star event is `task.starred`. The
// latest event overall — not "before completed_at" — so a skewed device clock can't misread it.

export interface StarEvent {
  entity_id: string
  event_type: string
  created_at: string
}

export const STAR_EVENTS = ['task.starred', 'task.unstarred'] as const

/** Ids whose latest star event is a star. `events` may arrive in any order. */
export function starredIds(events: readonly StarEvent[]): Set<string> {
  const latest = new Map<string, StarEvent>()
  for (const e of events) {
    const prev = latest.get(e.entity_id)
    if (!prev || new Date(e.created_at).getTime() >= new Date(prev.created_at).getTime()) latest.set(e.entity_id, e)
  }
  const ids = new Set<string>()
  for (const [id, e] of latest) if (e.event_type === 'task.starred') ids.add(id)
  return ids
}

interface Top3Row {
  id: string
  top3: boolean
  completed_at: string | null
}

/** Today's Top 3 among `rows` (Today's visible list: open tasks + those finished today): starred
 * now, or finished today while starred. Keeps the rows' order. */
export function top3OfToday<R extends Top3Row>(rows: readonly R[], starredWhenDone: ReadonlySet<string>): R[] {
  return rows.filter((t) => t.top3 || (!!t.completed_at && starredWhenDone.has(t.id)))
}

/** The Day card's Top 3 counts: how many were picked today, and how many of those are done. */
export function top3Tally(top3: readonly Top3Row[]): { picked: number; done: number } {
  return { picked: top3.length, done: top3.filter((t) => !!t.completed_at).length }
}
