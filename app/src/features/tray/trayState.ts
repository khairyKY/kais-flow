import { clock } from '../../../../supabase/functions/notify/copy.ts'
import { appZone } from '../../lib/appZone'
import { scheduleTomorrow } from '../../lib/dateShortcuts'
import { timeText } from '../calendar/eventTime'
import { isInProgress, upNextEvents, type UpNextEvent } from '../today/upNext'
import type { TrayMenuState } from './menuRows'

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
    ? `Resume notifications · paused until ${clock(pausedUntil, appZone())}`
    : 'Pause notifications for 1 hour'
}

interface FocusableRow {
  id: string
  project_id: string | null
  status: string
  top3: boolean
  deleted_at?: string | null
  /** A paused series (Perennials ‖) rests: no reminder anywhere (the server and MCP skip it too). */
  paused?: boolean | null
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
  /** A paused series (Perennials ‖) rests: no reminder anywhere (the server and MCP skip it too). */
  paused?: boolean | null
}

/** The reminders that came due in (from, now] — the Windows app's own sweep while it runs (no Web
 * Push in WebView2). The server sweep uses the same 10-minute window, so `from` starts there. */
export function dueReminders<T extends RemindableRow>(tasks: readonly T[], from: Date, now: Date): T[] {
  return tasks.filter((t) => {
    if (t.status !== 'todo' || t.deleted_at || t.paused || !t.reminder_at) return false
    const at = new Date(t.reminder_at).getTime()
    return at > from.getTime() && at <= now.getTime()
  })
}

// ── popover B and menu B (Calendar extras options.html §5, Kai's picks "tray B, tray menu B") ──

/** The calendar fields the tray's Now card reads. */
export interface NowEvent extends UpNextEvent {
  title: string
  task_id: string | null
}

/** Popover B's Now card — the options page's card A (§4): an empty day, a clock time when the next is
 * over an hour away, "Up next · in 12m" within the hour, "Ongoing · 15m left" while it runs (two at once:
 * the one ending soonest leads). A task block whose task is done is skipped, as Today does. */
export type TrayNow<E> =
  | { kind: 'none' }
  | { kind: 'far'; event: E }
  | { kind: 'soon'; event: E; inMin: number }
  | { kind: 'on'; event: E; leftMin: number; pct: number; others: number }

const MIN = 60_000
const at = (iso: string) => new Date(iso).getTime()

export function trayNow<E extends NowEvent>(events: readonly E[], taskDone: (id: string) => boolean, now: Date): TrayNow<E> {
  const t = now.getTime()
  const list = upNextEvents(events, now).filter((e) => !(e.task_id && taskDone(e.task_id)))
  const on = list.filter((e) => isInProgress(e.starts_at, e.ends_at, now)).sort((a, b) => at(a.ends_at) - at(b.ends_at))
  if (on.length) {
    const e = on[0]
    const [from, to] = [at(e.starts_at), at(e.ends_at)]
    return { kind: 'on', event: e, leftMin: Math.max(1, Math.ceil((to - t) / MIN)), pct: Math.round(((t - from) / Math.max(1, to - from)) * 100), others: on.length - 1 }
  }
  const next = list[0]
  if (!next) return { kind: 'none' }
  const inMin = Math.max(1, Math.ceil((at(next.starts_at) - t) / MIN))
  return inMin > 60 ? { kind: 'far', event: next } : { kind: 'soon', event: next, inMin }
}

/** "12m", "1h", "1h 10m" — the card's count-down. */
export function minutesText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

/** What the menu page shows that only the main window knows (TrayBridge → tray.rs → the page). */
export function trayMenuState<E extends NowEvent>(n: TrayNow<E>, pausedUntil: string | null | undefined, now: Date): TrayMenuState {
  const paused = !!pausedUntil && at(pausedUntil) > now.getTime()
  return {
    signedIn: true,
    next: n.kind === 'none' ? null : { now: n.kind === 'on', title: n.event.title, at: timeText(new Date(n.kind === 'on' ? n.event.ends_at : n.event.starts_at)) },
    pausedUntil: paused ? timeText(new Date(pausedUntil)) : null,
  }
}

export type PauseChoice = '30' | '60' | 'tomorrow'

/** Menu B's Pause ▸ 30 minutes · 1 hour · Until tomorrow (the app's one Tomorrow, 09:00 on the user's clock). */
export function pauseUntil(choice: PauseChoice, now: Date): string {
  if (choice === 'tomorrow') return scheduleTomorrow(now)
  return new Date(now.getTime() + Number(choice) * MIN).toISOString()
}
