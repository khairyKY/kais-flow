// The block detail (design-export/Calendar.dc.html §5 "Block detail — a menu, not a form") — one list,
// one order, for the desktop popover (./BlockMenu) and the phone event sheet (./PhoneSheets BlockSheet).
// Pure, so the order is tested. Every row commits on selection; there is no Save.

import { appZone } from '../../lib/appZone'
import { clockRange } from '../../lib/clock'
import type { CalendarEvent, Task } from '../../lib/types'
import { durationLabel, fromMin } from '../../components/pickerMath'
import { REPEAT_LABELS } from '../tasks/taskMenuSpec'
import { repeatLabel as ruleWords } from '../tasks/taskSheetMath'
import { eventSpan } from './phoneGridMath'

export type BlockMenuKey = 'date' | 'time' | 'project' | 'repeat' | 'remind' | 'complete' | 'open' | 'replan' | 'link' | 'more' | 'duplicate' | 'unschedule' | 'delete' | 'google'

export interface BlockMenuEntry {
  key: BlockMenuKey
  label: string
  /** The value on the right: the length ("2h"), the Unschedule / Delete key (⌫). */
  hint?: string
  /** Opens a submenu / picker. */
  sub?: boolean
  /** Nothing set yet ("No project", "Does not repeat") — drawn quiet. */
  unset?: boolean
  /** Starts a group: a dashed hairline above. */
  divider?: boolean
  /** "From task" + the task's title, quiet, above the row (5a). */
  caption?: { label: string; text: string }
  destructive?: boolean
}

export interface BlockMenuContext {
  /** The task behind a task block, when it's loaded. */
  task?: Pick<Task, 'title' | 'status'> | null
  projectName?: string | null
  /** A task block that ran out unfinished: Replan… (the grid's own "Overdue · Replan" link). */
  missed?: boolean
  now?: Date
}

/** §5's popover width. */
export const BLOCK_MENU_WIDTH = 238

/** Where the popover goes for a block's rect: beside it on the right, else on the left, top-aligned
 * (screen px, as ContextMenu takes them; `zoom` = lib/uiScale uiZoom()). */
export function besideBlock(r: Pick<DOMRect, 'left' | 'right' | 'top'>, viewportWidth: number, zoom = 1): { x: number; y: number } {
  const w = BLOCK_MENU_WIDTH * zoom
  const gap = 8 * zoom
  const x = r.right + gap + w <= viewportWidth ? r.right + gap : Math.max(gap, r.left - gap - w)
  return { x, y: r.top }
}

/** QuickCreate's titles for a block saved without one. */
const DEFAULT_TITLES = ['New event', 'Time block']

/** 5c: a block just made and never named — its title row shows "Add title", its last row Discard. */
export function isUntitled(e: Pick<CalendarEvent, 'title' | 'created_at'>, now: Date = new Date()): boolean {
  const fresh = now.getTime() - Date.parse(e.created_at) < 10 * 60_000
  return fresh && (!e.title.trim() || DEFAULT_TITLES.includes(e.title))
}

/** A Google event (google-sync, B1): shown, never edited here — Google is its truth. */
export const isSynced = (e: Pick<CalendarEvent, 'source'>): boolean => e.source === 'gcal'

export const isRepeatingBlock = (e: Pick<CalendarEvent, 'recurrence_rule' | 'seriesId'>): boolean => !!(e.seriesId || e.recurrence_rule)

/** "Wed, Jul 29" — an all-day block's date is in no zone. */
export function blockDate(e: Pick<CalendarEvent, 'starts_at' | 'all_day'>): string {
  return new Date(e.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: e.all_day ? 'UTC' : appZone() })
}

/** The Repeat row: "Repeats weekly" for the presets, the rule in words for a custom one ("Every
 * weekday", "Every month on the 2nd Tuesday") — the task sheet's words (tasks/taskSheetMath). */
export function repeatLabel(rule: string | null | undefined): string {
  if (!rule) return 'Does not repeat'
  return REPEAT_LABELS[rule] ? `Repeats ${REPEAT_LABELS[rule].toLowerCase()}` : ruleWords(rule)
}

/** The Remind row's choices (A12, 0077) — minutes before each start; tasks' Remind submenu's words. */
export const EVENT_REMIND: readonly { min: number | null; label: string }[] = [
  { min: null, label: 'No reminder' },
  { min: 0, label: 'At start' },
  { min: 5, label: '5 min before' },
  { min: 10, label: '10 min before' },
  { min: 15, label: '15 min before' },
  { min: 30, label: '30 min before' },
  { min: 60, label: '1 hr before' },
]

/** The Remind row: "No reminder", "Remind at start", "Remind 15 min before". */
export function remindLabel(min: number | null | undefined): string {
  if (min == null) return 'No reminder'
  return min === 0 ? 'Remind at start' : `Remind ${EVENT_REMIND.find((o) => o.min === min)?.label ?? `${min} min before`}`
}

export function blockMenuSpec(e: CalendarEvent, ctx: BlockMenuContext = {}): BlockMenuEntry[] {
  const span = eventSpan(e)
  // A Google event: when it is, and where it comes from — nothing to change, nothing to delete.
  if (isSynced(e)) {
    return [
      { key: 'date', label: blockDate(e) },
      e.all_day ? { key: 'time', label: 'All day' } : { key: 'time', label: clockRange(fromMin(span.start), span.end >= 1440 ? '24:00' : fromMin(span.end)).replace('–', ' – '), hint: durationLabel(span.end - span.start) },
      { key: 'google', label: `From Google · ${e.external_ref?.calendar ?? 'Calendar'}`, divider: true },
    ]
  }
  const repeating = isRepeatingBlock(e)
  const out: BlockMenuEntry[] = [
    { key: 'date', label: blockDate(e), sub: true },
    e.all_day
      ? { key: 'time', label: 'All day' }
      : { key: 'time', label: clockRange(fromMin(span.start), span.end >= 1440 ? '24:00' : fromMin(span.end)).replace('–', ' – '), hint: durationLabel(span.end - span.start), sub: true },
    { key: 'project', label: ctx.projectName ?? 'No project', unset: !ctx.projectName, sub: true },
  ]
  // A task block repeats through its task's own rule, never on the calendar.
  if (!e.task_id) out.push({ key: 'repeat', label: repeatLabel(e.recurrence_rule), unset: !e.recurrence_rule, sub: true })
  // A12: an event reminds N minutes before each start. A task block reminds through its task; an
  // all-day block has no start time to count back from.
  if (!e.task_id && !e.all_day) out.push({ key: 'remind', label: remindLabel(e.remind_min), unset: e.remind_min == null, sub: true })
  if (e.task_id && ctx.task) {
    out.push(
      { key: 'complete', label: ctx.task.status === 'done' ? 'Reopen' : 'Complete', divider: true, caption: { label: 'From task', text: ctx.task.title } },
      { key: 'open', label: 'Open task' },
    )
    if (ctx.missed) out.push({ key: 'replan', label: 'Replan…' }) // the calendar's Plan menu, in its place
    // Kai 2026-10-17: a copy of the task, blocked at this same time.
    out.push({ key: 'duplicate', label: 'Duplicate' })
  }
  if (e.task_id) out.push({ key: 'unschedule', label: 'Unschedule', hint: '⌫', divider: true })
  else {
    // deviation(2026-10-12): §5 drops the Event / Time block kind and Busy / Free; they stay reachable
    // here, one quiet row, so creating a block is not the only place to set them.
    if (!repeating) out.push({ key: 'link', label: 'Link a task…', divider: true })
    out.push({ key: 'more', label: 'More', sub: true, divider: repeating })
    // Kai 2026-10-17: a copy at the same time (side by side) — an event, never a Time block (a slot
    // repeats instead); a repeat's copy is this one occurrence, on its own.
    if (e.type !== 'time_block') out.push({ key: 'duplicate', label: 'Duplicate' })
  }
  // p7e A4: ⌫ deletes a plain one-off (Akiflow's Backspace); a repeat asks This / All on the row instead.
  out.push({ key: 'delete', label: isUntitled(e, ctx.now) ? 'Discard' : 'Delete', destructive: true, sub: repeating, ...(!e.task_id && !repeating ? { hint: '⌫' } : null) })
  return out
}
