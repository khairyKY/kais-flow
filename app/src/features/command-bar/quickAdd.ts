import { blockIfTimed, enrichTypedInboxItem, enrichTypedTask } from '../capture/api'
import { createEvent, deleteEvent } from '../calendar/api'
import { captureText } from '../inbox/api'
import { createTask, toastAdded } from '../tasks/api'
import { addDays } from '../../components/pickerMath'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { writeRow } from '../../lib/outbox'
import { playSound } from '../../lib/sounds'
import { useToastStore } from '../../lib/toastStore'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { formatDueChip } from './dueChip'
import { hasStructure, quickAddTask, type ParsedCommand } from './parseCommand'

/** THE capture rule for a typed line (Kai 2026-10-12: "Enter = the one capture path") — the command
 * bar's Enter and the tray's quick capture (P7e A21) both land through here. Written at once from the
 * local parse, never waiting on the network: an event when one was asked for; a line with tokens as a
 * task (addTypedTask); a plain line in the Inbox, where the AI then reads it and may file it
 * (capture/api enrichTypedInboxItem). Every landing says where it went. */
export function captureTyped(parsed: ParsedCommand, typed: string, kind: 'task' | 'event' = 'task'): void {
  playSound('capture')
  if (kind === 'event') addTypedEvent(parsed, typed)
  else if (hasStructure(parsed)) addTypedTask(parsed, typed, parsed.projectMatch ?? parsed.domainMatch)
  else {
    void enrichTypedInboxItem(captureText(typed), typed)
    useToastStore.getState().push({ message: 'Added to Inbox' })
  }
}

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
  // An event has no link field: a link stays in its title (a meeting's URL).
  let event = createEvent([parsed.title, parsed.url].filter(Boolean).join(' ') || typed, startsAt, endsAt, 'event', null, !timed)
  if (parsed.recurrence || parsed.projectId) {
    event = {
      ...event,
      ...(parsed.recurrence ? { recurrence_rule: parsed.recurrence, recurrence_exdates: [] } : null),
      ...(parsed.projectId ? { project_id: parsed.projectId } : null),
    }
    writeRow('calendar_events', event)
  }
  toastUndo(`Added to Calendar · ${formatDueChip(at, now, timed)}`, () => void deleteEvent(event))
  return event
}
