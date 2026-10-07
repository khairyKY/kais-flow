import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import { scheduleTomorrow } from '../../lib/dateShortcuts'
import { dismissInboxItem, fileToTask, useAllInboxItems } from '../inbox/api'
import { completeTask, deleteTask, rescheduleDue, restoreTask, setSomeday, undoCompletion, useTasks } from '../tasks/api'
import type { PlanActions } from '../tasks/PlanMenu'
import { dueChip } from '../tasks/taskSheetMath'
import { cairoTimeKey } from '../calendar/eventTime'
import { doneAction, latestPick, putOffCount, serverSettles } from './rules'
import type { InboxItem, ResurfaceAction, ResurfacedLogRow, Task } from '../../lib/types'

// ── Punch 21: priority-based "Not now" cooldowns ──────────────────────────────────────────
// Defaults per the punchlist (high ~2d / med ~5d / low ~10d); Settings → Resurfacing writes
// per-tier overrides to `kf.resurfaceCooldown.{high,med,low}` (per-device prefs).
const COOLDOWN_DEFAULTS = { high: 2, med: 5, low: 10 } as const
export type CooldownTier = keyof typeof COOLDOWN_DEFAULTS

export function cooldownDays(tier: CooldownTier): number {
  try {
    const raw = Number(localStorage.getItem(`kf.resurfaceCooldown.${tier}`))
    if (Number.isFinite(raw) && raw > 0) return raw
  } catch {
    /* storage unavailable — defaults apply */
  }
  return COOLDOWN_DEFAULTS[tier]
}

/** A task's tier from its priority (1 = !!! → high, 3 → low); unranked tasks and notes: med. */
export const cooldownTier = (task?: Task): CooldownTier => (task?.priority === 1 ? 'high' : task?.priority === 3 ? 'low' : 'med')

// This device's snooze ledger `{entityId: wakeAt ISO}`. Migration 0059 puts the snooze on the
// server (`resurfaced_log.snoozed_until`, honoured by do_resurface); until it's pushed the fetched
// rows have no such key and this ledger is the only record. ponytail: once 0059 is on the server
// everywhere, the ledger and its reads can go.
const SNOOZE_KEY = 'kf.resurfaceSnoozes'

function readSnoozes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function setSnooze(entityId: string, wakeAt: string | null): void {
  const map = readSnoozes()
  if (wakeAt) map[entityId] = wakeAt
  else delete map[entityId]
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map))
  } catch {
    /* storage full — the snooze just won't survive a reload */
  }
}

// `writeRow`'s optimistic update assumes the cache under `[table]` is the raw array, so the array
// is cached as-is and reduced via `select`. `daily-resurface` writes at most one row/day (unique on
// (user_id, shown_on)), so the newest row is today's pick — reading "latest" sidesteps any
// UTC-vs-local date-boundary mismatch between the cron's `current_date` and the client.
function useResurfacedLog<T>(select: (rows: ResurfacedLogRow[]) => T) {
  return useQuery({
    queryKey: ['resurfaced_log'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resurfaced_log').select('*').order('shown_on', { ascending: false })
      if (error) throw error
      return data as ResurfacedLogRow[]
    },
    select,
  })
}

export interface ResurfacePick {
  row: ResurfacedLogRow
  task?: Task
  item?: InboxItem
  putOffs: number
}

/** What the "From a while ago" card shows, or null — Today hides the section then. Null too when
 * the thing is gone, trashed or done since the pick was made (nothing left to decide). */
export function useResurfacePick(): ResurfacePick | null {
  const { data: rows = [] } = useResurfacedLog((r) => r)
  const { data: tasks = [] } = useTasks()
  const { data: items = [] } = useAllInboxItems()
  const row = latestPick(rows, readSnoozes(), Date.now())
  if (!row || row.action !== 'pending') return null
  const putOffs = putOffCount(rows, row.entity_id)
  if (row.entity_type === 'task') {
    const task = tasks.find((t) => t.id === row.entity_id)
    return task && task.status !== 'done' ? { row, task, putOffs } : null
  }
  const item = items.find((i) => i.id === row.entity_id)
  return item && item.status !== 'dismissed' ? { row, item, putOffs } : null
}

/** The one way a pick gets settled: mark the row, log it, one toast whose Undo takes back
 * `undo` (the thing's own writes) and puts the pick back as it was. */
function settle(
  row: ResurfacedLogRow,
  action: ResurfaceAction,
  message: string,
  { undo, extra, payload = {}, event = action }: { undo?: () => void; extra?: Partial<ResurfacedLogRow>; payload?: Record<string, unknown>; event?: string } = {},
): void {
  writeRow('resurfaced_log', { ...row, ...extra, action })
  logActivity(`resurfaced.${event}`, row.entity_type, row.entity_id, payload)
  toastUndo(message, () => {
    undo?.()
    writeRow('resurfaced_log', { ...row })
  })
}

/** Plan…: the shared Plan list's writes for this task (taskActions' rules, through rescheduleDue),
 * each settling the pick with one Undo that takes the plan back too. */
export function planResurfaced(row: ResurfacedLogRow, task: Task): Required<Pick<PlanActions, 'schedule' | 'tomorrow' | 'slot' | 'someday'>> {
  const planned = (message: string, undo: () => void) => settle(row, 'converted', message, { undo, event: 'planned' })
  return {
    schedule: (iso, timed) => planned(`Planned · ${dueChip(iso, new Date())}`, rescheduleDue(task, iso, timed)),
    tomorrow: () => planned('Moved to tomorrow', rescheduleDue(task, scheduleTomorrow())),
    slot: (startsAt, endsAt) => planned(`Planned · ${dueChip(startsAt, new Date())}–${cairoTimeKey(new Date(endsAt))}`, rescheduleDue(task, startsAt, true)),
    someday: () => {
      setSomeday(task, true)
      planned('Parked for someday', () => setSomeday(task, task.someday))
    },
  }
}

/** Done: completes the task (a repeat spawns its next one, as everywhere). */
export function doneResurfaced(row: ResurfacedLogRow, task: Task): void {
  const undo = completeTask(task)
  settle(row, doneAction(row), 'Done', { undo: () => undoCompletion(undo), event: 'done' })
}

/** Let it go: a task goes to Trash; a waiting note is dismissed; a filed note just stops coming
 * back (0059: a let-go pick is never picked again). */
export function letGoResurfaced(row: ResurfacedLogRow, entity: { task?: Task; item?: InboxItem }): void {
  const { task, item } = entity
  if (task) return deleteTask(task, () => settle(row, 'dismissed', 'Moved to Trash', { undo: () => restoreTask(task) }))
  if (item && item.status === 'pending') {
    const prior = { ...item }
    dismissInboxItem(item, true)
    return settle(row, 'dismissed', 'Let go', { undo: () => writeRow('inbox_items', prior) })
  }
  settle(row, 'dismissed', 'Let go')
}

/** Make it a task: files a waiting note as a real task, same as Inbox triage. Undo trashes the
 * task and puts the note back. */
export function convertResurfaced(row: ResurfacedLogRow, item: InboxItem): void {
  const prior = { ...item }
  const task = fileToTask(item, { silent: true }) // this call site pushes its own Undo below
  settle(row, 'converted', 'Made it a task', {
    undo: () => {
      deleteTask(task)
      writeRow('inbox_items', prior)
    },
  })
}

/** Keep (a filed note, when asked): it's a task already — the pick is settled, nothing else moves. */
export function keepResurfaced(row: ResurfacedLogRow): void {
  settle(row, 'converted', 'Kept', { event: 'kept' })
}

/** Not now: snoozes for `days` (on the row once 0059 is on the server, and on this device). */
export function notNowResurfaced(row: ResurfacedLogRow, days: number): void {
  const wake = new Date(Date.now() + days * 86_400_000).toISOString()
  setSnooze(row.entity_id, wake)
  settle(row, 'review_later', `Back in ${days} day${days === 1 ? '' : 's'}`, {
    undo: () => setSnooze(row.entity_id, null),
    extra: serverSettles(row) ? { snoozed_until: wake } : {},
    payload: { snoozed_days: days },
  })
}
