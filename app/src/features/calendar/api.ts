import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { fetchAll } from '../../lib/fetchAll'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { useAppZone } from '../../lib/appZone'
import { dayHint, fromMin } from '../../components/pickerMath'
import { eventSpan, movedText, rangeText, spanIso, type DragMode, type Span } from './phoneGridMath'
import { dueFollows, placeMoves, replanMoves, type BlockMoves } from './replan'
import { detachedCopy, eventWindow, expandEvents, rerule, retimeSeries, rowOf, withExdate, withoutExdate } from './series'

const fetchEvents = () =>
  fetchAll<CalendarEvent>((from, to) => supabase.from('calendar_events').select('*').order('starts_at').order('id').range(from, to))
const live = (events: CalendarEvent[]) => events.filter((e) => !e.deleted_at)

/** The stored rows — a repeating event is ONE row here. For look-ups by a stored id (Activity, a
 * search hit) and anything that must see the series itself. */
export function useCalendarRows() {
  return useQuery({ queryKey: ['calendar_events'], queryFn: fetchEvents, select: live })
}

/** What the calendar shows: one-off rows as stored, each repeating series as its occurrences
 * (features/calendar/series) — over `range` (a grid's visible days), else eventWindow(), the year
 * around today every other reader (Today, Plan, the tray, the widgets, Weekly Review) looks at.
 * An occurrence carries `seriesId`; the writes below resolve it to its series row. */
export function useCalendarEvents(range?: { start: Date; end: Date }) {
  const zone = useAppZone()
  const w = range ? { from: range.start, to: range.end } : eventWindow()
  const from = w.from.getTime()
  const to = w.to.getTime()
  const select = useCallback((events: CalendarEvent[]) => expandEvents(live(events), new Date(from), new Date(to), zone), [from, to, zone])
  return useQuery({ queryKey: ['calendar_events'], queryFn: fetchEvents, select })
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
  return cachedRows().filter((e) => e.task_id === taskId && !e.deleted_at)
}

function cachedRows(): CalendarEvent[] {
  return queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []
}

/** An occurrence's stored series row, as cached now. Undefined for a one-off — and for an occurrence
 * whose row is gone, which every write below then leaves alone (its id is no row's). */
function seriesOf(e: CalendarEvent): CalendarEvent | undefined {
  return e.seriesId ? rowOf(e, cachedRows()) : undefined
}

/** One occurrence moved on its own (a drag, a resize, the Date row): the series skips it and a
 * one-off copy lands at the new time. The Undo puts both back. */
function detach(occ: CalendarEvent, startsAt: string, endsAt: string, allDay: boolean): () => void {
  const row = seriesOf(occ)
  if (!row) return () => {}
  const copy = detachedCopy(row, startsAt, endsAt, allDay, crypto.randomUUID(), nowIso())
  writeRow('calendar_events', withExdate(row, occ.starts_at))
  writeRow('calendar_events', copy)
  logActivity('calendar_event.created', 'calendar_event', copy.id, { title: copy.title, type: copy.type, series_id: row.id })
  return () => {
    writeRow('calendar_events', withoutExdate(seriesOf(occ) ?? row, occ.starts_at))
    writeRow('calendar_events', copy, 'delete')
  }
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
      if (now) writeRow('tasks', { ...now, due_at: before.due_at, scheduled_start: before.scheduled_start, scheduled_end: before.scheduled_end, top3: before.top3, top3_rank: before.top3_rank })
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

/** Save any field edits (title, dates, toggles) on an event. On an occurrence they go to the whole
 * series — minus the times, which move a series only through retimeEventWithUndo. */
export function updateEvent(event: CalendarEvent, patch: Partial<CalendarEvent>): void {
  if (event.seriesId) {
    const row = seriesOf(event)
    const { starts_at: _s, ends_at: _e, ...rest } = patch
    if (row) writeRow('calendar_events', { ...row, ...rest })
    return
  }
  writeRow('calendar_events', { ...event, ...patch })
  if (event.task_id) {
    const newStart = patch.starts_at ?? event.starts_at
    const newEnd = patch.ends_at ?? event.ends_at
    if (newStart !== event.starts_at || newEnd !== event.ends_at) {
      touchTaskSchedule(event.task_id, newStart, newEnd)
    }
  }
}

/** allDay carries the all-day band ↔ time grid drag conversion (CALENDAR.md §6); omitted = unchanged.
 * An occurrence moves on its own (detach). Returns the Undo. */
export function moveOrResizeEvent(event: CalendarEvent, startsAt: string, endsAt: string, allDay?: boolean): () => void {
  if (event.seriesId) return detach(event, startsAt, endsAt, allDay ?? event.all_day)
  const prior = { ...event }
  writeRow('calendar_events', { ...event, starts_at: startsAt, ends_at: endsAt, all_day: allDay ?? event.all_day })
  if (event.task_id) touchTaskSchedule(event.task_id, startsAt, endsAt)
  return () => void moveOrResizeEvent(prior, prior.starts_at, prior.ends_at, prior.all_day)
}

/** Undo half of deleteEvent: the block comes back and re-links its task's schedule. An occurrence:
 * its series stops skipping it. */
export function restoreEvent(event: CalendarEvent): void {
  if (event.seriesId) {
    const row = seriesOf(event)
    if (!row) return
    writeRow('calendar_events', withoutExdate(row, event.starts_at))
    logActivity('calendar_event.restored', 'calendar_event', row.id, { occurrence: event.starts_at })
    return
  }
  writeRow('calendar_events', { ...event, deleted_at: null })
  if (event.task_id) touchTaskSchedule(event.task_id, event.starts_at, event.ends_at)
  logActivity('calendar_event.restored', 'calendar_event', event.id, {})
}

/** Resizing a task-linked block is the calendar's estimate editor: the new length writes back to
 * duration_min. An occurrence is resized on its own (detach). Returns the Undo. */
export function resizeEvent(event: CalendarEvent, startsAt: string, endsAt: string): () => void {
  if (event.seriesId) return detach(event, startsAt, endsAt, event.all_day)
  const prior = { ...event }
  const undo = () => void resizeEvent(prior, prior.starts_at, prior.ends_at)
  writeRow('calendar_events', { ...event, starts_at: startsAt, ends_at: endsAt })
  if (!event.task_id) return undo
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const task = tasks.find((t) => t.id === event.task_id)
  if (!task) return undo
  const durationMin = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
  const patch: Partial<Task> = { scheduled_start: startsAt, scheduled_end: endsAt }
  if (durationMin !== task.duration_min) patch.duration_min = durationMin
  writeRow('tasks', { ...task, ...patch })
  return undo
}

/** A block moved or resized on the phone (a drop, a handle, a sheet's time): one write, one toast
 * with Undo (7m) — "Moved to 16:15" / "Resized to 15:00–16:15". */
export function moveEventWithUndo(event: CalendarEvent, from: Span, to: Span, mode: DragMode): void {
  const { starts_at, ends_at } = spanIso(to)
  if (mode === 'move') toastUndo(movedText(from, to, cairoDateKey(new Date())), moveOrResizeEvent(event, starts_at, ends_at))
  else toastUndo(`Resized to ${rangeText(to.start, to.end)}`, resizeEvent(event, starts_at, ends_at))
}

/** The Date row: the block — one occurrence, for a repeat — to `day` at the same time, with Undo. */
export function moveToDayWithUndo(event: CalendarEvent, day: string): void {
  if (!event.all_day) {
    const s = eventSpan(event)
    if (s.day !== day) moveEventWithUndo(event, s, { ...s, day }, 'move')
    return
  }
  const starts = `${day}T00:00:00.000Z`
  if (starts === event.starts_at) return
  const ends = new Date(Date.parse(starts) + Date.parse(event.ends_at) - Date.parse(event.starts_at)).toISOString()
  toastUndo(`Moved to ${dayHint(day, cairoDateKey(new Date()))}`, moveOrResizeEvent(event, starts, ends, true))
}

/** The block's time of day and length from its own controls (the popover's Duration, the phone
 * sheet's Time): a one-off moves like a drag; a repeating event moves as a whole series. */
export function retimeEventWithUndo(event: CalendarEvent, from: Span, to: Span): void {
  const row = seriesOf(event)
  if (!row) return moveEventWithUndo(event, from, to, to.start === from.start ? 'bottom' : 'move')
  writeRow('calendar_events', retimeSeries(row, fromMin(to.start), to.end - to.start))
  const today = cairoDateKey(new Date())
  toastUndo(to.start === from.start ? `Resized to ${rangeText(to.start, to.end)}` : movedText(from, { ...to, day: from.day }, today), () => writeRow('calendar_events', row))
}

/** Repeat from a block (`rule` null = does not repeat). Task blocks never repeat — their task does. */
export function setEventRepeat(event: CalendarEvent, rule: string | null): void {
  const row = event.seriesId ? seriesOf(event) : event
  if (!row || row.task_id) return
  writeRow('calendar_events', rerule(row, event, rule))
}

/** "Link a task…": a plain one-off block takes the task (its block now — the task is scheduled
 * here). One Undo puts the block and the task back. */
export function linkTaskWithUndo(event: CalendarEvent, task: Task): void {
  if (event.seriesId || event.recurrence_rule) return
  const prior = { ...event }
  const priorTask = cachedTask(task.id) ?? task
  writeRow('calendar_events', { ...event, task_id: task.id, type: 'task' })
  touchTaskSchedule(task.id, event.starts_at, event.ends_at)
  logActivity('task.scheduled', 'task', task.id, { calendar_event_id: event.id })
  toastUndo(`Linked · ${task.title}`, () => {
    writeRow('calendar_events', prior)
    writeRow('tasks', priorTask)
  })
}

/** Deleting a block un-schedules its task but the task itself survives. An occurrence: its series
 * skips it ("This event"). */
export function deleteEvent(event: CalendarEvent): void {
  if (event.seriesId) {
    const row = seriesOf(event)
    if (!row) return
    writeRow('calendar_events', withExdate(row, event.starts_at))
    logActivity('calendar_event.deleted', 'calendar_event', row.id, { occurrence: event.starts_at })
    return
  }
  writeRow('calendar_events', { ...event, deleted_at: new Date().toISOString() })
  if (event.task_id) touchTaskSchedule(event.task_id, null, null)
  logActivity('calendar_event.deleted', 'calendar_event', event.id, {})
}

/** Takes a block off the calendar with Undo — "Unscheduled · <title>" / "Deleted · <title>". The task
 * stays either way (Punch 6: capture the prior row, undo through the same api). */
export function deleteEventWithUndo(event: CalendarEvent, verb: 'Unscheduled' | 'Deleted' | 'Discarded'): void {
  const prior = { ...event }
  deleteEvent(event)
  toastUndo(`${verb} · ${event.title}`, () => restoreEvent(prior))
}

/** "All events": the series row and every occurrence dragged out of it go to Trash, one Undo. */
export function deleteSeriesWithUndo(event: CalendarEvent): void {
  const row = seriesOf(event) ?? event
  const all = [row, ...cachedRows().filter((r) => r.series_id === row.id && !r.deleted_at)]
  for (const r of all) deleteEvent(r)
  toastUndo(`Deleted all · ${row.title}`, () => all.forEach(restoreEvent))
}

/** Deleting a task deletes its block too (called from the tasks feature after user confirms). */
export function deleteEventsForTask(taskId: string): void {
  const events = cachedRows()
  for (const event of events.filter((e) => e.task_id === taskId)) {
    writeRow('calendar_events', { ...event, deleted_at: new Date().toISOString() })
  }
}

export function restoreEventsForTask(taskId: string): void {
  const events = cachedRows()
  for (const event of events.filter((e) => e.task_id === taskId && e.deleted_at)) {
    writeRow('calendar_events', { ...event, deleted_at: null })
  }
}
