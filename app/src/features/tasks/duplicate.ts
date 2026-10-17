// Duplicate (Kai 2026-10-17: "we need to add duplicating options") — the row menu, ⌘/Ctrl+D, the bulk
// bar, the task sheet's ⋯, a task's calendar block, and a whole project. Pure: tasks/api and
// projects/api write what these return, with one Undo each.

import type { Project, Task } from '../../lib/types'
import { subtasksOf } from './subtasks'

export interface TaskCopy {
  copy: Task
  /** The task it copies. */
  of: string
}

/** Each picked task as an open copy — same fields, not on the calendar, out of the Top 3 and any Time
 * slot, the import key left with the original (as a spawned repeat, completion.ts). A parent's
 * subtasks come along as open subtasks of its copy, in their order; a subtask's copy stays under the
 * same parent — unless its parent is picked too, then it rides along with the parent's copy once.
 * Parents come before their subtasks (the Undo removes them last first). `all`: every task (the cache). */
export function duplicateRows(picked: readonly Task[], all: readonly Task[], now: Date, newId: () => string = () => crypto.randomUUID()): TaskCopy[] {
  const ids = new Set(picked.map((t) => t.id))
  // Each copy a millisecond on, so subtasksOf (by created_at) keeps their order.
  let tick = 0
  const copy = (t: Task, over: Partial<Task> = {}): TaskCopy => {
    const { external_ref: _importKey, ...rest } = t
    const at = new Date(now.getTime() + tick++).toISOString()
    return {
      of: t.id,
      copy: { ...rest, id: newId(), status: 'todo', completed_at: null, top3: false, top3_rank: null, scheduled_start: null, scheduled_end: null, slot_id: null, slot_date: null, reminder_sent: false, deleted_at: null, created_at: at, updated_at: at, ...over },
    }
  }
  const out: TaskCopy[] = []
  for (const t of picked) {
    if (t.parent_task_id && ids.has(t.parent_task_id)) continue
    const c = copy(t)
    out.push(c)
    if (!t.parent_task_id) for (const s of subtasksOf(all, t.id)) out.push(copy(s, { parent_task_id: c.copy.id }))
  }
  return out
}

/** "Duplicated" / "3 tasks duplicated", with ", with its 2 subtasks" when they came along. */
export function duplicateMessage(rows: readonly TaskCopy[]): string {
  const top = rows.filter((r) => !rows.some((p) => p.copy.id === r.copy.parent_task_id)).length
  const subs = rows.length - top
  const head = top === 1 ? 'Duplicated' : `${top} tasks duplicated`
  return subs ? `${head}, with ${top === 1 ? 'its' : 'their'} ${subs} subtask${subs === 1 ? '' : 's'}` : head
}

/** Duplicate project: the same name + " (copy)", active, its milestones and checklist afresh (unticked,
 * new ids), and every live task of it (with their subtasks) as an open copy — unscheduled, undated, out
 * of the Top 3 — each still on its milestone (the copy's) and a task-linked line linked to its task's
 * copy. A task in the project under a parent elsewhere keeps that parent. */
export function duplicateProjectRows(project: Project, all: readonly Task[], now: Date, newId: () => string = () => crypto.randomUUID()): { project: Project; tasks: TaskCopy[] } {
  const at = now.toISOString()
  const milestoneIds = new Map((project.milestones ?? []).map((m) => [m.id, newId()]))
  const live = all.filter((t) => t.project_id === project.id && !t.deleted_at)
  const inProject = new Set(live.map((t) => t.id))
  // The project's tasks, a parent's subtasks with it (wherever they're filed), each once.
  const rows = duplicateRows(live.filter((t) => !t.parent_task_id || !inProject.has(t.parent_task_id)), all, now, newId)
  const copyOf = new Map(rows.map((r) => [r.of, r.copy.id]))
  const pid = newId()
  const tasks = rows.map((r) => ({
    of: r.of,
    copy: {
      ...r.copy,
      project_id: r.copy.project_id === project.id ? pid : r.copy.project_id,
      due_at: null,
      reminder_at: null,
      snoozed_until: null,
      sort_order: null,
      milestone_id: r.copy.milestone_id ? (milestoneIds.get(r.copy.milestone_id) ?? null) : null,
    },
  }))
  const copy: Project = {
    ...project,
    id: pid,
    name: `${project.name} (copy)`,
    status: 'active',
    milestones: (project.milestones ?? []).map((m) => ({ ...m, id: milestoneIds.get(m.id)!, completed: false })),
    checklist: (project.checklist ?? []).map((l) => ({ ...l, id: newId(), completed: false, task_id: l.task_id ? (copyOf.get(l.task_id) ?? null) : null })),
    completion_summary: null,
    deleted_at: null,
    created_at: at,
    updated_at: at,
  }
  return { project: copy, tasks }
}
