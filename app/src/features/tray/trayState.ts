import { clock } from '../../../../supabase/functions/notify/copy.ts'

// The tray's look and menu from the app's state (Tray and Notifications.dc.html 12a, 12d). Pure:
// useTrayBridge feeds it, tray.rs draws it.

/** Must match tray.rs STATES / render_tray_icons.mjs. */
export type TrayIconState = 'normal' | 'focus1' | 'focus2' | 'focus3' | 'focus4' | 'needs' | 'offline' | 'quiet'

export interface TrayFocus {
  mode: 'pomodoro' | 'break' | 'stopwatch' | 'garden'
  isRunning: boolean
  secondsLeft: number
  roundMin: number
}

export interface TrayInputs {
  focus: TrayFocus
  /** A reminder fired here and hasn't been looked at. */
  needsYou: boolean
  offline: boolean
  /** Changes still waiting to sync. */
  waiting: number
  /** Quiet hours, or notifications paused. */
  quiet: boolean
}

/** One state at a time; a running focus round shows first (its dot fills by quarters), then what
 * needs you, then changes waiting, then quiet. */
export function trayIconState(i: TrayInputs): TrayIconState {
  const f = i.focus
  if (f.isRunning && f.mode === 'pomodoro') {
    const done = 1 - f.secondsLeft / Math.max(1, f.roundMin * 60)
    return `focus${Math.min(4, Math.max(1, Math.ceil(done * 4)))}` as TrayIconState
  }
  if (i.needsYou) return 'needs'
  if (i.offline || i.waiting > 0) return 'offline'
  if (i.quiet) return 'quiet'
  return 'normal'
}

/** The menu's focus row: "Start focus · 25:00", or "Stop focus · 19 min left" while it runs.
 * ponytail: minutes, not 18:42 — the row changes once a minute instead of every second. */
export function focusMenuLabel(f: TrayFocus): string {
  if (f.isRunning || (f.mode === 'pomodoro' && f.secondsLeft < f.roundMin * 60)) return `Stop focus · ${Math.max(1, Math.ceil(f.secondsLeft / 60))} min left`
  return `Start focus · ${String(f.roundMin).padStart(2, '0')}:00`
}

/** The menu's pause row: "Pause notifications for 1 hour", or "Resume notifications · paused until 10:41". */
export function pauseMenuLabel(pausedUntil: string | null | undefined, now: Date): string {
  return pausedUntil && new Date(pausedUntil).getTime() > now.getTime()
    ? `Resume notifications · paused until ${clock(pausedUntil)}`
    : 'Pause notifications for 1 hour'
}

interface FocusableRow {
  id: string
  project_id: string | null
  status: string
  top3: boolean
  deleted_at?: string | null
}

/** What "Start focus" focuses on from the tray: the task already in the timer, else the day's goal
 * if it's still open, else the first open Top 3 — else none (a plain round). */
export function focusTarget<T extends FocusableRow>(tasks: readonly T[], activeId: string | null, goalId: string | null): T | null {
  const open = (t: T | undefined) => !!t && t.status !== 'done' && !t.deleted_at
  const byId = (id: string | null) => (id ? tasks.find((t) => t.id === id) : undefined)
  const active = byId(activeId)
  if (open(active)) return active!
  const goal = byId(goalId)
  if (open(goal) && goal!.top3) return goal!
  return tasks.find((t) => t.top3 && open(t)) ?? null
}

export interface RemindableRow {
  id: string
  status: string
  reminder_at: string | null
  deleted_at?: string | null
}

/** The reminders that came due in (from, now] — the Windows app's own sweep while it runs (no Web
 * Push in WebView2). The server sweep uses the same 10-minute window, so `from` starts there. */
export function dueReminders<T extends RemindableRow>(tasks: readonly T[], from: Date, now: Date): T[] {
  return tasks.filter((t) => {
    if (t.status !== 'todo' || t.deleted_at || !t.reminder_at) return false
    const at = new Date(t.reminder_at).getTime()
    return at > from.getTime() && at <= now.getTime()
  })
}
