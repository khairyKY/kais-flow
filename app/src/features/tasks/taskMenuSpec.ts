// The ⋯ menu of every task row (DS-CHANGELOG §3 "Action sheet (⋯)", MK Action Sheet) — one list,
// one order, for the phone action sheet, the desktop ⋯ / right-click menu, and every row that
// shows a task (Tasks, Today's Top 3 + goal card, task-backed Up next). Pure, so the order is tested.

import { cairoTimeKey } from '../calendar/eventTime'
import type { Task } from '../../lib/types'

export type TaskMenuKey = 'plan' | 'unschedule' | 'project' | 'priority' | 'repeat' | 'remind' | 'top3' | 'goal' | 'up' | 'down' | 'focus' | 'select' | 'reopen' | 'delete'

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
  /** The goal of the day already — no Make goal. */
  goal?: boolean
  /** A Top 3 row on Today: its place (0 = the goal) and the last open place — Move up / Move down. */
  place?: { index: number; last: number }
}

export const PRIORITY_LABELS: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium' }
export const REPEAT_LABELS: Record<string, string> = { 'FREQ=DAILY': 'Daily', 'FREQ=WEEKLY': 'Weekly', 'FREQ=MONTHLY': 'Monthly' }

export function taskMenuSpec(task: Task, ctx: TaskMenuContext): TaskMenuEntry[] {
  const n = ctx.bulkCount && ctx.bulkCount > 1 ? ` (${ctx.bulkCount})` : ''
  const del: TaskMenuEntry = { key: 'delete', label: `Delete${n}`, hint: 'Undo 6s', destructive: true }
  if (task.status === 'done' || task.completed_at) return [{ key: 'reopen', label: 'Reopen' }, del]
  const place = !n && ctx.place
  return [
    // Kai 2026-10-07: Tomorrow + Pick date… became one Plan list (./PlanMenu) — every date option,
    // each saying what it does. Swipe right and the `2` key are still Tomorrow in one move.
    { key: 'plan', label: `${ctx.overdue && !n ? 'Replan' : 'Plan'}…${n}`, sub: true },
    ...(ctx.canUnschedule ? [{ key: 'unschedule', label: 'Unschedule' } as const] : []),
    { key: 'project', label: `Move to…${n}`, hint: ctx.projectName ?? 'None', sub: true },
    { key: 'priority', label: 'Priority', hint: (task.priority && PRIORITY_LABELS[task.priority]) || 'None', sub: true },
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
    ...(ctx.canSelect ? [{ key: 'select', label: ctx.selected ? 'Deselect' : 'Select', hint: 'or hold a row' } as const] : []),
    del,
  ]
}
