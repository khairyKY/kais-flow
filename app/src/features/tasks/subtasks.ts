// Subtasks (Kai 2026-10-16, design-export/Subtasks options.html: "A and C for add a task, and the time
// display for sub tasks too, 4 C"). One level deep (tasks.parent_task_id, 0029). Pure: the lists,
// rows and completion read these; the fold store is ./subtaskStore.

import { cairoDateKey } from '../../lib/dateShortcuts'
import type { Task } from '../../lib/types'
import { timeText } from '../calendar/eventTime'
import { dayShort } from '../../components/pickerMath'
import { dayWord } from './taskSheetMath'

/** A parent's live subtasks, in the order they were added — the sheet, the popover, the editor and
 * every list draw them in this one order. */
export function subtasksOf(tasks: readonly Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parent_task_id === parentId && !t.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** The ones still open. */
export const openSubtasks = (tasks: readonly Task[], parentId: string): Task[] => subtasksOf(tasks, parentId).filter((t) => t.status === 'todo')

/** "1/3": done of all. */
export function subCount(subs: readonly Task[]): { done: number; total: number } {
  return { done: subs.filter((t) => t.status === 'done').length, total: subs.length }
}

/** A list's rows with every subtask whose parent is drawn on the same page taken out: it sits nested
 * under its parent instead (A). `drawn` = the open parents the page draws as rows. A subtask whose
 * parent isn't on the page stays a row of its own, with "↳ parent". */
export function nestOut<T extends Pick<Task, 'parent_task_id'>>(rows: readonly T[], drawn: ReadonlySet<string>): T[] {
  return rows.filter((t) => !t.parent_task_id || !drawn.has(t.parent_task_id))
}

/** When a subtask is, for its row (C): "16:00" today, "Tomorrow 16:00" / "Fri 16:00" another day —
 * on the calendar (a block or a Time slot); a date alone reads its day ("Tomorrow", "Fri 23 Oct"),
 * except today's, which says nothing. Null = unplanned (the sheet shows a faint clock there). */
export function subtaskWhen(sub: Pick<Task, 'scheduled_start' | 'due_at' | 'status'>, now: Date): string | null {
  if (sub.status !== 'todo') return null
  const today = cairoDateKey(now)
  if (sub.scheduled_start) {
    const at = new Date(sub.scheduled_start)
    const day = cairoDateKey(at)
    const time = timeText(at)
    if (day === today) return time
    return `${dayWord(day, now) === 'Tomorrow' ? 'Tomorrow' : dayShort(day).slice(0, 3)} ${time}`
  }
  if (!sub.due_at) return null
  const day = cairoDateKey(new Date(sub.due_at))
  return day === today ? null : dayWord(day, now)
}

/** The ask's note (4 C): the first open subtask on today's calendar — "Questions 1–5" at "16:00". */
export function timedToday(open: readonly Task[], now: Date): { title: string; at: string } | null {
  const today = cairoDateKey(now)
  const hit = open.find((t) => t.scheduled_start && cairoDateKey(new Date(t.scheduled_start)) === today)
  return hit ? { title: hit.title, at: timeText(new Date(hit.scheduled_start!)) } : null
}
