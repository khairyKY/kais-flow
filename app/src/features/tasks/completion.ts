// Completing a task, and taking it back (Polish D, punch 6: "every one toasts with a working
// Undo; every Undo restores exactly"). Pure — api.ts writes what these plan.
//
// How completion spawns the next copy: a task with a recurrence_rule and a due_at is marked done,
// and its NEXT occurrence is materialised as a brand-new task row (nextOccurrence, rrule). An
// undo that only flipped the status back (the old `uncompleteTask`) left that new row behind, so
// check → undo → check again put TWO copies of next Tuesday on the list.

import type { Task } from '../../lib/types'
import { nextOccurrence, nextReminderAt } from './recurrence'

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

/** An open copy of `like`'s series due at `at` is already on the list (rows in `except` aside). */
function openOccurrence(existing: readonly Task[], like: Task, at: Date, except: string): boolean {
  return existing.some(
    (t) => t.id !== except && !t.deleted_at && t.status === 'todo' && t.title === like.title && t.recurrence_rule === like.recurrence_rule && sameInstant(t.due_at, at),
  )
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
  if (openOccurrence(existing, task, at, task.id)) return { done, next: null }
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
    // Polish F2a: the copy reminds again — same lead before its own due time, not yet sent.
    reminder_at: nextReminderAt(task.reminder_at, task.due_at, at),
    reminder_sent: false,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    top3_rank: null,
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

// ── A second click takes the check back (Polish F2a, 2026-09-26 decision) ──
// Today kept a just-checked row's box drawn checked and ran the completion again on the next
// click ("Done" toast twice); Tasks did the same inside its 650ms grace window. A click on a
// checked box now reopens — the same Reopen the filled ✓ and the menu run — with its own Undo.

export type CheckAction = 'complete' | 'reopen'

/** What a click on a task's checkbox does. `done` is what the row shows; `justChecked` is true
 * while the row still holds the check this session's click put on it (Today's bloom, Tasks'
 * grace window) — the row may still be drawn open, but that task is done, so the click reopens. */
export function checkAction(done: boolean, justChecked: boolean): CheckAction {
  return done || justChecked ? 'reopen' : 'complete'
}

export interface UndoReopenPlan {
  /** The task's current row with the completion put back as it was just before the Reopen. */
  restore: Task
  /** The next occurrence the Reopen removed, to put back — or null (none removed, or an open copy
   * of that occurrence is on the list again, so putting it back would make two). */
  reinsert: Task | null
}

/** What undoing a Reopen writes. `current` is the task as it is now, `before` the (done) row as it
 * was just before the Reopen, `removed` the spawned occurrence the Reopen took away. */
export function planUndoReopen(current: Task, before: Task, removed: Task | null, existing: readonly Task[]): UndoReopenPlan {
  const restore: Task = { ...current, status: before.status, completed_at: before.completed_at, top3: before.top3 }
  if (!removed?.due_at) return { restore, reinsert: null }
  const back = existing.some((t) => t.id === removed.id) || openOccurrence(existing, removed, new Date(removed.due_at), removed.id)
  return { restore, reinsert: back ? null : removed }
}
