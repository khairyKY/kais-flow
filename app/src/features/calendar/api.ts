import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { fetchAll } from '../../lib/fetchAll'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { movedText, rangeText, spanIso, type DragMode, type Span } from './phoneGridMath'
import { dueFollows, placeMoves, replanMoves, type BlockMoves } from './replan'

export function useCalendarEvents() {
  return useQuery({
    queryKey: ['calendar_events'],
    queryFn: async () => {
      return fetchAll<CalendarEvent>((from, to) =>
        supabase.from('calendar_events').select('*').order('starts_at').order('id').range(from, to),
      )
    },
    select: (events) => events.filter((e) => !e.deleted_at),
  })
}

function nowIso() {
  return new Date().toISOString()
}

function cachedTask(taskId: string): Task | undefined {
  return queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === taskId)
}

/** Every block write lands here. Kai 2026-10-07: a block moved or placed on today or later carries a
 * missed due date with it (replan.dueFollows), so a replanned task stops reading "Overdue". */
function touchTaskSchedule(taskId: string, start: string | null, end: string | null): void {
  const task = cachedTask(taskId)
  if (!task) return
  const follows = !!start && dueFollows(task.due_at, start, new Date())
  writeRow('tasks', { ...task, scheduled_start: start, scheduled_end: end, ...(follows ? { due_at: start } : null) })
  if (follows) logActivity('task.rescheduled', 'task', taskId, { due_at: start })
}

/** The task's blocks on the calendar now. */
function liveBlocks(taskId: string): CalendarEvent[] {
  return (queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []).filter((e) => e.task_id === taskId && !e.deleted_at)
}

/** Click-drag an empty grid slot -> a plain native event, no linked task. */
export function createEvent(title: string, startsAt: string, endsAt: string, type?: CalendarEvent['type'], color?: string | null, allDay = false): CalendarEvent {
  const event: CalendarEvent = {
    id: crypto.randomUUID(),
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    task_id: null,
    source: 'native',
    gcal_id: null,
    gcal_etag: null,
    busy: true,
    type: type ?? 'event',
    color: color ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('calendar_events', event)
  logActivity('calendar_event.created', 'calendar_event', event.id, { title, type: event.type })
  return event
}

/** Carries out a BlockMoves (replan.ts) for one task; returns the block it ends on and the Undo
 * (every step taken back, last first, then the task row's due date / schedule as they were). */
function applyMoves(task: Task, moves: BlockMoves, allDay = false): { event: CalendarEvent | null; undo: () => void } {
  const before = cachedTask(task.id) ?? task
  const steps: (() => void)[] = []
  for (const e of moves.clear) {
    deleteEvent(e)
    steps.push(() => restoreEvent(e))
  }
  let event = moves.keep
  if (moves.place) {
    const { block, starts_at, ends_at } = moves.place
    if (block) {
      event = { ...block, starts_at, ends_at, all_day: allDay }
      moveOrResizeEvent(block, starts_at, ends_at, allDay)
      steps.push(() => moveOrResizeEvent(block, block.starts_at, block.ends_at, block.all_day))
    } else {
      const created: CalendarEvent = {
        id: crypto.randomUUID(),
        title: task.title,
        starts_at,
        ends_at,
        all_day: allDay,
        task_id: task.id,
        source: 'native',
        gcal_id: null,
        gcal_etag: null,
        busy: true,
        type: 'task',
        color: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      }
      writeRow('calendar_events', created)
      touchTaskSchedule(task.id, starts_at, ends_at)
      event = created
      steps.push(() => deleteEvent(created))
    }
    logActivity('task.scheduled', 'task', task.id, { calendar_event_id: event.id })
  } else if (moves.keep) {
    touchTaskSchedule(task.id, moves.keep.starts_at, moves.keep.ends_at) // a cleared sibling un-set it
  }
  return {
    event,
    undo: () => {
      steps.reverse().forEach((step) => step())
      const now = cachedTask(task.id)
      if (now) writeRow('tasks', { ...now, due_at: before.due_at, scheduled_start: before.scheduled_start, scheduled_end: before.scheduled_end })
    },
  }
}

/** The one way a task goes on the calendar (a rail drop, Plan ▸, the phone Schedule sheet, the
 * morning plan, a quick-created task): its block moves there if it has one — a missed block
 * included — and never a second one. A missed due date follows (touchTaskSchedule). */
export function placeTask(task: Task, startsAt: string, endsAt: string, allDay = false): { event: CalendarEvent; undo: () => void } {
  const { event, undo } = applyMoves(task, placeMoves(liveBlocks(task.id), startsAt, endsAt), allDay)
  return { event: event!, undo }
}

/** Drag a task from the rail onto the grid -> its block, at that time. */
export function scheduleTask(task: Task, startsAt: string, endsAt: string, allDay = false): CalendarEvent {
  return placeTask(task, startsAt, endsAt, allDay).event
}

/** placeTask with "Scheduled · <title>" and an Undo that puts everything back as it was. */
export function scheduleTaskWithUndo(task: Task, startsAt: string, endsAt: string, allDay = false): CalendarEvent {
  const { event, undo } = placeTask(task, startsAt, endsAt, allDay)
  toastUndo(`Scheduled · ${task.title}`, undo)
  return event
}

/** A task's date changed (tasks/api rescheduleDue): its blocks follow THE RULE in replan.ts. */
export function replanTaskBlocks(task: Task, dueAt: string | null, timed: boolean): () => void {
  return applyMoves(task, replanMoves(liveBlocks(task.id), dueAt, timed, task.duration_min)).undo
}

/** Save any field edits (title, dates, toggles) on an event. */
export function updateEvent(event: CalendarEvent, patch: Partial<CalendarEvent>): void {
  writeRow('calendar_events', { ...event, ...patch })
  if (event.task_id) {
    const newStart = patch.starts_at ?? event.starts_at
    const newEnd = patch.ends_at ?? event.ends_at
    if (newStart !== event.starts_at || newEnd !== event.ends_at) {
      touchTaskSchedule(event.task_id, newStart, newEnd)
    }
  }
}

/** allDay carries the all-day band ↔ time grid drag conversion (CALENDAR.md §6); omitted = unchanged. */
export function moveOrResizeEvent(event: CalendarEvent, startsAt: string, endsAt: string, allDay?: boolean): void {
  writeRow('calendar_events', { ...event, starts_at: startsAt, ends_at: endsAt, all_day: allDay ?? event.all_day })
  if (event.task_id) touchTaskSchedule(event.task_id, startsAt, endsAt)
}

/** Undo half of deleteEvent: the block comes back and re-links its task's schedule. */
export function restoreEvent(event: CalendarEvent): void {
  writeRow('calendar_events', { ...event, deleted_at: null })
  if (event.task_id) touchTaskSchedule(event.task_id, event.starts_at, event.ends_at)
  logActivity('calendar_event.restored', 'calendar_event', event.id, {})
}

/** Resizing a task-linked block is the calendar's estimate editor: the new length writes back to duration_min. */
export function resizeEvent(event: CalendarEvent, startsAt: string, endsAt: string): void {
  writeRow('calendar_events', { ...event, starts_at: startsAt, ends_at: endsAt })
  if (!event.task_id) return
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const task = tasks.find((t) => t.id === event.task_id)
  if (!task) return
  const durationMin = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
  const patch: Partial<Task> = { scheduled_start: startsAt, scheduled_end: endsAt }
  if (durationMin !== task.duration_min) patch.duration_min = durationMin
  writeRow('tasks', { ...task, ...patch })
}

/** A block moved or resized on the phone (a drop, a handle, a sheet's time): one write, one toast
 * with Undo (7m) — "Moved to 16:15" / "Resized to 15:00–16:15". */
export function moveEventWithUndo(event: CalendarEvent, from: Span, to: Span, mode: DragMode): void {
  const prior = { ...event }
  const { starts_at, ends_at } = spanIso(to)
  if (mode === 'move') {
    moveOrResizeEvent(event, starts_at, ends_at)
    toastUndo(movedText(from, to, cairoDateKey(new Date())), () => moveOrResizeEvent(prior, prior.starts_at, prior.ends_at))
  } else {
    resizeEvent(event, starts_at, ends_at)
    toastUndo(`Resized to ${rangeText(to.start, to.end)}`, () => resizeEvent(prior, prior.starts_at, prior.ends_at))
  }
}

/** Deleting a block un-schedules its task but the task itself survives. */
export function deleteEvent(event: CalendarEvent): void {
  writeRow('calendar_events', { ...event, deleted_at: new Date().toISOString() })
  if (event.task_id) touchTaskSchedule(event.task_id, null, null)
  logActivity('calendar_event.deleted', 'calendar_event', event.id, {})
}

/** Takes a block off the calendar with Undo — "Unscheduled · <title>" / "Deleted · <title>". The task
 * stays either way (Punch 6: capture the prior row, undo through the same api). */
export function deleteEventWithUndo(event: CalendarEvent, verb: 'Unscheduled' | 'Deleted'): void {
  const prior = { ...event }
  deleteEvent(event)
  toastUndo(`${verb} · ${event.title}`, () => restoreEvent(prior))
}

/** Deleting a task deletes its block too (called from the tasks feature after user confirms). */
export function deleteEventsForTask(taskId: string): void {
  const events = queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []
  for (const event of events.filter((e) => e.task_id === taskId)) {
    writeRow('calendar_events', { ...event, deleted_at: new Date().toISOString() })
  }
}

export function restoreEventsForTask(taskId: string): void {
  const events = queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []
  for (const event of events.filter((e) => e.task_id === taskId && e.deleted_at)) {
    writeRow('calendar_events', { ...event, deleted_at: null })
  }
}
