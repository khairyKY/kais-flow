// The Private switch (v1.6.6): one flag on an event, a Time block or a task. A Private item shows to people you share with as a
// Busy block (when it has a time) and never as a title, a note or a Top 3 pick - the server masks it at every level. Written like any
// other change: through the outbox, with an Undo. A repeating event is private as a whole series (its row), the occurrences
// dragged out of it with it (the server reads their series).
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'

/** The stored row behind a block on the grid: an occurrence of a series is its series row. */
function eventRow(e: Pick<CalendarEvent, 'id' | 'seriesId'>): CalendarEvent | undefined {
  const rows = queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []
  const id = e.seriesId ?? e.id.split('::')[0]
  return rows.find((r) => r.id === id)
}

export const isPrivateEvent = (e: Pick<CalendarEvent, 'private'>): boolean => !!e.private
export const isPrivateTask = (t: Pick<Task, 'private'>): boolean => !!t.private

/** Switches an event or Time block (a Google or subscribed event too: Private is ours, not Google's) between Private and shown. */
export function setEventPrivate(e: CalendarEvent, on: boolean): void {
  const row = eventRow(e)
  if (!row || !!row.private === on) return
  writeRow('calendar_events', { ...row, private: on })
  toastUndo(on ? `Private · ${row.title}` : `No longer private · ${row.title}`, () => writeRow('calendar_events', row))
}

/** Switches a task between Private and shown. Its calendar block follows it (the server masks a task's block with the task). */
export function setTaskPrivate(t: Task, on: boolean): void {
  const row = queryClient.getQueryData<Task[]>(['tasks'])?.find((r) => r.id === t.id) ?? t
  if (!!row.private === on) return
  writeRow('tasks', { ...row, private: on })
  toastUndo(on ? `Private · ${row.title}` : `No longer private · ${row.title}`, () => writeRow('tasks', row))
}
