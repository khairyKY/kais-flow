import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { fetchAll } from '../../lib/fetchAll'
import type { CalendarEvent, Task } from '../../lib/types'

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

function touchTaskSchedule(taskId: string, start: string | null, end: string | null): void {
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return
  writeRow('tasks', { ...task, scheduled_start: start, scheduled_end: end })
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

/** Drag a task from the unscheduled sidebar onto the grid -> a block linked to that task. */
export function scheduleTask(task: Task, startsAt: string, endsAt: string, allDay = false): CalendarEvent {
  const event: CalendarEvent = {
    id: crypto.randomUUID(),
    title: task.title,
    starts_at: startsAt,
    ends_at: endsAt,
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
  writeRow('calendar_events', event)
  touchTaskSchedule(task.id, startsAt, endsAt)
  logActivity('task.scheduled', 'task', task.id, { calendar_event_id: event.id })
  return event
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

/** Deleting a block un-schedules its task but the task itself survives. */
export function deleteEvent(event: CalendarEvent): void {
  writeRow('calendar_events', { ...event, deleted_at: new Date().toISOString() })
  if (event.task_id) touchTaskSchedule(event.task_id, null, null)
  logActivity('calendar_event.deleted', 'calendar_event', event.id, {})
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
