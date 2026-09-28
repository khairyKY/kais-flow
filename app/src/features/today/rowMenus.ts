// Today's Up next blocks (Loop A, 2026-09-26 daily cycle): a block's own moves — tomorrow at the same
// time, off the calendar — each with the calendar's own Undo, and the menu of a plain event. Task
// rows (Top 3, the goal card, task-backed Up next) use the one task-row grammar (features/tasks).

import type { ContextMenuItem } from '../../components/ContextMenu'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { toastUndo } from '../../lib/undo'
import { cairoTimeKey, cairoToIso } from '../calendar/eventTime'
import { deleteEvent, moveOrResizeEvent, restoreEvent } from '../calendar/api'
import type { CalendarEvent } from '../../lib/types'

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

/** The hint beside an Up next block's Tomorrow: its own time, a Cairo day on ("Mon 18:00"). A block
 * keeps the time it was given — only undated "Tomorrow" means 09:00 (lib/dateShortcuts). */
export function blockTomorrowHint(event: CalendarEvent): string {
  const next = new Date(sameTimeTomorrow(event.starts_at, event.ends_at).starts_at)
  return `${next.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Africa/Cairo' })} ${cairoTimeKey(next)}`
}

/** The menu on an Up next row with no task behind it: it only opens or goes. (A task-backed row
 * gets the task row's own ⋯ list — features/tasks/TaskMenu.) */
export function eventMenuItems(event: CalendarEvent, open: () => void): ContextMenuItem[] {
  return [
    { label: 'Open in calendar', onClick: open },
    { label: 'Delete', danger: true, onClick: () => deleteEventWithUndo(event) },
  ]
}
