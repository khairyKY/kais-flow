// The ⋯ menu of every task row (DS-CHANGELOG §3 "Action sheet (⋯)", MK Action Sheet) — one list,
// one order, for the phone action sheet, the desktop ⋯ / right-click menu, and every row that
// shows a task (Tasks, Today's Top 3 + goal card, task-backed Up next). Pure, so the order is tested.

import { cairoTimeKey } from '../calendar/eventTime'
import type { Task } from '../../lib/types'

export type TaskMenuKey = 'tomorrow' | 'date' | 'unschedule' | 'project' | 'priority' | 'repeat' | 'remind' | 'top3' | 'select' | 'reopen' | 'delete'

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
}

export const PRIORITY_LABELS: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium' }
export const REPEAT_LABELS: Record<string, string> = { 'FREQ=DAILY': 'Daily', 'FREQ=WEEKLY': 'Weekly', 'FREQ=MONTHLY': 'Monthly' }

export function taskMenuSpec(task: Task, ctx: TaskMenuContext): TaskMenuEntry[] {
  const n = ctx.bulkCount && ctx.bulkCount > 1 ? ` (${ctx.bulkCount})` : ''
  const del: TaskMenuEntry = { key: 'delete', label: `Delete${n}`, hint: 'Undo 6s', destructive: true }
  if (task.status === 'done' || task.completed_at) return [{ key: 'reopen', label: 'Reopen' }, del]
  return [
    { key: 'tomorrow', label: `Tomorrow${n}`, hint: ctx.tomorrowHint },
    { key: 'date', label: `Pick date…${n}`, sub: true },
    ...(ctx.canUnschedule ? [{ key: 'unschedule', label: 'Unschedule' } as const] : []),
    { key: 'project', label: `Move to project…${n}`, hint: ctx.projectName ?? 'None', sub: true },
    { key: 'priority', label: 'Priority', hint: (task.priority && PRIORITY_LABELS[task.priority]) || 'None', sub: true },
    { key: 'repeat', label: 'Repeat', hint: task.recurrence_rule ? (REPEAT_LABELS[task.recurrence_rule] ?? 'Custom') : 'Never', sub: true },
    { key: 'remind', label: 'Remind', hint: task.reminder_at ? cairoTimeKey(new Date(task.reminder_at)) : 'Off', sub: true },
    { key: 'top3', label: task.top3 ? 'Remove from Top 3' : 'Add to Top 3' },
    ...(ctx.canSelect ? [{ key: 'select', label: ctx.selected ? 'Deselect' : 'Select', hint: 'or hold a row' } as const] : []),
    del,
  ]
}
