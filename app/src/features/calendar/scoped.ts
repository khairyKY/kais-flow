import { cairoDateKey } from '../../lib/dateShortcuts'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Task } from '../../lib/types'
import { dayHint } from '../../components/pickerMath'
import { cachedTask, completeTaskScopedWithUndo, completeTaskWithUndo, deleteTaskScopedWithUndo, detachRound, editTaskScopedWithUndo } from '../tasks/api'
import {
  applySeriesChange, deleteEventWithUndo, isSeriesBlock, moveOrResizeEvent, moveToDayWithUndo, resizeEvent, retimeEventWithUndo, setEventRemindWithUndo, updateEvent, type BlockRef,
} from './api'
import { duplicateBlockWithUndo } from './duplicate'
import { eventSpan, movedText, rangeText, spanIso, type DragMode, type Span } from './phoneGridMath'
import type { Scope, SeriesChange } from './scope'
import { askScope, scopeSuffix } from './scopeQuestion'

// ── cal-clicks (Kai 2026-10-26): every change a person makes to a block, through the scope question when the block
// is an occurrence of a repeating event — or the block of a repeating task's open round. A one-off goes straight
// through, as before. Each returns where the block stands after (a sheet kept open over it follows it), null when
// it stays, or undefined when the person cancelled (Esc / Cancel: nothing was written). ──

type Outcome = BlockRef | null | undefined

/** The open round of a repeating task behind a block — the ones that ask. A done round is history: it never asks. */
function roundOf(e: Pick<CalendarEvent, 'task_id'>, task?: Task): Task | undefined {
  const t = task ?? (e.task_id ? cachedTask(e.task_id) : undefined)
  return t && t.recurrence_rule && t.status === 'todo' ? t : undefined
}

const askEvent = (e: CalendarEvent, verb: string) => askScope({ kind: 'event', verb, title: e.title, blockId: e.id })
const askTask = (t: Task, verb: string, blockId?: string) => askScope({ kind: 'task', verb, title: t.title, blockId })

/** A series change under the asked scope, with its own toast and Undo. */
async function seriesChange(e: CalendarEvent, verb: string, change: SeriesChange, said: string): Promise<Outcome> {
  const scope = await askEvent(e, verb)
  if (!scope) return undefined
  return applySeriesChange(e, scope, change, `${said} · ${scopeSuffix('event', scope)}`)
}

/** Title, colour, project, kind, busy / free. A series asks; a one-off saves as it always did. */
export async function editEvent(e: CalendarEvent, patch: Partial<CalendarEvent>, said = `Changed · ${e.title}`): Promise<Outcome> {
  if (!isSeriesBlock(e)) {
    updateEvent(e, patch)
    return null
  }
  return seriesChange(e, 'Edit', { kind: 'patch', patch }, said)
}

/** Remind (A12): a series asks too (an offset, so "All" is every start). */
export async function remindEvent(e: CalendarEvent, min: number | null, said: string): Promise<Outcome> {
  if (!isSeriesBlock(e)) {
    setEventRemindWithUndo(e, min)
    return null
  }
  if ((e.remind_min ?? null) === min) return null
  return seriesChange(e, 'Edit', { kind: 'patch', patch: { remind_min: min } }, said)
}

/**
 * A block moved or resized (a drag, a handle, a typed time, the Date row). `run` is the one-off write (its Undo);
 * `onCancel` puts a dragged block back. A series asks This / Following / All; a repeating task's round asks too —
 * "This one" moves the block and lets the round leave its series (the series goes on, at its time, from the next).
 * A drag across the all-day line on a series stays "This event" (the series keeps its kind of time).
 */
export async function moveBlock(
  e: CalendarEvent,
  to: { starts_at: string; ends_at: string; all_day?: boolean },
  opts: { verb: 'Move' | 'Resize'; said: string; run: () => () => void; onCancel?: () => void; task?: Task },
): Promise<Outcome> {
  const flips = to.all_day !== undefined && to.all_day !== e.all_day
  if (isSeriesBlock(e) && !flips) {
    const ref = await seriesChange(e, opts.verb, { kind: 'time', starts_at: to.starts_at, ends_at: to.ends_at }, opts.said)
    if (ref === undefined) opts.onCancel?.()
    return ref
  }
  const round = roundOf(e, opts.task)
  if (!round) {
    toastUndo(opts.said, opts.run())
    return null
  }
  const scope = await askTask(round, opts.verb, e.id)
  if (!scope) {
    opts.onCancel?.()
    return undefined
  }
  const undoMove = opts.run()
  const undoRound = scope === 'this' ? detachRound(round) : () => {}
  toastUndo(`${opts.said} · ${scopeSuffix('task', scope)}`, () => {
    undoRound()
    undoMove()
  })
  return null
}

/** The phone's drop / handle / Time sheet: moveEventWithUndo's words ("Moved to 16:15", "Resized to 15:00–16:15"). */
export function moveSpan(e: CalendarEvent, from: Span, to: Span, mode: DragMode, onCancel?: () => void): Promise<Outcome> {
  const iso = spanIso(to)
  const move = mode === 'move'
  return moveBlock(e, iso, {
    verb: move ? 'Move' : 'Resize',
    said: move ? movedText(from, to, cairoDateKey(new Date())) : `Resized to ${rangeText(to.start, to.end)}`,
    run: () => (move ? moveOrResizeEvent(e, iso.starts_at, iso.ends_at) : resizeEvent(e, iso.starts_at, iso.ends_at)),
    onCancel,
  })
}

/** The popover's / sheet's own time controls (Time ▸, typed, the length chips). A one-off: as before. */
export function retimeBlock(e: CalendarEvent, from: Span, to: Span): Promise<Outcome> {
  if (!isSeriesBlock(e) && !roundOf(e)) return Promise.resolve(retimeEventWithUndo(e, from, to))
  return moveSpan(e, from, to, to.start === from.start && to.day === from.day ? 'bottom' : 'move')
}

/** The Date row: the block to `day`, same time. */
export function moveToDay(e: CalendarEvent, day: string): Promise<Outcome> {
  if (!isSeriesBlock(e) && !roundOf(e)) {
    moveToDayWithUndo(e, day)
    return Promise.resolve(null)
  }
  const ms = Date.parse(e.ends_at) - Date.parse(e.starts_at)
  const starts = e.all_day ? `${day}T00:00:00.000Z` : spanIso({ ...eventSpan(e), day }).starts_at
  if (starts === e.starts_at) return Promise.resolve(null)
  const ends = new Date(Date.parse(starts) + ms).toISOString()
  return moveBlock(e, { starts_at: starts, ends_at: ends }, { verb: 'Move', said: `Moved to ${dayHint(day, cairoDateKey(new Date()))}`, run: () => moveOrResizeEvent(e, starts, ends) })
}

/** Delete / Discard: a series asks (This skips it · Following ends the series before it · All); a repeating task's
 * round asks (This skips the round · Following / All to Trash). Unschedule never asks — the task stays as it is. */
export async function deleteBlock(e: CalendarEvent, verb: 'Deleted' | 'Discarded' | 'Unscheduled'): Promise<Scope | null> {
  if (isSeriesBlock(e) && verb !== 'Unscheduled') {
    const scope = await askEvent(e, 'Delete')
    if (scope) applySeriesChange(e, scope, { kind: 'delete' }, `${verb} · ${e.title} · ${scopeSuffix('event', scope)}`)
    return scope
  }
  const round = verb === 'Deleted' ? roundOf(e) : undefined
  if (round) {
    const scope = await askTask(round, 'Delete', e.id)
    if (scope) deleteTaskScopedWithUndo(round, scope)
    return scope
  }
  deleteEventWithUndo(e, verb)
  return 'this'
}

/** Duplicate (menu B, Ctrl D): a repeat asks — "This" (the default, the first answer) copies just this occurrence;
 * "Following" / "All" copy the series from here, or all of it. A repeating task's round: "This one" copies it as a
 * one-off, the others as a repeating task of its own. */
export async function duplicateBlock(e: CalendarEvent, task?: Task): Promise<void> {
  if (isSeriesBlock(e)) {
    await seriesChange(e, 'Duplicate', { kind: 'duplicate' }, `Duplicated · ${e.title}`)
    return
  }
  const round = roundOf(e, task)
  if (!round) return duplicateBlockWithUndo(e, task)
  const scope = await askTask(round, 'Duplicate', e.id)
  if (scope) duplicateBlockWithUndo(e, round, undefined, scope === 'this')
}

/** A block's tick (the box, menu B's Complete, the phone's check): a repeating task's round asks — "This one" is
 * the usual completion (the next round comes), "Following" / "All" end the series. */
export async function completeBlockTask(task: Task, blockId?: string): Promise<void> {
  const round = roundOf({ task_id: task.id }, task)
  if (!round) return void completeTaskWithUndo(task)
  const scope = await askTask(round, 'Complete', blockId)
  if (scope) completeTaskScopedWithUndo(round, scope)
}

/** A repeating task's field (title, notes, where it lives) from its popover / sheet / editor / menu. `plain` is the
 * one-off write. Resolves false when the person cancelled (the field goes back). */
export async function editTask(task: Task, patch: (t: Task) => Partial<Task>, said: string, plain: () => void): Promise<boolean> {
  const round = roundOf({ task_id: task.id }, task)
  if (!round) {
    plain()
    return true
  }
  const scope = await askTask(round, 'Edit')
  if (!scope) return false
  editTaskScopedWithUndo(round, scope, patch, `${said} · ${scopeSuffix('task', scope)}`)
  return true
}
