import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { animateRowRemoval } from '../../lib/motion'
import { deleteEventsForTask, replanTaskBlocks, restoreEventsForTask } from '../calendar/api'
import { toastUndo } from '../../lib/undo'
import { nextOccurrence, nextReminderAt } from './recurrence'
import { planCompletion, planUndo, planUndoReopen } from './completion'
import { TASK_COLUMNS } from '../../lib/columns'
import { fetchAll } from '../../lib/fetchAll'
import { scheduleTomorrow } from '../../lib/dateShortcuts'
import type { Task } from '../../lib/types'

const MAX_TOP3 = 3

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      return fetchAll<Task>((from, to) =>
        supabase.from('tasks').select(TASK_COLUMNS).order('due_at', { nullsFirst: false }).order('id').range(from, to),
      )
    },
    select: (tasks) => tasks.filter((t) => !t.deleted_at),
  })
}

function nowIso() {
  return new Date().toISOString()
}

export interface CreateTaskInput {
  title: string
  domainId?: string | null
  projectId?: string | null
  dueAt?: string | null
  reminderOffsetMin?: number | null
  durationMin?: number | null
  priority?: number | null
  /** Quick add's `*label` words. */
  labels?: string[]
  /** One level deep (Akiflow model) — callers must not pass a task that is itself a child. */
  parentTaskId?: string | null
  /** Where the task came from (0027) — a filed GitHub issue keeps its url here. */
  externalRef?: Task['external_ref']
}

export function createTask(input: CreateTaskInput): Task {
  const base = input.dueAt || input.reminderOffsetMin ? (input.dueAt ?? null) : null
  const reminderAt = base && input.reminderOffsetMin
    ? new Date(new Date(base).getTime() - input.reminderOffsetMin * 60 * 1000).toISOString()
    : null
  const task: Task = {
    id: crypto.randomUUID(),
    project_id: input.projectId ?? null,
    domain_id: input.domainId ?? null,
    title: input.title,
    notes: null,
    status: 'todo',
    due_at: input.dueAt ?? null,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    snoozed_until: null,
    recurrence_rule: null,
    labels: input.labels ?? [],
    priority: input.priority ?? null,
    duration_min: input.durationMin ?? null,
    someday: false,
    area_id: null,
    reminder_at: reminderAt,
    reminder_sent: false,
    completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    // ponytail: key only present when set — plain task inserts stay valid until 0029 is pushed
    ...(input.parentTaskId ? { parent_task_id: input.parentTaskId } : {}),
    ...(input.externalRef ? { external_ref: input.externalRef } : {}),
  }
  writeRow('tasks', task)
  logActivity('task.created', 'task', task.id, { title: input.title })
  return task
}

/** Everything needed to take a completion back: the row as it was, and the occurrence it spawned. */
export interface CompletionUndo {
  before: Task
  spawned: Task | null
}

// This session's completions, so "Reopen" right after a check (Today's filled check, the Done
// list's menu) takes the spawned occurrence back just like the toast's Undo does. A reload
// forgets it; planCompletion's already-open check still stops a second copy then.
const recentCompletions = new Map<string, CompletionUndo>()

/** Completing a recurring task materializes its next occurrence as a fresh task (completion.ts). */
export function completeTask(task: Task): CompletionUndo {
  const plan = planCompletion(task, queryClient.getQueryData<Task[]>(['tasks']) ?? [], nowIso(), () => crypto.randomUUID())
  writeRow('tasks', plan.done)
  logActivity('task.completed', 'task', task.id, {})
  if (plan.next) {
    writeRow('tasks', plan.next)
    logActivity('task.created', 'task', plan.next.id, { recurrence_parent: task.id })
  }
  const undo: CompletionUndo = { before: task, spawned: plan.next }
  recentCompletions.set(task.id, undo)
  return undo
}

/** Takes a completion back exactly: status, completed_at and top3 as they were, and the next
 * occurrence it spawned removed (a hard delete — it never should have existed, so it doesn't go
 * to Trash). Same outbox path as the completion, so it works offline too. */
export function undoCompletion(undo: CompletionUndo): void {
  takeBackCompletion(undo)
}

/** undoCompletion's writes; returns the id of the next occurrence it removed, if any. */
function takeBackCompletion(undo: CompletionUndo): string | null {
  recentCompletions.delete(undo.before.id)
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const current = tasks.find((t) => t.id === undo.before.id) ?? undo.before
  const spawnedNow = undo.spawned ? tasks.find((t) => t.id === undo.spawned!.id) : undefined
  const { restore, removeId } = planUndo(current, undo.before, undo.spawned, spawnedNow)
  writeRow('tasks', restore)
  logActivity('task.reopened', 'task', restore.id, {})
  if (removeId) writeRow('tasks', { id: removeId }, 'delete')
  return removeId
}

/** Punch 6: a single check toasts "Done" with Undo (PAGE_BEHAVIORS.md: "Check → check pop (3b) +
 * toast 'Done — Undo'"). `afterUndo` lets a list put back what it animated away. */
export function completeTaskWithUndo(task: Task, afterUndo?: () => void): CompletionUndo {
  const undo = completeTask(task)
  toastUndo('Done', () => {
    undoCompletion(undo)
    afterUndo?.()
  })
  return undo
}

/** Everything needed to take a Reopen back (Polish F2a). */
export interface ReopenUndo {
  /** The row as it was just before the Reopen (done). */
  before: Task
  /** The completion the Reopen took back, when it was this session's — Undo re-arms it, so a
   * later Reopen still takes the next occurrence away. */
  completion: CompletionUndo | null
  /** The next occurrence the Reopen removed, which Undo puts back. */
  removed: Task | null
}

/** Reopens a done task. Right after this session's check it takes that completion back exactly,
 * spawned next occurrence and all (undoCompletion); otherwise it just flips the row back to open.
 * Reads the row from the cache, so a list that still draws it open (Tasks' grace window) can pass
 * the row it has. */
export function reopenTask(task: Task): ReopenUndo {
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const before = tasks.find((t) => t.id === task.id) ?? task
  const recent = recentCompletions.get(task.id) ?? null
  if (recent) {
    const removedId = takeBackCompletion(recent)
    const removed = removedId ? (tasks.find((t) => t.id === removedId) ?? recent.spawned) : null
    return { before, completion: recent, removed }
  }
  writeRow('tasks', { ...before, status: 'todo', completed_at: null })
  logActivity('task.reopened', 'task', task.id, {})
  return { before, completion: null, removed: null }
}

/** Takes a Reopen back: the completion as it was (same completed_at), and the next occurrence the
 * Reopen removed put back — unless an open copy of it is on the list again. */
export function undoReopen(undo: ReopenUndo): void {
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const current = tasks.find((t) => t.id === undo.before.id) ?? undo.before
  const { restore, reinsert } = planUndoReopen(current, undo.before, undo.removed, tasks)
  writeRow('tasks', restore)
  logActivity('task.completed', 'task', restore.id, {})
  if (reinsert) {
    writeRow('tasks', reinsert)
    logActivity('task.created', 'task', reinsert.id, { recurrence_parent: restore.id })
  }
  if (undo.completion) recentCompletions.set(restore.id, undo.completion)
}

/** Polish F2a (2026-09-26 decision): a second click on a just-checked row reopens it, with the
 * same Undo a check gets. Also every other "Reopen" a person clicks (the filled ✓, the menu). */
export function reopenTaskWithUndo(task: Task, afterUndo?: () => void): ReopenUndo {
  const undo = reopenTask(task)
  toastUndo('Reopened', () => {
    undoReopen(undo)
    afterUndo?.()
  })
  return undo
}

/** A checkbox bound straight to the task's status (Up next, the task editor): done reopens, open
 * completes — each with its Undo. */
export function toggleTaskWithUndo(task: Task): void {
  if (task.status === 'done') reopenTaskWithUndo(task)
  else completeTaskWithUndo(task)
}

/** Reopen without a toast — surfaces that put up their own (or none). */
export function uncompleteTask(task: Task): void {
  reopenTask(task)
}

/** Moves the task (and any calendar block scheduled for it) to Trash — a soft delete that
 * restoreTask puts back. `after` runs once the write has landed. */
export function deleteTask(task: Task, after?: () => void): void {
  // Motion 3e (WB-1) — the exit lives here rather than at each call site: every task list
  // renders id="task-<id>" on its row, so this one wiring point covers the row menu, swipe,
  // done-row menu, the `#` keyboard delete, bulk delete, Today and Perennials "end series".
  // animateRowRemoval falls through to an immediate mutation when there's no element on
  // screen (bulk from a different view, tests) or under reduced motion.
  animateRowRemoval(document.getElementById(`task-${task.id}`), () => {
    deleteEventsForTask(task.id)
    writeRow('tasks', { ...task, deleted_at: new Date().toISOString() })
    logActivity('task.deleted', 'task', task.id, {})
    after?.()
  })
}

/** Every task delete a person makes (Flow Audit §4): straight to Trash, no confirm, "Moved to
 * Trash · Undo". The toast waits for the last write, so an Undo can never land before it. Only
 * Trash's own "Delete forever" / "Empty" confirm. */
export function deleteTasksWithUndo(tasks: Task[]): void {
  let left = tasks.length
  const message = tasks.length === 1 ? 'Moved to Trash' : `${tasks.length} tasks moved to Trash`
  for (const t of tasks) {
    deleteTask(t, () => {
      if (--left === 0) toastUndo(message, () => tasks.forEach(restoreTask))
    })
  }
}

/** The one "Tomorrow" (lib/dateShortcuts scheduleTomorrow: tomorrow 09:00) with "Moved to
 * tomorrow · Undo" — swipe, ⋯, the `2` key, the bulk bar, the morning ritual. Undo writes each
 * row back as it was (due date and someday flag). */
export function moveToTomorrowWithUndo(tasks: Task[]): void {
  const at = scheduleTomorrow()
  const undos = tasks.map((t) => rescheduleDue(t, at))
  toastUndo(tasks.length === 1 ? 'Moved to tomorrow' : `${tasks.length} tasks moved to tomorrow`, () => undos.forEach((undo) => undo()))
}

/** The task sheet's ⋯ → Duplicate: an open copy (same fields, not on the calendar, not in Top 3),
 * with "Duplicated · Undo" — the Undo removes the copy outright (it never should have existed). */
export function duplicateTaskWithUndo(task: Task): Task {
  const now = nowIso()
  // Like a spawned repeat (completion.ts): an imported row's idempotency key stays with the original.
  const { external_ref: _importKey, ...rest } = task as Task & { external_ref?: unknown }
  const copy: Task = { ...rest, id: crypto.randomUUID(), status: 'todo', completed_at: null, top3: false, scheduled_start: null, scheduled_end: null, reminder_sent: false, created_at: now, updated_at: now }
  writeRow('tasks', copy)
  logActivity('task.created', 'task', copy.id, { duplicate_of: task.id })
  toastUndo('Duplicated', () => writeRow('tasks', { id: copy.id }, 'delete'))
  return copy
}

export function restoreTask(task: Task): void {
  restoreEventsForTask(task.id)
  writeRow('tasks', { ...task, deleted_at: null })
  logActivity('task.restored', 'task', task.id, {})
}

export function setSomeday(task: Task, someday: boolean): void {
  writeRow('tasks', { ...task, someday })
  logActivity('task.someday_set', 'task', task.id, { someday })
}

/** Every move (⋯ / right-click "Move to project…", the swipe, the `p` key, the task sheet, bulk).
 * A task lives in a project or an area, not both (Kai 2026-10-06): kept, the old area_id won the
 * row's tag and the area page kept listing it, so a move never looked like it happened. A
 * milestone belongs to its own project, so it stays behind. */
export function setProject(task: Task, projectId: string | null, domainId: string | null): void {
  const leaving = projectId !== task.project_id && !!task.milestone_id
  writeRow('tasks', { ...task, project_id: projectId, domain_id: domainId, area_id: projectId ? null : task.area_id, ...(leaving ? { milestone_id: null } : null) })
  logActivity('task.moved', 'task', task.id, { project_id: projectId })
}

export function setLabels(task: Task, labels: string[]): void {
  writeRow('tasks', { ...task, labels })
}

export function setPriority(task: Task, priority: number | null): void {
  writeRow('tasks', { ...task, priority })
}

export function setDuration(task: Task, durationMin: number | null): void {
  writeRow('tasks', { ...task, duration_min: durationMin })
}

/** Client-enforced cap of 3 — no DB constraint, since that would fight the offline outbox. */
export function toggleTop3(task: Task): void {
  if (!task.top3) {
    const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
    const currentTop3Count = tasks.filter((t) => t.top3 && t.id !== task.id).length
    if (currentTop3Count >= MAX_TOP3) return
  }
  writeRow('tasks', { ...task, top3: !task.top3, someday: task.top3 ? task.someday : false })
  logActivity(task.top3 ? 'task.unstarred' : 'task.starred', 'task', task.id, {})
}

export function renameTask(task: Task, title: string): void {
  writeRow('tasks', { ...task, title })
}

/** Setting a real due date is a "plan action" — clears `someday` (per the phase's own rule: date/schedule/top-3 all clear it).
 * Every replan funnels through here (menus, swipes, keys, bulk bars, rituals, the task sheet and
 * editor), so its calendar blocks follow here too (Kai 2026-10-07: an overdue task replanned stayed
 * stuck on the calendar): `timed` = a time was set, which puts it on the calendar at that time; a
 * date alone takes a block from another day off (calendar/replan.ts has the rule). Returns the
 * Undo: the row and its blocks exactly as they were. */
export function rescheduleDue(task: Task, dueAt: string | null, timed = false): () => void {
  const before = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === task.id) ?? task
  writeRow('tasks', { ...task, due_at: dueAt, someday: dueAt ? false : task.someday })
  logActivity('task.rescheduled', 'task', task.id, { due_at: dueAt })
  const undoBlocks = replanTaskBlocks(task, dueAt, timed)
  return () => {
    undoBlocks()
    const now = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === task.id) ?? before
    writeRow('tasks', { ...now, due_at: before.due_at, someday: before.someday })
    logActivity('task.rescheduled', 'task', task.id, { due_at: before.due_at })
  }
}

export function setRecurrence(task: Task, rule: string | null): void {
  writeRow('tasks', { ...task, recurrence_rule: rule })
  logActivity('task.recurrence_set', 'task', task.id, { rule })
}

export function setReminder(task: Task, reminderAt: string | null): void {
  writeRow('tasks', { ...task, reminder_at: reminderAt, reminder_sent: false })
  logActivity('task.reminder_set', 'task', task.id, { reminder_at: reminderAt })
}

export function pauseTask(task: Task): void {
  writeRow('tasks', { ...task, paused: true })
  logActivity('task.paused', 'task', task.id, {})
}

export function resumeTask(task: Task): void {
  writeRow('tasks', { ...task, paused: false })
  logActivity('task.resumed', 'task', task.id, {})
}

export function skipNextOccurrence(task: Task): void {
  if (task.recurrence_rule && task.due_at) {
    const next = nextOccurrence(task.recurrence_rule, new Date(task.due_at))
    if (next) {
      // Polish F2a: the reminder moves with the occurrence (same lead, not yet sent) — left
      // behind, it pointed at the skipped time and never fired for the new one.
      writeRow('tasks', { ...task, due_at: next.toISOString(), reminder_at: nextReminderAt(task.reminder_at, task.due_at, next), reminder_sent: false })
      logActivity('task.skipped', 'task', task.id, { next_due_at: next.toISOString() })
    }
  }
}

