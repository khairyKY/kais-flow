// The ⋯ menu of every task row (DS-CHANGELOG §3 "Action sheet (⋯)", MK Action Sheet) — one list,
// one order, for the phone action sheet, the desktop ⋯ / right-click menu, and every row that
// shows a task (Tasks, Today's Top 3 + goal card, task-backed Up next). Pure, so the order is tested.

import { cairoTimeKey } from '../calendar/eventTime'
import type { Task } from '../../lib/types'
import { isSnoozed, snoozeWhen } from './snooze'

export type TaskMenuKey = 'tomorrow' | 'plan' | 'unschedule' | 'intoSlot' | 'subtask' | 'snooze' | 'unsnooze' | 'project' | 'priority' | 'labels' | 'repeat' | 'remind' | 'top3' | 'goal' | 'up' | 'down' | 'focus' | 'duplicate' | 'select' | 'reopen' | 'delete'

export interface TaskMenuEntry {
  key: TaskMenuKey
  label: string
  /** Mono hint on the right of the phone row ("Mon 09:00", the current project, "Off"). */
  hint?: string
  /** Opens a second picker (a chevron on the phone row). */
  sub?: boolean
  destructive?: boolean
}

export interface TaskMenuContext {
  /** "Mon 09:00" (lib/dateShortcuts tomorrowHint), or the block's own time on an Up next row. */
  tomorrowHint: string
  projectName?: string | null
  /** 2+ selected and this row among them: the date, project and delete rows act on all of them. */
  bulkCount?: number
  selected?: boolean
  canSelect?: boolean
  /** An Up next row backed by a calendar block can also come off the calendar. */
  canUnschedule?: boolean
  /** Strictly past its date (planMath isOverdue): Plan… reads Replan… (Kai 2026-10-07). */
  overdue?: boolean
  /** There are Time blocks ahead to go into (calendar/slots upcomingSlots): Into a slot…. */
  slots?: boolean
  /** The goal of the day already — no Make goal. */
  goal?: boolean
  /** A Top 3 row on Today: its place (0 = the goal) and the last open place — Move up / Move down. */
  place?: { index: number; last: number }
  /** The row draws its subtasks under it (Subtasks A, a list): Add a subtask opens its add line. */
  subtask?: boolean
  /** The desktop right-click / ⋯ menu: Tomorrow gets its own top row (the phone swipes for it). */
  desktop?: boolean
}

export const PRIORITY_LABELS: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium' }
export const REPEAT_LABELS: Record<string, string> = { 'FREQ=DAILY': 'Daily', 'FREQ=WEEKLY': 'Weekly', 'FREQ=MONTHLY': 'Monthly', 'FREQ=YEARLY': 'Yearly' }
/** The Repeat submenu's choices, in order (null = Never) — tasks and calendar blocks alike. */
export const REPEAT_RULES: readonly (string | null)[] = [null, 'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY']

export function taskMenuSpec(task: Task, ctx: TaskMenuContext): TaskMenuEntry[] {
  const n = ctx.bulkCount && ctx.bulkCount > 1 ? ` (${ctx.bulkCount})` : ''
  const del: TaskMenuEntry = { key: 'delete', label: `Delete${n}`, hint: 'Undo 6s', destructive: true }
  if (task.status === 'done' || task.completed_at) return [{ key: 'reopen', label: 'Reopen' }, del]
  const place = !n && ctx.place
  return [
    // Kai 2026-10-12 audit: under Plan… the most common move took three clicks on desktop — Tomorrow is
    // back on top there (with its `2` key); the phone keeps its one-swipe Tomorrow and the Plan list.
    ...(ctx.desktop ? [{ key: 'tomorrow', label: `Tomorrow${n}`, hint: ctx.tomorrowHint } as const] : []),
    // Kai 2026-10-07: Tomorrow + Pick date… became one Plan list (./PlanMenu) — every date option,
    // each saying what it does. Swipe right and the `2` key are still Tomorrow in one move.
    { key: 'plan', label: `${ctx.overdue && !n ? 'Replan' : 'Plan'}…${n}`, sub: true },
    // Time Slots (0073): a task held by a Time block comes out of it — back to the rail, unscheduled.
    ...(task.slot_id && !n ? [{ key: 'unschedule', label: 'Out of the slot' } as const] : ctx.canUnschedule ? [{ key: 'unschedule', label: 'Unschedule' } as const] : []),
    // The phone's way into a slot (a hold selects there, it doesn't drag) — and the desktop's without a drag.
    ...(ctx.slots && !n ? [{ key: 'intoSlot', label: 'Into a slot…', sub: true } as const] : []),
    // Subtasks A (Kai 2026-10-16): the phone's way to add one from the row (the computer also has the row's +).
    ...(ctx.subtask && !n && !task.parent_task_id ? [{ key: 'subtask', label: 'Add a subtask' } as const] : []),
    // Snooze (Kai 2026-10-17): off every list until a time, then back — the date stays (./snooze). A
    // snoozed task (the Snoozed list) says when it's back, and comes back now.
    !n && isSnoozed(task) ? { key: 'unsnooze', label: 'Unsnooze', hint: `back ${snoozeWhen(task.snoozed_until!)}` } : { key: 'snooze', label: `Snooze…${n}`, sub: true },
    { key: 'project', label: `Move to…${n}`, hint: ctx.projectName ?? 'None', sub: true },
    { key: 'priority', label: 'Priority', hint: (task.priority && PRIORITY_LABELS[task.priority]) || 'None', sub: true },
    // The Label picker (Overlays.dc.html, keyboard L) — the desktop menu's; the phone edits labels in
    // the task sheet's chips, and its action sheet stays as MK Action Sheet draws it.
    ...(ctx.desktop ? [{ key: 'labels', label: 'Labels', sub: true } as const] : []),
    { key: 'repeat', label: 'Repeat', hint: task.recurrence_rule ? (REPEAT_LABELS[task.recurrence_rule] ?? 'Custom') : 'Never', sub: true },
    { key: 'remind', label: 'Remind', hint: task.reminder_at ? cairoTimeKey(new Date(task.reminder_at)) : 'Off', sub: true },
    { key: 'top3', label: task.top3 ? 'Remove from Top 3' : 'Add to Top 3' },
    // Kai 2026-10-07: "Just give me a button for making something the goal of the day."
    ...(n || ctx.goal ? [] : [{ key: 'goal', label: 'Make goal of the day' } as const]),
    // The Top 3's order on a phone (desktop also drags, or Alt+↑/↓); up into first place = the goal.
    ...(place && place.index > 0 ? [{ key: 'up', label: 'Move up' } as const] : []),
    ...(place && place.index < place.last ? [{ key: 'down', label: 'Move down' } as const] : []),
    // Kai 2026-09-27: the inline ▶ buttons went, so Focus lives here — one task, never in bulk.
    ...(n ? [] : [{ key: 'focus', label: 'Start focus' } as const]),
    // Kai 2026-10-17 ("we need to add duplicating options"): an open copy, its subtasks along — with a
    // selection, of every selected task (one Undo). Todoist / Akiflow keep it just above the end.
    { key: 'duplicate', label: `Duplicate${n}` },
    ...(ctx.canSelect ? [{ key: 'select', label: ctx.selected ? 'Deselect' : 'Select', hint: 'or hold a row' } as const] : []),
    del,
  ]
}
