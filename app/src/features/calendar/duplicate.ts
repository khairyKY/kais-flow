import { toastUndo } from '../../lib/undo'
import { writeRow } from '../../lib/outbox'
import type { CalendarEvent, Task } from '../../lib/types'
import { duplicateTasks } from '../tasks/api'
import { copyEvent, placeTask } from './api'

/** A block's Duplicate (BlockMenu, the phone's event sheet — Kai 2026-10-17), with one Undo: a plain
 * event copies to the same time; a task's block duplicates the task (its subtasks along) and blocks
 * the copy at the same time. blockMenuSpec never offers it on a Time block or a Google event.
 * `at`: Ctrl+drag's drop (menu B, cal-blocks) — the copy lands there instead. `oneOff` (cal-clicks, a repeating
 * task's "This one"): the copy doesn't repeat. */
export function duplicateBlockWithUndo(event: CalendarEvent, task?: Task, at?: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>, oneOff = false): void {
  if (!event.task_id) {
    const { copy, undo } = copyEvent(event, at)
    toastUndo(`Duplicated · ${copy.title}`, undo)
    return
  }
  if (!task) return
  const d = duplicateTasks([task])
  const when = at ?? event
  const copy = oneOff && d.copies[0].recurrence_rule ? { ...d.copies[0], recurrence_rule: null } : d.copies[0]
  if (copy !== d.copies[0]) writeRow('tasks', copy)
  const placed = placeTask(copy, when.starts_at, when.ends_at, when.all_day)
  toastUndo(d.message, () => {
    placed.undo()
    d.undo()
  })
}
