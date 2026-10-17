import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { duplicateTasks } from '../tasks/api'
import { copyEvent, placeTask } from './api'

/** A block's Duplicate (BlockMenu, the phone's event sheet — Kai 2026-10-17), with one Undo: a plain
 * event copies to the same time; a task's block duplicates the task (its subtasks along) and blocks
 * the copy at the same time. blockMenuSpec never offers it on a Time block or a Google event. */
export function duplicateBlockWithUndo(event: CalendarEvent, task?: Task): void {
  if (!event.task_id) {
    const { copy, undo } = copyEvent(event)
    toastUndo(`Duplicated · ${copy.title}`, undo)
    return
  }
  if (!task) return
  const d = duplicateTasks([task])
  const placed = placeTask(d.copies[0], event.starts_at, event.ends_at, event.all_day)
  toastUndo(d.message, () => {
    placed.undo()
    d.undo()
  })
}
