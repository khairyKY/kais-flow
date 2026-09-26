// Completing a task, and taking it back (Polish D, punch 6: "every one toasts with a working
// Undo; every Undo restores exactly"). Pure — api.ts writes what these plan.
//
// How completion spawns the next copy: a task with a recurrence_rule and a due_at is marked done,
// and its NEXT occurrence is materialised as a brand-new task row (nextOccurrence, rrule). An
// undo that only flipped the status back (the old `uncompleteTask`) left that new row behind, so
// check → undo → check again put TWO copies of next Tuesday on the list.

import type { Task } from '../../lib/types'
import { nextOccurrence } from './recurrence'

/** What completing changes on the task itself — exactly what an undo puts back. */
export type CompletionFields = Pick<Task, 'status' | 'completed_at' | 'top3'>

export interface CompletionPlan {
  /** The completed row. */
  done: Task
  /** A recurring task's next occurrence, or null: not recurring, the series is over, or that
   * occurrence is already open on the list (a re-completion never spawns a second copy). */
  next: Task | null
}

function sameInstant(a: string | null, b: Date): boolean {
  return !!a && new Date(a).getTime() === b.getTime()
}

/** The rows completing `task` writes. `existing` is the task list as the app has it, `now` the
 * completion instant (ISO), `newId` the id for a spawned occurrence. */
export function planCompletion(task: Task, existing: readonly Task[], now: string, newId: () => string): CompletionPlan {
  const done: Task = { ...task, status: 'done', completed_at: now, top3: false }
  if (!task.recurrence_rule || !task.due_at) return { done, next: null }
  const at = nextOccurrence(task.recurrence_rule, new Date(task.due_at))
  if (!at) return { done, next: null }
  // Reopened and completed again (in this session or after a reload): the occurrence it spawned
  // the first time is still open — don't add another one beside it.
  const alreadyOpen = existing.some(
    (t) => t.id !== task.id && !t.deleted_at && t.status === 'todo' && t.title === task.title && t.recurrence_rule === task.recurrence_rule && sameInstant(t.due_at, at),
  )
  if (alreadyOpen) return { done, next: null }
  // `external_ref` is an imported row's idempotency key (0027: unique per user + source + id). The
  // next occurrence is a new task, not that imported row — carrying the key over made the insert
  // collide with the original and dead-letter (a repeat set by Import's "tidy them" tool).
  const { external_ref: _importKey, ...rest } = task as Task & { external_ref?: unknown }
  const next: Task = {
    ...rest,
    id: newId(),
    status: 'todo',
    completed_at: null,
    due_at: at.toISOString(),
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    created_at: now,
    updated_at: now,
  }
  return { done, next }
}

export interface UndoPlan {
  /** The task's current row with the completion's changes put back. */
  restore: Task
  /** The spawned occurrence to remove, or null (none, or the user has since changed it). */
  removeId: string | null
}

/** What undoing a completion writes. `current` is the task as it is now (anything else changed
 * since the check survives), `before` the row as it was just before completing. The spawned
 * occurrence goes only while it's still exactly as spawned — `spawnedNow` undefined (not in the
 * list) or still open and unedited; a copy the user has since edited or ticked stays. */
export function planUndo(current: Task, before: Task, spawned: Task | null, spawnedNow: Task | undefined): UndoPlan {
  const restore: Task = { ...current, status: before.status, completed_at: before.completed_at, top3: before.top3 }
  if (!spawned) return { restore, removeId: null }
  const untouched =
    !spawnedNow ||
    (spawnedNow.status === 'todo' && !spawnedNow.deleted_at && new Date(spawnedNow.updated_at).getTime() === new Date(spawned.updated_at).getTime())
  return { restore, removeId: untouched ? spawned.id : null }
}
