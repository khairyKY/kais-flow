// Today's row menus (Loop A, 2026-09-26 daily cycle). Kai: "I can't right click what is in the up
// next section." docs/DAILY-CYCLE.md: "Every row that shows a task behaves like a task: click opens
// it, right-click gives the task menu, the checkbox completes it with Undo. No display-only task
// rows anywhere."
//
// No new data paths: every action below is an existing tasks/api or calendar/api call, and every
// calendar change toasts the same Undo the calendar block's own menu does (CalendarPage.tsx
// unscheduleWithUndo / deleteWithUndo, and the drag-move Undo). Labels reuse the words those menus
// already use — "Complete"/"Reopen" and "Open details" (Today's task rows), "Unschedule" (the
// calendar block) — so one action reads the same everywhere.

import type { ContextMenuItem } from '../../components/ContextMenu'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { toastUndo } from '../../lib/undo'
import { cairoTimeKey, cairoToIso } from '../calendar/eventTime'
import { deleteEvent, moveOrResizeEvent, restoreEvent } from '../calendar/api'
import { completeTaskWithUndo, deleteTask, reopenTaskWithUndo, rescheduleDue, setSomeday, toggleTop3 } from '../tasks/api'
import type { CalendarEvent, Task } from '../../lib/types'

/** The same Cairo wall-clock slot one Cairo day later, same length. DST-safe: the new start is
 * read from the tz database for its own date, not "+24h" (Egypt shifts its clock twice a year). */
export function sameTimeTomorrow(startsAt: string, endsAt: string): { starts_at: string; ends_at: string } {
  const start = new Date(startsAt)
  const [y, m, d] = cairoDateKey(start).split('-').map(Number)
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  const starts_at = cairoToIso(nextDay, cairoTimeKey(start))
  const length = new Date(endsAt).getTime() - start.getTime()
  return { starts_at, ends_at: new Date(new Date(starts_at).getTime() + length).toISOString() }
}

/** Takes a block off the calendar; a task-linked one leaves its task unscheduled (calendar/api
 * deleteEvent). Same toast + Undo as the calendar block's "Unschedule". */
export function unscheduleWithUndo(event: CalendarEvent): void {
  const prior = { ...event }
  deleteEvent(event)
  toastUndo(`Unscheduled · ${event.title}`, () => restoreEvent(prior))
}

/** Same toast + Undo as the calendar block's "Delete". */
export function deleteEventWithUndo(event: CalendarEvent): void {
  const prior = { ...event }
  deleteEvent(event)
  toastUndo(`Deleted · ${event.title}`, () => restoreEvent(prior))
}

/** Moves the block to the same time tomorrow — the calendar's own move path (a drag), which also
 * re-stamps a linked task's schedule — with the drag's Undo. */
export function moveBlockToTomorrow(event: CalendarEvent): void {
  const prior = { ...event }
  const next = sameTimeTomorrow(event.starts_at, event.ends_at)
  moveOrResizeEvent(event, next.starts_at, next.ends_at)
  toastUndo(`Moved to tomorrow · ${event.title}`, () => moveOrResizeEvent(prior, prior.starts_at, prior.ends_at, prior.all_day))
}

export interface RowMenuContext {
  /** Opens the row: a task's editor, or the calendar for a plain event. */
  open: () => void
  /** The one Start focus path (./startFocus). */
  startFocus: (task: Task) => void
}

/** The menu on every task row Today draws (Top 3, the goal card, All open). The same items and
 * order the row had since Kai's 2026-07-21 ruling, with Start focus added on top. */
export function taskMenuItems(task: Task, ctx: RowMenuContext & { selected?: boolean; onToggleSelect?: () => void }): ContextMenuItem[] {
  const done = !!task.completed_at
  return [
    { label: 'Start focus', onClick: () => ctx.startFocus(task), disabled: done },
    done ? { label: 'Reopen', onClick: () => reopenTaskWithUndo(task) } : { label: 'Complete', onClick: () => completeTaskWithUndo(task) },
    { label: task.top3 ? 'Unstar' : 'Star for today', onClick: () => toggleTop3(task) },
    { label: 'Due today', onClick: () => rescheduleDue(task, new Date().toISOString()), disabled: done },
    { label: 'Due tomorrow', onClick: () => rescheduleDue(task, new Date(Date.now() + 86_400_000).toISOString()), disabled: done },
    { label: 'Someday', onClick: () => setSomeday(task, true), disabled: done },
    ...(ctx.onToggleSelect && !done ? [{ label: ctx.selected ? 'Deselect' : 'Select', onClick: ctx.onToggleSelect, shortcut: '⌃click' }] : []),
    { label: 'Open details', onClick: ctx.open },
    { label: 'Delete', danger: true, onClick: () => deleteTask(task) },
  ]
}

/** The menu on an Up next row. A block linked to a task gets the task's moves plus the block's
 * own (tomorrow, off the calendar); a plain event only opens or goes. */
export function upNextMenuItems(event: CalendarEvent, task: Task | undefined, ctx: RowMenuContext): ContextMenuItem[] {
  if (!task) {
    return [
      { label: 'Open in calendar', onClick: ctx.open },
      { label: 'Delete', danger: true, onClick: () => deleteEventWithUndo(event) },
    ]
  }
  const done = task.status === 'done'
  return [
    { label: 'Start focus', onClick: () => ctx.startFocus(task), disabled: done },
    done ? { label: 'Reopen', onClick: () => reopenTaskWithUndo(task) } : { label: 'Complete', onClick: () => completeTaskWithUndo(task) },
    { label: 'Open details', onClick: ctx.open },
    { label: 'Move to tomorrow', onClick: () => moveBlockToTomorrow(event), disabled: done },
    { label: 'Unschedule', onClick: () => unscheduleWithUndo(event) },
  ]
}
