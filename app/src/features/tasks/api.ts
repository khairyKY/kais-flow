import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { animateRowRemoval } from '../../lib/motion'
import { deleteEventsForTask, replanTaskBlocks, restoreEventsForTask } from '../calendar/api'
import { OUT_OF_SLOT } from '../calendar/slots'
import { toastAction, toastUndo } from '../../lib/undo'
import { useToastStore } from '../../lib/toastStore'
import { playCompletion } from '../../lib/sounds'
import { nextDue, nextReminderAt, ruleAfterThis } from './recurrence'
import { planCompletion, planUndo, planUndoReopen } from './completion'
import { TASK_COLUMNS } from '../../lib/columns'
import { fetchAll } from '../../lib/fetchAll'
import { scheduleToday, scheduleTomorrow } from '../../lib/dateShortcuts'
import { legacyGoalId } from '../today/goalStore'
import { dayTop3, moveInTop3, planMakeGoal, rankWrites } from '../today/top3Order'
import { cachedStarEvents } from '../today/api'
import { cairoToIso } from '../calendar/eventTime'
import { fromMin } from '../../components/pickerMath'
import { todayFor, type SpreadPick } from './planMath'
import { isTop3Today, openTop3Count } from './top3Rule'
import { placeTask, planReparent, type MoveTarget } from './move'
import { addedLine } from './taskSheetMath'
import { planListMove } from './manualOrder'
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
  /** Since 0052 a task is in a project OR an area — pass one (tasks/move.ts has the rules). */
  areaId?: string | null
  dueAt?: string | null
  reminderOffsetMin?: number | null
  durationMin?: number | null
  priority?: number | null
  /** Quick add's `*label` words. */
  labels?: string[]
  /** The AI parse's description (capture). */
  notes?: string | null
  /** One level deep (Akiflow model) — callers must not pass a task that is itself a child. */
  parentTaskId?: string | null
  /** Where the task came from (0027) — a filed GitHub issue keeps its url here. */
  externalRef?: Task['external_ref']
  /** Parked from the start (Inbox "Someday" files a capture this way, undated). */
  someday?: boolean
  /** A repeat typed with the capture ("every week", P7e A5) — its due date is the series' first day. */
  recurrenceRule?: string | null
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
    notes: input.notes ?? null,
    status: 'todo',
    due_at: input.dueAt ?? null,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    snoozed_until: null,
    recurrence_rule: input.recurrenceRule ?? null,
    labels: input.labels ?? [],
    priority: input.priority ?? null,
    duration_min: input.durationMin ?? null,
    someday: input.someday ?? false,
    area_id: input.areaId ?? null,
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

// Every setter below writes the row as the cache has it NOW, with its one field changed — never the
// object it was handed. A caller holding a task from a render ago (QuickCreate: create, then area,
// repeat, labels, Top 3, someday — each with the same `task`) used to spread that stale copy, and
// since the outbox keeps only the newest write per row, only the last field survived.
const cachedTasks = () => queryClient.getQueryData<Task[]>(['tasks']) ?? []
const cached = (t: Task) => cachedTasks().find((x) => x.id === t.id) ?? t
/** A task as the cache has it now (a subtask row's parent title), without subscribing. */
export const cachedTask = (id: string): Task | undefined => cachedTasks().find((x) => x.id === id && !x.deleted_at)

/** Writes `task`'s current row with `patch` applied — the one way a single-field edit lands. */
function patchTask(task: Task, patch: Partial<Task>): Task {
  const row = { ...cached(task), ...patch }
  writeRow('tasks', row)
  return row
}

/** A typed capture's toast (Tasks' quick add, the command bar): where it landed — "Added to Tomorrow ·
 * Forecasting" (taskSheetMath addedLine) — never a silent landing. Undo sends it to Trash, its block
 * with it. */
export function toastAdded(task: Task, place: string | null): void {
  toastUndo(addedLine(task, place, new Date()), () => deleteTask(cached(task)))
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
export function completeTask(passed: Task): CompletionUndo {
  const task = cached(passed)
  playCompletion(task) // Sounds v2: every way of checking a task off (box, swipe, menu, key) sounds once, here
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
    patchTask(task, { deleted_at: new Date().toISOString() })
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
  rescheduleTasksWithUndo(tasks, scheduleTomorrow(), { message: tasks.length === 1 ? 'Moved to tomorrow' : `${tasks.length} tasks moved to tomorrow` })
}

/** The task sheet's ⋯ → Duplicate: an open copy (same fields, not on the calendar, not in Top 3),
 * with "Duplicated · Undo" — the Undo removes the copy outright (it never should have existed). */
export function duplicateTaskWithUndo(task: Task): Task {
  const now = nowIso()
  // Like a spawned repeat (completion.ts): an imported row's idempotency key stays with the original.
  const { external_ref: _importKey, ...rest } = cached(task) as Task & { external_ref?: unknown }
  const copy: Task = { ...rest, id: crypto.randomUUID(), status: 'todo', completed_at: null, top3: false, top3_rank: null, scheduled_start: null, scheduled_end: null, slot_id: null, slot_date: null, reminder_sent: false, created_at: now, updated_at: now }
  writeRow('tasks', copy)
  logActivity('task.created', 'task', copy.id, { duplicate_of: task.id })
  toastUndo('Duplicated', () => writeRow('tasks', { id: copy.id }, 'delete'))
  return copy
}

export function restoreTask(task: Task): void {
  restoreEventsForTask(task.id)
  patchTask(task, { deleted_at: null })
  logActivity('task.restored', 'task', task.id, {})
}

export function setSomeday(task: Task, someday: boolean): void {
  patchTask(task, { someday })
  logActivity('task.someday_set', 'task', task.id, { someday })
}

const tasksLabel = (n: number) => `${n} task${n === 1 ? '' : 's'}`

/** Every move (⋯ / right-click "Move to…", the swipe, the `p` key, the task sheet, bulk): into a
 * project, an area, a domain, or out of all three (./move.ts placeTask), with one "Moved to X ·
 * Undo". Undo puts back each row's project, area, domain and milestone — only those. */
export function moveTasksWithUndo(tasks: Task[], to: MoveTarget): void {
  const place = (t: Task) => ({ project_id: t.project_id, area_id: t.area_id ?? null, domain_id: t.domain_id })
  for (const t of tasks) {
    const moved = placeTask(cached(t), to)
    writeRow('tasks', moved)
    logActivity('task.moved', 'task', t.id, place(moved))
  }
  const many = tasks.length === 1 ? '' : `${tasksLabel(tasks.length)} `
  toastUndo(to.kind === 'none' ? `${many}${many ? 'unfiled' : 'Unfiled'}` : `${many}${many ? 'moved' : 'Moved'} to ${to.name}`, () => {
    const now = queryClient.getQueryData<Task[]>(['tasks']) ?? []
    for (const t of tasks) {
      const current = now.find((c) => c.id === t.id) ?? t
      writeRow('tasks', { ...current, ...place(t), milestone_id: t.milestone_id ?? null })
      logActivity('task.moved', 'task', t.id, place(t))
    }
  })
}

/** A project or area moved to another domain takes its tasks along (their domain follows the
 * container). Returns the Undo for the tasks part. */
export function carryTasksToDomain(field: 'project_id' | 'area_id', containerId: string, domainId: string | null): () => void {
  const moved = planReparent(queryClient.getQueryData<Task[]>(['tasks']) ?? [], field, containerId, domainId)
  // The slipping view reads entity_type='task' activity: a domain carried along is a move too.
  const log = (t: Task) => logActivity('task.moved', 'task', t.id, { project_id: t.project_id, area_id: t.area_id ?? null, domain_id: t.domain_id })
  moved.forEach((m) => {
    writeRow('tasks', m.after)
    log(m.after)
  })
  return () => {
    const now = queryClient.getQueryData<Task[]>(['tasks']) ?? []
    for (const m of moved) {
      const back = { ...(now.find((c) => c.id === m.before.id) ?? m.after), domain_id: m.before.domain_id }
      writeRow('tasks', back)
      log(back)
    }
  }
}

/** Bulk re-date with one Undo (each row's date, someday flag and calendar blocks come back, via
 * rescheduleDue's own Undo) — the bulk bar's Pick date, Tomorrow, Overdue's "Reschedule all to
 * today". `timed`: the picker set a time, which puts the tasks on the calendar (calendar/replan). */
export function rescheduleTasksWithUndo(tasks: Task[], dueAt: string, { timed = false, message = `${tasksLabel(tasks.length)} scheduled` }: { timed?: boolean; message?: string } = {}): void {
  const undos = tasks.map((t) => rescheduleDue(t, dueAt, timed))
  toastUndo(message, () => undos.forEach((undo) => undo()))
}

/** Someday for one task or many — the row ⋯, the task sheet, the bulk bar — with one Undo, which
 * gives back each row's someday flag and the Top 3 place parking it took (top3Rule). */
export function somedayTasksWithUndo(tasks: Task[]): void {
  const before = tasks.map(cached)
  before.forEach((t) => setSomeday(t, true))
  toastUndo(tasks.length === 1 ? 'Parked for someday' : `${tasksLabel(tasks.length)} parked for someday`, () =>
    before.forEach((b) => {
      patchTask(b, { someday: b.someday, top3: b.top3, top3_rank: b.top3_rank ?? null })
      logActivity('task.someday_set', 'task', b.id, { someday: b.someday })
    }),
  )
}

/** A field edit the slipping view should see (it reads entity_type='task' activity). */
const logUpdate = (task: Task, field: string) => logActivity('task.updated', 'task', task.id, { field })

export function setLabels(task: Task, labels: string[]): void {
  patchTask(task, { labels })
  logUpdate(task, 'labels')
}

export function setPriority(task: Task, priority: number | null): void {
  patchTask(task, { priority })
  logUpdate(task, 'priority')
}

export function setDuration(task: Task, durationMin: number | null): void {
  patchTask(task, { duration_min: durationMin })
  logUpdate(task, 'duration')
}

/** The notes field (task sheet, popover, editor) — written once, when it's left. */
export function setNotes(task: Task, notes: string | null): void {
  patchTask(task, { notes })
  logUpdate(task, 'notes')
}

/** Client-enforced cap of 3 — no DB constraint, since that would fight the offline outbox. A star
 * joins the Top 3 last (no place yet); an unstar gives its place up. The cap counts the open picks
 * that are still today's (top3Rule), not every stale flag — a pick moved to Thursday frees its slot.
 * Returns false when the Top 3 was already full. */
export function toggleTop3(task: Task): boolean {
  const done = flipTop3(cached(task))
  // It used to fail silently, which read as "the star is broken".
  if (!done) useToastStore.getState().push({ message: 'Top 3 is full — take one out first' })
  return done
}

function flipTop3(task: Task): boolean {
  if (task.top3) {
    writeRow('tasks', { ...task, top3: false, top3_rank: null })
    logActivity('task.unstarred', 'task', task.id, {})
    return true
  }
  if (openTop3Count(cachedTasks(), new Date(), task.id) >= MAX_TOP3) return false
  const starred: Task = { ...task, top3: true, top3_rank: null, someday: false }
  // The Top 3 is today's: a pick dated another day comes to today (at its own time), or the star
  // would be given straight back by releaseTop3.
  const pick = isTop3Today(starred, new Date()) ? starred : { ...starred, due_at: todayFor(task) }
  writeRow('tasks', pick)
  logActivity('task.starred', 'task', task.id, {})
  return true
}

/** `T` with tasks selected, and the bulk bar's ☆ (Kai 2026-10-12: "select 3 tasks and press T —
 * it doesn't work"): stars the selection in order up to the free places, one Undo. When every
 * selected task is already a pick, it unstars them instead (T toggles, like on one row). */
export function toggleTop3ManyWithUndo(tasks: Task[]): void {
  const before = tasks.map(cached)
  if (before.length > 0 && before.every((t) => t.top3)) {
    before.forEach((t) => flipTop3(t))
    toastUndo(before.length === 1 ? 'Removed from Top 3' : `${tasksLabel(before.length)} removed from Top 3`, () => restoreTop3(before))
    return
  }
  const fresh = before.filter((t) => !t.top3 && !t.completed_at)
  const added = fresh.filter((t) => flipTop3(cached(t)))
  const left = fresh.length - added.length
  const full = left > 0 ? ` · Top 3 is full, ${left} left out` : ''
  if (added.length === 0) {
    useToastStore.getState().push({ message: 'Top 3 is full — take one out first' })
    return
  }
  toastUndo(`${added.length === 1 ? 'Added' : `${added.length} added`} to Top 3${full}`, () => restoreTop3(added.map((t) => before.find((b) => b.id === t.id)!)))
}

/** Today's Top 3 as drawn, goal first (today/top3Order) — what Make goal and Move up/down act on. */
export function currentTop3(): Task[] {
  return dayTop3(cachedTasks(), legacyGoalId(), cachedStarEvents())
}

/** Writes a Top 3 order (tasks.top3_rank, 1 = the goal): only the rows whose place changed. */
export function writeTop3Order(order: readonly Task[]): void {
  for (const { row, rank } of rankWrites(order.map(cached))) writeRow('tasks', { ...row, top3_rank: rank })
}

/** Puts rows' Top 3 fields back as they were (an Undo). */
function restoreTop3(before: readonly Task[]): void {
  for (const b of before) {
    const now = cached(b)
    writeRow('tasks', { ...now, top3: b.top3, top3_rank: b.top3_rank ?? null, someday: b.someday, due_at: b.due_at })
    if (now.top3 !== b.top3) logActivity(b.top3 ? 'task.starred' : 'task.unstarred', 'task', b.id, {})
  }
}

/** Kai 2026-10-07: "Just give me a button for making something the goal of the day." The task leads
 * Today's Top 3 on every device. Not in it yet, it joins — into a full Top 3 only through the swap
 * toast (6l), which takes out the last open pick that isn't the goal. "Goal of the day · Undo". */
export function makeGoalWithUndo(task: Task): void {
  const display = currentTop3()
  const plan = planMakeGoal(display, cached(task))
  const run = () => {
    const before = [...new Map([...plan.order, ...(plan.out ? [plan.out] : [])].map((t) => [t.id, cached(t)])).values()]
    if (plan.out) {
      writeRow('tasks', { ...cached(plan.out), top3: false, top3_rank: null })
      logActivity('task.unstarred', 'task', plan.out.id, {})
    }
    const t = cached(task)
    if (!t.top3) {
      writeRow('tasks', { ...t, top3: true, someday: false, top3_rank: 1 })
      logActivity('task.starred', 'task', t.id, {})
    }
    writeTop3Order(plan.order)
    logActivity('task.goal_set', 'task', t.id, {})
    toastUndo(plan.out ? `Goal of the day · ${plan.out.title} left the Top 3` : 'Goal of the day', () => restoreTop3(before))
  }
  if (plan.full) toastAction(`Top 3 is full — swap out “${plan.out!.title}”?`, 'Swap', run)
  else run()
}

/** Move up / down, Alt+↑/↓, a drag: `task` to place `to` in Today's Top 3 (0 = the goal). */
export function moveInTop3Order(task: Task, to: number): boolean {
  const order = moveInTop3(currentTop3(), task.id, to)
  if (!order) return false
  if (to === 0) return makeGoal(order, task)
  writeTop3Order(order)
  logActivity('task.top3_moved', 'task', task.id, { rank: to + 1 })
  return true
}

/** A move into the first place is a new goal: the same toast and Undo as Make goal. */
function makeGoal(order: Task[], task: Task): boolean {
  const before = order.map(cached)
  writeTop3Order(order)
  logActivity('task.goal_set', 'task', task.id, {})
  toastUndo('Goal of the day', () => restoreTop3(before))
  return true
}

// A burst of ⌘↑/↓ on the same rows is one Undo, back to where they were before the first press —
// each press replaces the last one's toast instead of queueing six seconds of toasts per press.
let lastMove: { key: string; toastId: string; before: Map<string, number | null> } | null = null

/** ⌘/Ctrl+↑/↓ (p7e A22): `rows` — the focused task, or the selection — one place up (-1) or down
 * (+1) within each of `groups` (a page's rows as drawn, ./manualOrder). Writes tasks.sort_order
 * (0076) through the outbox; one Undo. False when nothing could move. */
export function moveInListWithUndo(groups: readonly (readonly Task[])[], rows: readonly Task[], dir: -1 | 1): boolean {
  const ids = new Set(rows.map((t) => t.id))
  const writes = groups.flatMap((g) => planListMove(g, ids, dir) ?? [])
  if (!writes.length) return false
  const key = [...ids].sort().join()
  const { toasts, dismiss } = useToastStore.getState()
  const burst = lastMove?.key === key && toasts.some((t) => t.id === lastMove!.toastId) ? lastMove : null
  const before = new Map(burst?.before)
  for (const { row, sort_order } of writes) {
    if (!before.has(row.id)) before.set(row.id, cached(row).sort_order ?? null)
    patchTask(row, { sort_order })
  }
  if (burst) dismiss(burst.toastId)
  toastUndo(rows.length > 1 ? `${rows.length} tasks moved` : `Moved ${dir < 0 ? 'up' : 'down'}`, () => {
    for (const [id, sort_order] of before) {
      const t = cachedTask(id)
      if (t) patchTask(t, { sort_order })
    }
  })
  lastMove = { key, toastId: useToastStore.getState().toasts.at(-1)?.id ?? '', before }
  return true
}

export function renameTask(task: Task, title: string): void {
  patchTask(task, { title })
  logUpdate(task, 'title')
}

/** Replan all → Spread into free slots, once the preview is confirmed (planMath spreadPlan): a
 * placed task gets its slot's time — a timed replan, so its block moves there (calendar/replan) —
 * and the rest go to tomorrow, first thing. One Undo for all of it. */
export function spreadWithUndo(picks: readonly SpreadPick[]): void {
  const at = (day: string, min: number) => cairoToIso(day, fromMin(min))
  const undos = picks.map(({ task, slot }) => (slot ? rescheduleDue(task, at(slot.day, slot.start), true) : rescheduleDue(task, scheduleTomorrow())))
  const placed = picks.filter((p) => p.slot).length
  toastUndo(`${picks.length} replanned · ${placed} today, ${picks.length - placed} tomorrow`, () => undos.forEach((undo) => undo()))
}

/** Setting a real due date is a "plan action" — clears `someday` (per the phase's own rule: date/schedule/top-3 all clear it).
 * Every replan funnels through here (menus, swipes, keys, bulk bars, rituals, the task sheet and
 * editor), so its calendar blocks follow here too (Kai 2026-10-07: an overdue task replanned stayed
 * stuck on the calendar): `timed` = a time was set, which puts it on the calendar at that time; a
 * date alone takes a block from another day off (calendar/replan.ts has the rule). Returns the
 * Undo: the row and its blocks exactly as they were. */
export function rescheduleDue(task: Task, dueAt: string | null, timed = false): () => void {
  const before = cached(task)
  // Replanned, a task leaves its Time slot (0073): a date alone is off the calendar, a time gets a block.
  const slot = before.slot_id ? { slot_id: before.slot_id, slot_date: before.slot_date ?? null, scheduled_start: before.scheduled_start, scheduled_end: before.scheduled_end } : null
  patchTask(before, { due_at: dueAt, someday: dueAt ? false : before.someday, ...(slot ? OUT_OF_SLOT : null) })
  logActivity('task.rescheduled', 'task', task.id, { due_at: dueAt })
  const undoBlocks = replanTaskBlocks(before, dueAt, timed)
  return () => {
    undoBlocks()
    const now = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === task.id) ?? before
    // A pick moved off today gave its Top 3 place up (top3Rule); Undo gives it back.
    writeRow('tasks', { ...now, due_at: before.due_at, someday: before.someday, top3: before.top3, top3_rank: before.top3_rank, ...slot })
    logActivity('task.rescheduled', 'task', task.id, { due_at: before.due_at })
  }
}

/** A repeat needs a date to roll from (completion spawns the next copy from due_at): one set on an
 * undated task dates it today, first thing, and says so — it used to never repeat, silently. */
export function setRecurrence(task: Task, rule: string | null): void {
  const undated = !!rule && !cached(task).due_at
  const dueAt = undated ? scheduleToday() : undefined
  patchTask(task, { recurrence_rule: rule, ...(dueAt ? { due_at: dueAt, someday: false } : null) })
  logActivity('task.recurrence_set', 'task', task.id, { rule })
  if (dueAt) {
    logActivity('task.rescheduled', 'task', task.id, { due_at: dueAt })
    useToastStore.getState().push({ message: 'Repeats from today' })
  }
}

export function setReminder(task: Task, reminderAt: string | null): void {
  patchTask(task, { reminder_at: reminderAt, reminder_sent: false })
  logActivity('task.reminder_set', 'task', task.id, { reminder_at: reminderAt })
}

export function pauseTask(task: Task): void {
  patchTask(task, { paused: true })
  logActivity('task.paused', 'task', task.id, {})
}

export function resumeTask(task: Task): void {
  patchTask(task, { paused: false })
  logActivity('task.resumed', 'task', task.id, {})
}

export function skipNextOccurrence(passed: Task): void {
  const task = cached(passed)
  if (task.recurrence_rule && task.due_at) {
    // The round after this one — and never one that's already past (./recurrence nextDue).
    const next = nextDue(task.recurrence_rule, task.due_at, new Date())
    if (next) {
      // Polish F2a: the reminder moves with the occurrence (same lead, not yet sent) — left
      // behind, it pointed at the skipped time and never fired for the new one.
      // A skip uses up one of "N times" too (p7e A13); nextDue is null on the last one.
      writeRow('tasks', { ...task, due_at: next.toISOString(), recurrence_rule: ruleAfterThis(task.recurrence_rule), reminder_at: nextReminderAt(task.reminder_at, task.due_at, next), reminder_sent: false })
      logActivity('task.skipped', 'task', task.id, { next_due_at: next.toISOString() })
    }
  }
}

