// One notification language everywhere (design-export/Tray and Notifications.dc.html 12k): the title,
// body, actions and sound of every kind, and who gets one at all. Pure — no Deno APIs — so `notify`
// builds its Web Push payloads from it, the app builds its local toasts (focus done, reminders in
// the Windows app) and its history rows from it, and app/src/features/notifications/copy.test.ts
// runs it under the app's vitest (the ritual.ts pattern).
import { minutesOf, RITUAL_ZONE, wallMinutes } from './ritual.ts'

export type NoticeKind = 'task_reminder' | 'morning_digest' | 'evening_nudge' | 'focus_done' | 'overdue' | 'test'

export interface NoticeAction {
  action: 'done' | 'tomorrow' | 'plan' | 'open' | 'shutdown' | 'break' | 'keep'
  title: string
}

/** Exactly what the service worker shows (app/public/sw-push.js) and what a toast says. */
export interface Notice {
  kind: NoticeKind
  title: string
  body: string
  /** A newer notice with the same tag replaces the older one instead of stacking. */
  tag: string
  /** Up to two (Windows and Chrome show two). The first is the likely one. */
  actions: NoticeAction[]
  /** Where a click on the notification itself lands. */
  url: string
  /** Silent by default: the digest (12k). Quiet hours make everything silent. */
  silent: boolean
  /** The tasks Done / Tomorrow act on. */
  taskIds: string[]
}

/** The app_settings columns notify reads (0045 + 0048). Absent/null = the column default. */
export interface NoticePrefs {
  task_reminder_on?: boolean | null
  morning_digest_on?: boolean | null
  evening_nudge_on?: boolean | null
  focus_done_on?: boolean | null
  quiet_hours_on?: boolean | null
  quiet_from?: string | null
  quiet_to?: string | null
  /** Off (the default) = no task names in anything that can reach a lock screen. */
  lock_screen_names?: boolean | null
  /** The tray's "Pause notifications for 1 hour". */
  notify_paused_until?: string | null
}

export const QUIET_FROM = '22:30'
export const QUIET_TO = '07:00'

const TOGGLE: Partial<Record<NoticeKind, keyof NoticePrefs>> = {
  task_reminder: 'task_reminder_on',
  morning_digest: 'morning_digest_on',
  evening_nudge: 'evening_nudge_on',
  focus_done: 'focus_done_on',
}

/** The kind's own switch (Settings → Notifications → Kinds). Kinds without one are always on. */
export function kindOn(kind: NoticeKind, p: NoticePrefs | null | undefined): boolean {
  const key = TOGGLE[kind]
  return !key || p?.[key] !== false
}

export function isPaused(p: NoticePrefs | null | undefined, now: Date): boolean {
  return !!p?.notify_paused_until && new Date(p.notify_paused_until).getTime() > now.getTime()
}

/** Inside quiet hours (on by default, 22:30–07:00 Cairo wall clock; the window may cross midnight). */
export function inQuietHours(p: NoticePrefs | null | undefined, now: Date, zone: string = RITUAL_ZONE): boolean {
  if (p?.quiet_hours_on === false) return false
  const from = minutesOf(p?.quiet_from) ?? minutesOf(QUIET_FROM)!
  const to = minutesOf(p?.quiet_to) ?? minutesOf(QUIET_TO)!
  const m = wallMinutes(now, zone)
  return from <= to ? m >= from && m < to : m >= from || m < to
}

/** What actually goes out: nothing when the kind is off or notifications are paused; silent in
 * quiet hours ("nothing makes a sound"). A test always goes, as built. */
export function deliver(n: Notice, p: NoticePrefs | null | undefined, now: Date, zone: string = RITUAL_ZONE): Notice | null {
  if (n.kind === 'test') return n
  if (!kindOn(n.kind, p) || isPaused(p, now)) return null
  return inQuietHours(p, now, zone) ? { ...n, silent: true } : n
}

const showNames = (p: NoticePrefs | null | undefined) => p?.lock_screen_names === true

/** "09:50" on `zone`'s wall clock. */
export function clock(iso: string, zone: string = RITUAL_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

export interface ReminderTask {
  id: string
  title: string
  due_at?: string | null
  /** The task's project, when there is one ("09:50 · Car"). */
  project?: string | null
}

/** "in 10 min" before the time, "now" at it, "at 14:00" more than an hour off. */
function lead(dueAt: string, now: Date, zone: string): string {
  const min = Math.round((new Date(dueAt).getTime() - now.getTime()) / 60_000)
  if (min <= 0) return 'now'
  return min < 60 ? `in ${min} min` : `at ${clock(dueAt, zone)}`
}

/** Task reminder: "Call the tyre supplier · in 10 min" / "09:50 · Car" · Done · Tomorrow. Several at
 * once are one grouped notice ("3 reminders"). Private (lock-screen names off): "A reminder". */
export function reminderNotice(tasks: readonly ReminderTask[], p: NoticePrefs | null | undefined, now: Date, zone: string = RITUAL_ZONE): Notice {
  const names = showNames(p)
  const taskIds = tasks.map((t) => t.id)
  if (tasks.length === 1) {
    const t = tasks[0]
    const body = [t.due_at ? clock(t.due_at, zone) : '', t.project ?? ''].filter(Boolean).join(' · ')
    return {
      kind: 'task_reminder',
      title: names ? (t.due_at ? `${t.title} · ${lead(t.due_at, now, zone)}` : t.title) : 'A reminder',
      body: names ? body : 'Unlock to see it',
      tag: `reminder-${t.id}`,
      actions: [
        { action: 'done', title: 'Done' },
        { action: 'tomorrow', title: 'Tomorrow' },
      ],
      url: `/tasks?focus=${t.id}`,
      silent: false,
      taskIds,
    }
  }
  const shown = tasks.slice(0, 3).map((t) => t.title).join(' · ')
  return {
    kind: 'task_reminder',
    title: `${tasks.length} reminders`,
    body: names ? (tasks.length > 3 ? `${shown} · +${tasks.length - 3} more` : shown) : 'Unlock to see them',
    tag: 'reminders',
    actions: [{ action: 'open', title: 'Open' }],
    url: '/today',
    silent: false,
    taskIds,
  }
}

/** Morning digest: "Good morning — 3 to tend today" / "✶ GCI homework 1 — NumPy, then the lecture 2
 * survey and Skim OS lectures 1 + 2." · Plan my day · Open. Silent by default. */
export function digestNotice(top3: readonly string[], p: NoticePrefs | null | undefined): Notice {
  const [goal, ...rest] = top3
  const body = !goal
    ? 'Nothing picked yet — plan the day.'
    : showNames(p)
      ? `✶ ${goal}${rest.length ? `, then ${rest.join(' and ')}` : ''}.`
      : 'Unlock to see them'
  return {
    kind: 'morning_digest',
    title: goal ? `Good morning — ${top3.length} to tend today` : 'Good morning',
    body,
    tag: 'morning-digest',
    actions: [
      { action: 'plan', title: 'Plan my day' },
      { action: 'open', title: 'Open' },
    ],
    url: '/today',
    silent: true,
    taskIds: [],
  }
}

/** Evening nudge: "The garden’s ready to close" / "4 done · 2 left" · Shut down. */
export function nudgeNotice(done: number, left: number): Notice {
  return {
    kind: 'evening_nudge',
    title: 'The garden’s ready to close',
    body: `${done} done · ${left} left`,
    tag: 'evening-nudge',
    actions: [{ action: 'shutdown', title: 'Shut down' }],
    url: '/today?ritual=evening',
    silent: false,
    taskIds: [],
  }
}

/** Focus done: "25 minutes tended ✿" / the task · Break 5 min · Keep going. Local, from the timer. */
export function focusDoneNotice(minutes: number, task: string | null, breakMin: number, p: NoticePrefs | null | undefined): Notice {
  return {
    kind: 'focus_done',
    title: `${minutes} minutes tended ✿`,
    body: task ? (showNames(p) ? task : 'A focus timer') : 'A round well kept',
    tag: 'focus-done',
    actions: [
      { action: 'break', title: `Break ${breakMin} min` },
      { action: 'keep', title: 'Keep going' },
    ],
    url: '/focus',
    silent: false,
    taskIds: [],
  }
}

export function overdueNotice(count: number): Notice {
  return {
    kind: 'overdue',
    title: 'Overdue',
    body: `${count} ${count === 1 ? 'task is' : 'tasks are'} past due`,
    tag: 'overdue',
    actions: [{ action: 'open', title: 'Open' }],
    url: '/tasks',
    silent: true,
    taskIds: [],
  }
}

export function testNotice(): Notice {
  return {
    kind: 'test',
    title: 'Kai’s Flow',
    body: 'Test notification — push is wired up correctly.',
    tag: 'test',
    actions: [],
    url: '/settings',
    silent: false,
    taskIds: [],
  }
}
