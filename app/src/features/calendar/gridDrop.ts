import type { CalendarEvent, InboxItem, Task } from '../../lib/types'
import { fileToCalendar } from '../inbox/api'
import { putInSlotWithUndo, scheduleTaskWithUndo } from './api'
import { inSlot, slotAt } from './slots'

/** drag-fix (Kai 2026-10-26: "drag a task to schedule isn't working"): a task or an inbox capture let go on
 * the grid at `start` — the desktop's rail, day-tray and planning cards and the phone's held tray chips all
 * land here. On a Time block a task goes in (one already in it stays). Otherwise it gets a block `minutes`
 * long there through scheduleTaskWithUndo (the shared length rule; its block moves if it has one; one Undo),
 * and a capture is filed and blocked. Returns the block, or null when none was made. */
export function dropOnGrid(from: { task?: Task; item?: InboxItem }, start: string, minutes: number, events: readonly CalendarEvent[], allDay = false): CalendarEvent | null {
  const { task, item } = from
  const slot = task && !allDay ? slotAt(events, start) : undefined
  if (task && slot) {
    if (!inSlot(task, slot)) putInSlotWithUndo(task, slot)
    return null
  }
  const end = new Date(Date.parse(start) + minutes * 60_000).toISOString()
  return task ? scheduleTaskWithUndo(task, start, end, allDay) : item ? fileToCalendar(item, start, end, allDay) : null
}
