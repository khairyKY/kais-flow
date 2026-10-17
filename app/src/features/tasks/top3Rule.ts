// Kai 2026-10-12: "a task that was one of the Top 3 for the day, replanned for another day, keeps
// the slot — you cannot assign another task to the Top 3 until you remove the one you replanned."
// The Top 3 is today's, so a pick holds its place only while it's still today's work. One rule, read
// by every writer (lib/outbox writeRow → releaseTop3) and every reader (Today's Top 3, the rail's
// Today, the Today smart list, the 3-slot cap) — so a moved pick can't be shown, counted or kept.
import type { Task } from '../../lib/types'
import { taskDayDiff } from './grouping'
import { isSnoozed } from './snooze'

type Top3Fields = Pick<Task, 'top3' | 'top3_rank' | 'someday' | 'deleted_at' | 'status' | 'due_at' | 'scheduled_start' | 'paused'> & { snoozed_until?: string | null }

/** Does this starred task still count as one of TODAY's Top 3?
 *
 * `taskDayDiff(task, now)` = the task's day (due date, else its calendar block) minus today, in the
 * user's days: 0 today, 1 tomorrow, -1 yesterday, null when it has no date at all. */
export function isTop3Today(task: Top3Fields, now: Date): boolean {
  if (!task.top3) return false
  // Parked, paused, binned or no longer open: not anybody's pick.
  if (task.someday || task.paused || task.deleted_at || task.status !== 'todo') return false
  // Snoozed (Kai 2026-10-17): off Today until it's back, so it gives its place up like a move off today
  // — even "Later today"; Undo gives it back.
  if (isSnoozed(task, now)) return false
  const diff = taskDayDiff(task, now)
  // Undated = "today, whenever" (starring never needs a date). Earlier = yesterday's unfinished pick
  // carried over — the morning ritual offers it again (rituals/loopDay.ts) and Keep & continue keeps
  // it. Only a pick moved to a LATER day stops being today's.
  return diff === null || diff <= 0
}

/** `next` with its Top 3 place given up when this write takes a pick off today (Tomorrow, a picked
 * date, Someday, a calendar drag, Delete…). A write that keeps it today's — or isn't a pick — is
 * returned as is. */
export function releaseTop3<T extends Top3Fields>(next: T, now: Date = new Date()): T {
  if (!next.top3 || isTop3Today(next, now)) return next
  return { ...next, top3: false, top3_rank: null }
}

/** The picks still holding a place today — the 3-slot cap counts these, not every stale flag. */
export function openTop3Count(tasks: readonly Task[], now: Date = new Date(), except?: string): number {
  return tasks.filter((t) => t.id !== except && !t.completed_at && isTop3Today(t, now)).length
}
