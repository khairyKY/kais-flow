import { blockIfTimed, enrichTypedTask } from '../capture/api'
import { createEvent, deleteEvent } from '../calendar/api'
import { createTask, toastAdded } from '../tasks/api'
import { addDays } from '../../components/pickerMath'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { writeRow } from '../../lib/outbox'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { formatDueChip } from './dueChip'
import { quickAddTask, type ParsedCommand } from './parseCommand'

/** The one capture rule for a typed task (Kai 2026-10-12: "Enter = the one capture path"; the command
 * bar's Enter and the Tasks page's quick add): the instant local parse lands it now — on the calendar
 * too when a time was typed — a toast names where it went, and the AI's read fills what the tokens
 * left empty, after (capture/api enrichTypedTask). `place` names its project / area / domain for the
 * toast; `fallbackDue` dates a line that named no day (Tasks' Today tab). */
export function addTypedTask(parsed: ParsedCommand, typed: string, place: string | null, fallbackDue: string | null = null): Task {
  const input = quickAddTask(parsed, typed)
  const task = createTask({ ...input, dueAt: input.dueAt ?? fallbackDue })
  blockIfTimed(task, parsed.dueTimed)
  toastAdded(task, place)
  void enrichTypedTask(task, typed)
  return task
}

/** The same line as a calendar event (P7e A11, Akiflow's ⌘2 "New Event"): at the typed time for the
 * typed length (else 30 minutes, a capture block's length), all day on a date with no time, today
 * when it names no day. "every week" repeats it, a #project files it; priority, labels and notes are
 * a task's and are left out. One toast with Undo (to Trash). */
export function addTypedEvent(parsed: ParsedCommand, typed: string, now: Date = new Date()): CalendarEvent {
  const at = parsed.dueAt ?? now.toISOString()
  const day = cairoDateKey(new Date(at))
  const timed = parsed.dueTimed
  const startsAt = timed ? at : `${day}T00:00:00.000Z` // all-day rows sit on UTC midnight (QuickCreate's)
  const endsAt = timed ? new Date(Date.parse(at) + (parsed.durationMin || 30) * 60_000).toISOString() : `${addDays(day, 1)}T00:00:00.000Z`
  let event = createEvent(parsed.title || typed, startsAt, endsAt, 'event', null, !timed)
  if (parsed.recurrence || parsed.projectId) {
    event = {
      ...event,
      ...(parsed.recurrence ? { recurrence_rule: parsed.recurrence, recurrence_exdates: [] } : null),
      ...(parsed.projectId ? { project_id: parsed.projectId } : null),
    }
    writeRow('calendar_events', event)
  }
  toastUndo(`Added to Calendar · ${formatDueChip(at, now, timed)}`, () => deleteEvent(event))
  return event
}
