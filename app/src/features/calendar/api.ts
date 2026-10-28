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
import { dayHint, dayShort, fromMin } from '../../components/pickerMath'
import { eventSpan, movedText, rangeText, spanIso, type DragMode, type Span } from './phoneGridMath'
import { dueFollows, placeMoves, replanMoves, type BlockMoves } from './replan'
import { alignToRule, detachedCopy, eventWindow, expandEvents, rerule, retimeSeries, rowOf, splitSeries, withExdate, withoutExdate } from './series'
import { occurrenceId } from '../../../../supabase/functions/_shared/series.ts'
import { isSynced, remindLabel, repeatLabel } from './blockMenuSpec'
import { timeText } from './eventTime'
import { intoSlot, occurrenceOn, OUT_OF_SLOT, slotTasks, upcomingSlots } from './slots'
import { spanMinutes, taskOnBlock, withLength } from '../../../../supabase/functions/_shared/blockLength.ts'
import { planScope, type Scope, type SeriesChange } from './scope'
import { noteLocalWrite } from './blockMotion'

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

/** Every calendar_events write in the app. A Google event (source 'gcal') is read-only: google-sync
 * owns it, so nothing here can move, edit or trash one (the grid and the menus don't offer it either). */
function writeEvent(row: CalendarEvent, op?: 'upsert' | 'delete'): void {
  if (isSynced(row)) return
  noteLocalWrite() // CAL10: what lands next is the person's own
  writeRow('calendar_events', row, op)
}

function nowIso() {
  return new Date().toISOString()
}

function cachedTask(taskId: string): Task | undefined {
  return queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === taskId)
}

/** Every block write lands here. Kai 2026-10-07: a block moved or placed on today or later carries a
 * missed due date with it (replan.dueFollows), so a replanned task stops reading "Overdue". bugs-1023
 * (Kai 2026-10-23): the task and its block are one thing — its estimate is the block's length and a due
 * time that was the block's moves with it (_shared/blockLength taskOnBlock), however the block changed. */
function touchTaskSchedule(taskId: string, start: string | null, end: string | null, allDay = false): void {
  const task = cachedTask(taskId)
  if (!task) return
  const follows = !!start && dueFollows(task.due_at, start, new Date())
  const block = start && end ? taskOnBlock(task, start, end, allDay) : { scheduled_start: start, scheduled_end: end }
  const due = follows ? start : (block.due_at ?? task.due_at)
  // A block of its own takes a task out of any Time slot (0073): it's here now, not there.
  writeRow('tasks', { ...task, ...block, due_at: due, ...(task.slot_id ? { slot_id: null, slot_date: null } : null) })
  if (due !== task.due_at) logActivity('task.rescheduled', 'task', taskId, { due_at: due })
}

/** The task's estimate changed (the Duration chip in the sheet, the popover, the editor): its block —
 * the latest timed one — keeps its start and takes the new length. Returns the Undo (none: a no-op). */
export function lengthenTaskBlock(taskId: string, minutes: number): () => void {
  const block = liveBlocks(taskId)
    .filter((e) => !e.all_day)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))[0]
  if (!block || spanMinutes(block.starts_at, block.ends_at) === minutes) return () => {}
  return moveOrResizeEvent(block, block.starts_at, withLength(block.starts_at, minutes).ends_at)
}

// ── Time Slots (migration 0073, features/calendar/slots.ts): a Time block holds tasks. ──

const cachedTasks = (): Task[] => queryClient.getQueryData<Task[]>(['tasks']) ?? []

/** Writes `patch` onto these tasks; the Undo gives each its slot and times back. */
function restamp(tasks: readonly Task[], patch: (t: Task) => Partial<Task>): () => void {
  const prior = tasks.map((t) => ({ ...t }))
  for (const t of tasks) writeRow('tasks', { ...t, ...patch(t) })
  return () => {
    for (const p of prior) {
      const now = cachedTask(p.id) ?? p
      writeRow('tasks', { ...now, slot_id: p.slot_id ?? null, slot_date: p.slot_date ?? null, scheduled_start: p.scheduled_start, scheduled_end: p.scheduled_end })
    }
  }
}

/** A slot occurrence moved or resized to `next` (for one dragged out of a series, its detached copy):
 * the tasks it held go with it — out of it in the all-day band, where no drop lands in a slot
 * (slots.slotAt) and its rows aren't drawn. Returns their Undo. */
function followSlot(prev: CalendarEvent, next: CalendarEvent): () => void {
  if (prev.type !== 'time_block') return () => {}
  return restamp(slotTasks(prev, cachedTasks()), () => (next.all_day ? OUT_OF_SLOT : intoSlot(next)))
}

/** A series edit (a repeat set or changed, a split, a re-time) re-makes which occurrences there are:
 * each task row `rowId` held goes to its day's occurrence among `rows` (the edited row, a split's
 * head and tail, an aligned one-off) at its times — with none left that day, out of the slot. So no
 * task is held by a day that's gone. Their Undo. */
function reseat(rowId: string, rows: readonly CalendarEvent[]): () => void {
  return restamp(
    cachedTasks().filter((t) => t.slot_id === rowId && !!t.slot_date),
    (t) => {
      const occ = occurrenceOn(rows, t.slot_date!)
      return occ ? intoSlot(occ) : OUT_OF_SLOT
    },
  )
}

/** Every task a stored slot row holds, any day, out of it. Their Undo. */
const releaseRow = (rowId: string): (() => void) => restamp(cachedTasks().filter((t) => t.slot_id === rowId), () => OUT_OF_SLOT)

/** A slot occurrence going away lets go of its tasks: unscheduled, back in the rail. Their Undo. */
function releaseSlot(slot: CalendarEvent): () => void {
  if (slot.type !== 'time_block') return () => {}
  return restamp(slotTasks(slot, cachedTasks()), () => OUT_OF_SLOT)
}

/** A task dropped on a Time block goes IN it (Akiflow's slots): the slot's day and times, and no
 * block of its own — one it had (a missed one) comes off. A missed due date follows, as for a
 * block. One toast, one Undo. */
export function putInSlotWithUndo(task: Task, slot: CalendarEvent): void {
  toastUndo(`In ${slot.title} · ${task.title}`, putInSlot(task, slot))
}

/** putInSlotWithUndo's write, no toast (the command bar's `>` toasts "Added to …" itself). Its Undo. */
export function putInSlot(task: Task, slot: CalendarEvent): () => void {
  const before = cachedTask(task.id) ?? task
  const blocks = liveBlocks(task.id)
  for (const b of blocks) deleteEvent(b)
  const fields = intoSlot(slot)
  const follows = dueFollows(before.due_at, slot.starts_at, new Date())
  writeRow('tasks', { ...(cachedTask(task.id) ?? before), ...fields, ...(follows ? { due_at: slot.starts_at } : null) })
  logActivity('task.scheduled', 'task', task.id, { slot_id: fields.slot_id, slot_date: fields.slot_date })
  return () => {
    blocks.forEach(restoreEvent)
    const now = cachedTask(task.id) ?? before
    writeRow('tasks', { ...now, slot_id: before.slot_id ?? null, slot_date: before.slot_date ?? null, due_at: before.due_at, scheduled_start: before.scheduled_start, scheduled_end: before.scheduled_end })
  }
}

/** The Time blocks of today and the next 7 days, from the cache (slots.upcomingSlots). */
export const cachedSlots = (now: Date = new Date()): CalendarEvent[] => upcomingSlots(cachedRows(), now)

/** ⋯ → Out of the slot: back to the rail, unscheduled, with Undo. */
export function outOfSlotWithUndo(task: Task): void {
  const t = cachedTask(task.id) ?? task
  toastUndo(`Out of the slot · ${t.title}`, restamp([t], () => OUT_OF_SLOT))
  logActivity('task.unscheduled', 'task', t.id, { slot_id: t.slot_id ?? null })
}

/** The name of the slot holding a task, read from the cache — none once its row is no live Time block. */
export function slotTitleOf(task: Pick<Task, 'slot_id'>): string | null {
  return task.slot_id ? (cachedRows().find((e) => e.id === task.slot_id && e.type === 'time_block' && !e.deleted_at)?.title ?? null) : null
}

/** Where a held task is, for its row: "in Code block · 10:00" ("in Shaheen · Tue 14:00" on another
 * day). Null when no live slot holds it. */
export function slotLabel(task: Pick<Task, 'slot_id' | 'scheduled_start'>, now: Date = new Date()): string | null {
  const title = task.scheduled_start ? slotTitleOf(task) : null
  if (!title) return null
  const at = new Date(task.scheduled_start!)
  const day = cairoDateKey(at)
  return `in ${title} · ${day === cairoDateKey(now) ? '' : `${dayShort(day).slice(0, 3)} `}${timeText(at)}`
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
  writeEvent(withExdate(row, occ.starts_at))
  writeEvent(copy)
  logActivity('calendar_event.created', 'calendar_event', copy.id, { title: copy.title, type: copy.type, series_id: row.id })
  const undoTasks = followSlot(occ, copy)
  return () => {
    writeEvent(withoutExdate(seriesOf(occ) ?? row, occ.starts_at))
    writeEvent(copy, 'delete')
    undoTasks()
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
  writeEvent(event)
  logActivity('calendar_event.created', 'calendar_event', event.id, { title, type: event.type })
  return event
}

/** Duplicate (Kai 2026-10-17): a plain event copied to the same time — side by side on the grid. An
 * occurrence copies as a one-off of its own (the series stays as it is). Returns the copy and its
 * Undo, which removes it outright (it never should have existed). A task's block: ./duplicate. */
export function copyEvent(event: CalendarEvent, when?: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>): { copy: CalendarEvent; undo: () => void } {
  const { seriesId: _occurrenceOf, ...rest } = event
  const at = nowIso()
  const copy: CalendarEvent = { ...rest, ...when, id: crypto.randomUUID(), recurrence_rule: null, recurrence_exdates: [], series_id: null, source: 'native', gcal_id: null, gcal_etag: null, external_ref: null, deleted_at: null, created_at: at, updated_at: at }
  writeEvent(copy)
  logActivity('calendar_event.created', 'calendar_event', copy.id, { title: copy.title, type: copy.type, duplicate_of: event.seriesId ?? event.id })
  return { copy, undo: () => writeEvent(copy, 'delete') }
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
      writeEvent(created)
      touchTaskSchedule(task.id, starts_at, ends_at, allDay)
      event = created
      steps.push(() => deleteEvent(created))
    }
    logActivity('task.scheduled', 'task', task.id, { calendar_event_id: event.id })
  } else if (moves.keep) {
    touchTaskSchedule(task.id, moves.keep.starts_at, moves.keep.ends_at, moves.keep.all_day) // a cleared sibling un-set it
  }
  return {
    event,
    undo: () => {
      steps.reverse().forEach((step) => step())
      const now = cachedTask(task.id)
      if (now) writeRow('tasks', { ...now, due_at: before.due_at, scheduled_start: before.scheduled_start, scheduled_end: before.scheduled_end, top3: before.top3, top3_rank: before.top3_rank, ...(before.slot_id ? { slot_id: before.slot_id, slot_date: before.slot_date ?? null } : null) })
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
  // A Time block made another kind holds no tasks: they come out, and the one Undo puts both back.
  const row = event.seriesId ? seriesOf(event) : event
  if (row?.type === 'time_block' && patch.type && patch.type !== 'time_block') {
    const held = cachedTasks().filter((t) => t.slot_id === row.id)
    if (held.length) {
      const undoTasks = releaseRow(row.id)
      toastUndo(`Out of the slot · ${held.length === 1 ? held[0].title : `${held.length} tasks`}`, () => {
        writeEvent({ ...(cachedRows().find((r) => r.id === row.id) ?? row), type: 'time_block' })
        undoTasks()
      })
    }
  }
  if (event.seriesId) {
    const { starts_at: _s, ends_at: _e, ...rest } = patch
    if (row) writeEvent({ ...row, ...rest })
    return
  }
  writeEvent({ ...event, ...patch })
  if (event.task_id) {
    const newStart = patch.starts_at ?? event.starts_at
    const newEnd = patch.ends_at ?? event.ends_at
    if (newStart !== event.starts_at || newEnd !== event.ends_at) {
      touchTaskSchedule(event.task_id, newStart, newEnd, patch.all_day ?? event.all_day)
    }
  }
}

/** allDay carries the all-day band ↔ time grid drag conversion (CALENDAR.md §6); omitted = unchanged.
 * An occurrence moves on its own (detach). Returns the Undo. */
export function moveOrResizeEvent(event: CalendarEvent, startsAt: string, endsAt: string, allDay?: boolean): () => void {
  if (event.seriesId) return detach(event, startsAt, endsAt, allDay ?? event.all_day)
  const prior = { ...event }
  const next = { ...event, starts_at: startsAt, ends_at: endsAt, all_day: allDay ?? event.all_day }
  writeEvent(next)
  if (event.task_id) touchTaskSchedule(event.task_id, startsAt, endsAt, next.all_day)
  const undoTasks = followSlot(event, next)
  return () => {
    moveOrResizeEvent(prior, prior.starts_at, prior.ends_at, prior.all_day)
    undoTasks()
  }
}

/** Undo half of deleteEvent: the block comes back and re-links its task's schedule. An occurrence:
 * its series stops skipping it. */
export function restoreEvent(event: CalendarEvent): void {
  if (event.seriesId) {
    const row = seriesOf(event)
    if (!row) return
    writeEvent(withoutExdate(row, event.starts_at))
    logActivity('calendar_event.restored', 'calendar_event', row.id, { occurrence: event.starts_at })
    return
  }
  writeEvent({ ...event, deleted_at: null })
  if (event.task_id) touchTaskSchedule(event.task_id, event.starts_at, event.ends_at, event.all_day)
  logActivity('calendar_event.restored', 'calendar_event', event.id, {})
}

/** Resizing a task-linked block is the calendar's estimate editor: the new length writes back to
 * duration_min (touchTaskSchedule; an all-day block's days never do, p7e A15). An occurrence is
 * resized on its own (detach). Returns the Undo. */
export function resizeEvent(event: CalendarEvent, startsAt: string, endsAt: string): () => void {
  if (event.seriesId) return detach(event, startsAt, endsAt, event.all_day)
  const prior = { ...event }
  const next = { ...event, starts_at: startsAt, ends_at: endsAt }
  writeEvent(next)
  if (event.task_id) touchTaskSchedule(event.task_id, startsAt, endsAt, event.all_day)
  const undoTasks = followSlot(event, next)
  return () => {
    resizeEvent(prior, prior.starts_at, prior.ends_at)
    undoTasks()
  }
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

/** Where the block that was edited stands now (a sheet kept open over it re-finds it by these). */
export interface BlockRef {
  id: string
  start: string
}

/** "This and following" (conductor decision 2026-10-12): the series ends just before `occ` and a new
 * one starts there, built by `tailOf`. Undefined when nothing of the series is left before `occ` —
 * the caller then edits the row in place. The Undo puts the original row back and drops the new one. */
function splitAt(row: CalendarEvent, occ: CalendarEvent, tailOf: (tail: CalendarEvent) => CalendarEvent): { head: CalendarEvent; tail: CalendarEvent; undo: () => void } | undefined {
  const split = splitSeries(row, occ, crypto.randomUUID(), nowIso())
  if (!split) return undefined
  const tail = tailOf(split.tail)
  writeEvent(split.head)
  writeEvent(tail)
  logActivity('calendar_event.created', 'calendar_event', tail.id, { title: tail.title, type: tail.type, split_from: row.id })
  return {
    head: split.head,
    tail,
    undo: () => {
      writeEvent(row)
      writeEvent(tail, 'delete')
    },
  }
}

/** The block's time of day and length from its own controls (the popover's Duration, the phone
 * sheet's Time): a one-off moves like a drag; a repeating event moves as a series from this
 * occurrence on — the earlier ones keep their time (a split). */
export function retimeEventWithUndo(event: CalendarEvent, from: Span, to: Span): BlockRef | null {
  const row = seriesOf(event)
  if (!row) {
    moveEventWithUndo(event, from, to, to.start === from.start ? 'bottom' : 'move')
    return null
  }
  const today = cairoDateKey(new Date())
  const message = to.start === from.start ? `Resized to ${rangeText(to.start, to.end)}` : movedText(from, { ...to, day: from.day }, today)
  const retime = (r: CalendarEvent) => retimeSeries(r, fromMin(to.start), to.end - to.start)
  // A repeating slot's tasks keep their day and take the new time (from this occurrence on, for a split).
  const split = splitAt(row, event, retime)
  if (split) {
    const undoTasks = reseat(row.id, [split.head, split.tail])
    toastUndo(`${message} · from ${dayHint(from.day, today)}`, () => {
      split.undo()
      undoTasks()
    })
    return { id: occurrenceId(split.tail.id, new Date(split.tail.starts_at).toISOString()), start: split.tail.starts_at }
  }
  const next = retime(row)
  writeEvent(next)
  const undoTasks = reseat(row.id, [next])
  toastUndo(message, () => {
    writeEvent(row)
    undoTasks()
  })
  return null
}

/** Repeat from a block (`rule` null = does not repeat). Task blocks never repeat — their task does.
 * From a later occurrence it applies from there on (a split); the earlier ones stay. One Undo. */
export function setEventRepeat(event: CalendarEvent, rule: string | null): BlockRef | null {
  const row = event.seriesId ? seriesOf(event) : event
  if (!row || row.task_id) return null
  const ref = (r: CalendarEvent) => ({ id: rule ? occurrenceId(r.id, new Date(r.starts_at).toISOString()) : r.id, start: r.starts_at })
  const today = cairoDateKey(new Date())
  const from = (iso: string) => ` · from ${dayHint(cairoDateKey(new Date(iso)), today)}`
  /** A rule that skips the block's own day (Saturday + "every weekday"): the block stays as a one-off
   * and the series starts on the rule's first day (series.alignToRule, conductor 2026-10-13). */
  const align = (series: CalendarEvent) => {
    const a = alignToRule(series, crypto.randomUUID(), nowIso())
    if (!a) return null
    writeEvent(a.series)
    writeEvent(a.keep)
    logActivity('calendar_event.created', 'calendar_event', a.keep.id, { title: a.keep.title, type: a.keep.type, series_id: a.series.id })
    return a
  }
  // A slot's tasks go to their day's occurrence of what the edit leaves, or out (reseat).
  const reseated = (head: CalendarEvent[], series: CalendarEvent, a: ReturnType<typeof align>) => reseat(row.id, [...head, ...(a ? [a.series, a.keep] : [series])])
  const split = event.seriesId ? splitAt(row, event, (tail) => rerule(tail, tail, rule)) : undefined
  if (split) {
    const a = align(split.tail)
    const undoTasks = reseated([split.head], split.tail, a)
    toastUndo(`${repeatLabel(rule)}${from(a?.series.starts_at ?? event.starts_at)}`, () => {
      split.undo()
      if (a) writeEvent(a.keep, 'delete')
      undoTasks()
    })
    return a ? { id: a.keep.id, start: a.keep.starts_at } : ref(split.tail)
  }
  const next = rerule(row, event, rule)
  writeEvent(next)
  const a = align(next)
  const undoTasks = reseated([], next, a)
  toastUndo(`${repeatLabel(rule)}${a ? from(a.series.starts_at) : ''}`, () => {
    writeEvent(row)
    if (a) writeEvent(a.keep, 'delete')
    undoTasks()
  })
  return a ? { id: a.keep.id, start: a.keep.starts_at } : ref(next)
}

/** Remind from a block (A12, 0077): `min` minutes before each start, null = none. On an occurrence it's
 * the whole series' — an offset holds for every repeat. One Undo. */
export function setEventRemindWithUndo(event: CalendarEvent, min: number | null): void {
  const row = event.seriesId ? seriesOf(event) : event
  if (!row || row.task_id || (row.remind_min ?? null) === min) return
  writeEvent({ ...row, remind_min: min })
  toastUndo(`${remindLabel(min)} · ${row.title}`, () => {
    const now = cachedRows().find((r) => r.id === row.id) ?? row
    writeEvent({ ...now, remind_min: row.remind_min ?? null })
  })
}

/** "Link a task…": a plain one-off block takes the task (its block now — the task is scheduled
 * here). A Time block holds tasks (0073), so on one the task goes IN it, as a drop does — it used to
 * turn the slot into that task's block and drop what it held. One Undo puts it all back. */
export function linkTaskWithUndo(event: CalendarEvent, task: Task): void {
  if (event.type === 'time_block') return putInSlotWithUndo(task, event)
  if (event.seriesId || event.recurrence_rule) return
  const prior = { ...event }
  const priorTask = cachedTask(task.id) ?? task
  writeEvent({ ...event, task_id: task.id, type: 'task' })
  touchTaskSchedule(task.id, event.starts_at, event.ends_at, event.all_day)
  logActivity('task.scheduled', 'task', task.id, { calendar_event_id: event.id })
  toastUndo(`Linked · ${task.title}`, () => {
    writeEvent(prior)
    writeRow('tasks', priorTask)
  })
}

/** Deleting a block un-schedules its task but the task itself survives. An occurrence: its series
 * skips it ("This event"). A Time slot lets go of its tasks (unscheduled); the returned Undo takes
 * them back (restoreEvent brings only the block). */
export function deleteEvent(event: CalendarEvent): () => void {
  const undoTasks = releaseSlot(event)
  if (event.seriesId) {
    const row = seriesOf(event)
    if (!row) return undoTasks
    writeEvent(withExdate(row, event.starts_at))
    logActivity('calendar_event.deleted', 'calendar_event', row.id, { occurrence: event.starts_at })
    return undoTasks
  }
  writeEvent({ ...event, deleted_at: new Date().toISOString() })
  if (event.task_id) touchTaskSchedule(event.task_id, null, null)
  logActivity('calendar_event.deleted', 'calendar_event', event.id, {})
  return undoTasks
}

/** Takes a block off the calendar with Undo — "Unscheduled · <title>" / "Deleted · <title>". The task
 * stays either way (Punch 6: capture the prior row, undo through the same api). */
export function deleteEventWithUndo(event: CalendarEvent, verb: 'Unscheduled' | 'Deleted' | 'Discarded'): void {
  const prior = { ...event }
  const undoTasks = deleteEvent(event)
  toastUndo(`${verb} · ${event.title}`, () => {
    restoreEvent(prior)
    undoTasks()
  })
}

/** Multi-select (Kai 2026-10-22, Google / Notion Calendar): the picked blocks off the calendar at once — a
 * task's block is unscheduled (the task stays), an event goes to Trash — with one Undo. A Google event is
 * never touched. */
export function deleteEventsWithUndo(events: readonly CalendarEvent[]): void {
  const own = events.filter((e) => !isSynced(e))
  if (!own.length) return
  const undos = own.map((e) => {
    const prior = { ...e }
    const undoTasks = deleteEvent(e)
    return () => {
      restoreEvent(prior)
      undoTasks()
    }
  })
  toastUndo(`Removed · ${own.length} ${own.length === 1 ? 'block' : 'blocks'}`, () => undos.reverse().forEach((u) => u()))
}

/** Multi-select: the picked blocks moved by the same amount as the one dragged, one Undo. */
export function moveEventsByWithUndo(events: readonly CalendarEvent[], deltaMs: number): void {
  const own = events.filter((e) => !isSynced(e) && !e.all_day)
  if (!own.length || !deltaMs) return
  const at = (iso: string) => new Date(Date.parse(iso) + deltaMs).toISOString()
  const undos = own.map((e) => moveOrResizeEvent(e, at(e.starts_at), at(e.ends_at)))
  toastUndo(`${own.length} ${own.length === 1 ? 'block' : 'blocks'} moved`, () => undos.reverse().forEach((u) => u()))
}

/** "All events": the series row and every occurrence dragged out of it go to Trash, one Undo. Every
 * task in any of its slots goes back to the rail. */
export function deleteSeriesWithUndo(event: CalendarEvent): void {
  const row = seriesOf(event) ?? event
  const all = [row, ...cachedRows().filter((r) => r.series_id === row.id && !r.deleted_at)]
  const undoTasks = restamp(cachedTasks().filter((t) => all.some((r) => r.id === t.slot_id)), () => OUT_OF_SLOT)
  for (const r of all) deleteEvent(r)
  toastUndo(`Deleted all · ${row.title}`, () => {
    all.forEach(restoreEvent)
    undoTasks()
  })
}

/** True for a block that is an occurrence of a repeating event of ours — the ones every change asks about (cal-clicks).
 * A Google event never: google-sync owns it. */
export const isSeriesBlock = (e: Pick<CalendarEvent, 'seriesId' | 'recurrence_rule' | 'source'>): boolean => !isSynced(e) && !!(e.seriesId || e.recurrence_rule)

/** cal-clicks: a change to an occurrence of a repeating event, as the person answered the scope question —
 * ./scope plans it (this = the exception, following = the split, all = the series row), it goes through the outbox,
 * a Time block's tasks follow the occurrences the change leaves (reseat), and ONE Undo puts every row back.
 * Returns where the block stands now (a sheet kept open over it follows it). */
export function applySeriesChange(event: CalendarEvent, scope: Scope, change: SeriesChange, message: string): BlockRef | null {
  const row = event.seriesId ? seriesOf(event) : event
  if (!row || isSynced(row)) return null
  const detached = cachedRows().filter((r) => r.series_id === row.id && !r.deleted_at)
  const plan = planScope(row, event, scope, change, { newId: () => crypto.randomUUID(), now: nowIso(), detached })
  if (!plan.write.length && !plan.trash.length) return plan.ref
  const rows = cachedRows()
  const prior = [...plan.write, ...plan.trash].flatMap((r) => rows.filter((x) => x.id === r.id).map((x) => ({ ...x })))
  const trashed = new Set(plan.trash.map((r) => r.id))
  // A slot's tasks: each to its day's occurrence among what the change leaves, else out (the series' own rule);
  // a one-off moved out of it earlier that goes to Trash lets go of its tasks.
  const undoTasks = [
    ...(row.type === 'time_block' || plan.write.some((w) => w.type === 'time_block') ? [reseat(row.id, plan.write.filter((w) => !trashed.has(w.id)))] : []),
    ...plan.trash.filter((r) => r.id !== row.id).map((r) => releaseRow(r.id)),
  ]
  for (const w of plan.write) writeEvent(w)
  const at = nowIso()
  for (const t of plan.trash) {
    writeEvent({ ...t, deleted_at: at })
    logActivity('calendar_event.deleted', 'calendar_event', t.id, {})
  }
  for (const w of plan.write.filter((x) => plan.created.includes(x.id))) logActivity('calendar_event.created', 'calendar_event', w.id, { title: w.title, type: w.type, series_id: row.id, scope })
  if (change.kind === 'delete' && scope === 'this') logActivity('calendar_event.deleted', 'calendar_event', row.id, { occurrence: event.starts_at })
  toastUndo(message, () => {
    for (const id of plan.created) {
      const made = plan.write.find((w) => w.id === id)
      if (made) writeEvent(made, 'delete')
    }
    for (const p of prior) writeEvent(p)
    undoTasks.reverse().forEach((u) => u())
  })
  return plan.ref
}

/** Deleting a task deletes its block too (called from the tasks feature after user confirms). */
export function deleteEventsForTask(taskId: string): void {
  const events = cachedRows()
  for (const event of events.filter((e) => e.task_id === taskId)) {
    writeEvent({ ...event, deleted_at: new Date().toISOString() })
  }
}

export function restoreEventsForTask(taskId: string): void {
  const events = cachedRows()
  for (const event of events.filter((e) => e.task_id === taskId && e.deleted_at)) {
    writeEvent({ ...event, deleted_at: null })
  }
}
