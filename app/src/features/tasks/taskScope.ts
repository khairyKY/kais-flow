import type { Task } from '../../lib/types'
import { withRuleParts } from '../../../../supabase/functions/_shared/series.ts'
import { planCompletion } from './completion'

// ── cal-clicks (Kai 2026-10-26): a repeating TASK asks the calendar's question too — "This one · This and
// following · All". A repeating task is one open row at a time; completing it spawns the next (./completion), and
// the rounds already done stay as done rows with the same title and rule. On that model:
//   This one  — the exception: this row leaves the series (its rule cleared) with the change, and the series goes
//               on as the next round, spawned now with the old values (planCompletion's own next copy).
//   Following — this row and any later open round take the change (the next copies inherit it): today's default.
//   All       — every round of the series, done ones too.
// Pure; tasks/api writes the plan through the outbox with one Undo. ──

export type TaskScope = 'this' | 'following' | 'all'

/** The rule a series is known by: its COUNT / UNTIL wear down round by round (ruleAfterThis), the rest stays. */
const ruleKey = (rule: string) => withRuleParts(rule, { COUNT: null, UNTIL: null })

/** The rounds of `task`'s series in `all` — same title and rule (completion's own "same series" test), live. */
export function taskSeries(task: Task, all: readonly Task[]): Task[] {
  if (!task.recurrence_rule) return [task]
  const key = ruleKey(task.recurrence_rule)
  const rounds = all.filter((t) => t.id !== task.id && !t.deleted_at && !!t.recurrence_rule && t.title === task.title && ruleKey(t.recurrence_rule) === key)
  return [task, ...rounds]
}

const dueMs = (t: Task) => (t.due_at ? Date.parse(t.due_at) : Number.POSITIVE_INFINITY)

/** The rows `scope` takes: this one; this and the later open rounds; or every round. */
export function scopeRows(task: Task, all: readonly Task[], scope: TaskScope): Task[] {
  if (scope === 'this' || !task.recurrence_rule) return [task]
  const series = taskSeries(task, all)
  if (scope === 'all') return series
  return series.filter((t) => t.id === task.id || (t.status === 'todo' && dueMs(t) >= dueMs(task)))
}

export interface TaskScopePlan {
  /** Rows to write, the acted-on task first. */
  write: Task[]
  /** The next round spawned for "This one" (Undo removes it), or null. */
  spawned: Task | null
}

/**
 * The rows a change makes under `scope`. `patch` gives each row's change (a move's fields depend on the row).
 * "This one" on a repeating task detaches it and spawns the next round with the old values.
 */
export function planTaskScope(task: Task, all: readonly Task[], scope: TaskScope, patch: (t: Task) => Partial<Task>, now: string, newId: () => string): TaskScopePlan {
  if (scope === 'this' && task.recurrence_rule) {
    // A paused or undated series spawns nothing (completion's rule): it can't go on without this row, so the row
    // keeps it. Otherwise it leaves (the next round, or none when this was the last of "N times").
    if (task.paused || !task.due_at) return { write: [{ ...task, ...patch(task), updated_at: now }], spawned: null }
    const { next } = planCompletion(task, all, now, newId)
    return { write: [{ ...task, ...patch(task), recurrence_rule: null, updated_at: now }], spawned: next }
  }
  return { write: scopeRows(task, all, scope).map((t) => ({ ...t, ...patch(t), updated_at: now })), spawned: null }
}

/** "This one" detaches only the row: the series' next round, as completing it would spawn it (or null). */
export function detachRound(task: Task, all: readonly Task[], now: string, newId: () => string): TaskScopePlan {
  return planTaskScope(task, all, 'this', () => ({}), now, newId)
}
