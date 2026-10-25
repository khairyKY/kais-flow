import { blockIfTimed, enrichTypedInboxItem, enrichTypedTask } from '../capture/api'
import { cachedSlots, createEvent, deleteEvent, putInSlot } from '../calendar/api'
import { slotDay } from '../calendar/slots'
import { captureText, uncapture } from '../inbox/api'
import { createTask, toastAdded } from '../tasks/api'
import { addDays } from '../../components/pickerMath'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { writeRow } from '../../lib/outbox'
import { playSound } from '../../lib/sounds'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { formatDueChip } from './dueChip'
import { offerProject } from '../projects/autoProject'
import { autoFileOn } from '../../lib/settings'
import { hasStructure, parseCommand, quickAddTask, type ParsedCommand } from './parseCommand'
import { timeText } from '../calendar/eventTime'
import { dayWord } from '../tasks/taskSheetMath'

/** THE capture rule for a typed line (Kai 2026-10-12: "Enter = the one capture path") — the command
 * bar's Enter and the tray's quick capture (P7e A21) both land through here. Written at once from the
 * local parse, never waiting on the network: an event when one was asked for; a line with tokens as a
 * task (addTypedTask); a plain line in the Inbox, where the AI then reads it and may file it
 * (capture/api enrichTypedInboxItem). Every landing says where it went. */
// Kai 2026-10-25 ("I guess?"): with "File captures for me" off (0086, the default) a line WITH tokens
// waits in the Inbox too — its tokens the card's one-tap suggestion (holdTyped). `asTask`: the bar was
// opened from an "add a task" field (Today's add row), which still makes the task at once — as the
// Tasks page's quick add (addTypedTask) and the rail's quick create do.
export function captureTyped(parsed: ParsedCommand, typed: string, kind: 'task' | 'event' = 'task', asTask = false): void {
  playSound('capture')
  if (kind === 'event') addTypedEvent(parsed, typed)
  else if (hasStructure(parsed) && (asTask || autoFileOn())) addTypedTask(parsed, typed, parsed.projectMatch ?? parsed.domainMatch)
  else if (hasStructure(parsed)) holdTyped(parsed, typed)
  else {
    const item = captureText(typed)
    void enrichTypedInboxItem(item, typed)
    toastUndo('Added to Inbox', () => uncapture(item)) // P7e A17: it had no Undo
  }
}

/** A line with tokens, held in the Inbox: what they said is its read (confidence 1 — the person typed
 * it), so the card shows "Tomorrow 3:00 PM · Work" ready to file in one tap; the extras ride on the
 * payload for filing (inbox/api fileToTask). No AI read: the tokens already are one. */
function holdTyped(parsed: ParsedCommand, typed: string): void {
  const t = quickAddTask(parsed, typed)
  const item = captureText(typed, {
    ai_parse: { kind: 'task', cleaned_text: typed, title: t.title, due_at: t.dueAt, has_time: parsed.dueTimed, project_id: t.projectId, domain_id: t.domainId, duration_min: t.durationMin, priority: t.priority, confidence: 1, source: 'typed' },
    payload: {
      ...(t.priority != null ? { priority_override: t.priority } : null),
      ...(t.durationMin != null ? { duration_override: t.durationMin } : null),
      ...(t.labels.length ? { labels_override: t.labels } : null),
      ...(t.recurrenceRule ? { repeat_override: t.recurrenceRule } : null),
      ...(t.notes ? { notes_override: t.notes } : null),
    },
  })
  const when = parsed.dueAt ? formatDueChip(parsed.dueAt, new Date(), parsed.dueTimed) : null
  toastUndo(['Added to Inbox', when, parsed.projectMatch ?? parsed.domainMatch].filter(Boolean).join(' · '), () => uncapture(item))
}

/** The one capture rule for a typed task (Kai 2026-10-12: "Enter = the one capture path"; the command
 * bar's Enter and the Tasks page's quick add): the instant local parse lands it now — on the calendar
 * too when a time was typed — a toast names where it went, and the AI's read fills what the tokens
 * left empty, after (capture/api enrichTypedTask). `place` names its project / area / domain for the
 * toast; `fallbackDue` dates a line that named no day (Tasks' Today tab). A `>slot` puts it in that
 * Time block's next occurrence (on or after a typed day) instead of a block of its own. */
export function addTypedTask(parsed: ParsedCommand, typed: string, place: string | null, fallbackDue: string | null = null): Task {
  const input = quickAddTask(parsed, typed)
  const task = createTask({ ...input, dueAt: input.dueAt ?? fallbackDue })
  const slot = land(task, parsed)
  toastAdded(task, [slot?.title, place].filter(Boolean).join(' · ') || null)
  // Queue item 17: no place typed → its likely project from history; the AI's read may offer one after.
  const offered = offerProject({ kind: 'task', row: task })
  void enrichTypedTask(task, typed, offered)
  return task
}

/** The `>slot` a parse names: that Time block's next occurrence on or after the typed day. */
const slotFor = (parsed: ParsedCommand): CalendarEvent | undefined => {
  const day = parsed.dueAt && cairoDateKey(new Date(parsed.dueAt))
  return parsed.slotMatch ? cachedSlots().find((s) => s.title === parsed.slotMatch && (!day || slotDay(s) >= day)) : undefined
}

/** A typed line's task lands: into its `>slot`, else on the calendar when a time was typed. */
function land(task: Task, parsed: ParsedCommand): CalendarEvent | undefined {
  const slot = slotFor(parsed)
  if (slot) putInSlot(task, slot)
  else blockIfTimed(task, parsed.dueTimed)
  return slot
}

/** A subtask's line through the one parse (Subtasks A + C, Kai 2026-10-16), with the Time blocks ahead
 * for `>slot`. Its place is always the parent's, so no #tag is read as one (it still leaves the title). */
export const parseSubtask = (typed: string, now: Date = new Date()): ParsedCommand =>
  parseCommand(typed, [], [], { zone: 'cairo', now, slots: [...new Set(cachedSlots(now).map((s) => s.title))] })

/** What a subtask line will do, under it while it's typed: "Today 18:00 · on your calendar", "Tomorrow",
 * "In Code block" — null for a plain line. */
export function subtaskHint(typed: string, now: Date = new Date()): string | null {
  const parsed = parseSubtask(typed, now)
  const slot = slotFor(parsed)
  if (slot) return `In ${slot.title}`
  if (!parsed.dueAt) return null
  const at = new Date(parsed.dueAt)
  const day = dayWord(cairoDateKey(at), now)
  return parsed.dueTimed ? `${day} ${timeText(at)} · on your calendar` : day
}

/** A subtask typed on its parent's add line (the row's +, the sheet, the popover, the editor): the one
 * capture parse — "at 6pm" / "tomorrow 9am" give it its own time, on the calendar, and leave the title —
 * in the parent's project / area / domain. No toast (it lands in sight, under its parent) and no AI read. */
export function addTypedSubtask(parent: Task, typed: string, now: Date = new Date()): Task | null {
  const text = typed.trim()
  if (!text) return null
  const parsed = parseSubtask(text, now)
  const task = createTask({ ...quickAddTask(parsed, text), parentTaskId: parent.id, projectId: parent.project_id, areaId: parent.area_id ?? null, domainId: parent.domain_id })
  land(task, parsed)
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
  offerProject({ kind: 'event', row: event }) // queue item 17 (nothing when a #project was typed)
  return event
}
