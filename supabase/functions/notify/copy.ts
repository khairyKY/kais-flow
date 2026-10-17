// One notification language everywhere (design-export/Tray and Notifications.dc.html 12k): the title,
// body, actions and sound of every kind, and who gets one at all. Pure — no Deno APIs — so `notify`
// builds its Web Push payloads from it, the app builds its local toasts (focus done, reminders in
// the Windows app) and its history rows from it, and app/src/features/notifications/copy.test.ts
// runs it under the app's vitest (the ritual.ts pattern).
import { minutesOf, RITUAL_ZONE, wallMinutes } from './ritual.ts'
import { dateKey } from '../_shared/zone.ts'

export type NoticeKind = 'task_reminder' | 'event_reminder' | 'routine' | 'morning_digest' | 'evening_nudge' | 'focus_done' | 'paper_ready' | 'birthday' | 'sync_problem' | 'test'

export interface NoticeAction {
  action: 'done' | 'tomorrow' | 'plan' | 'open' | 'shutdown' | 'break' | 'keep' | 'review' | 'snooze10' | 'snooze60'
  title: string
}

/** Exactly what the service worker shows (app/public/sw-push.js) and what a toast says. */
export interface Notice {
  kind: NoticeKind
  title: string
  body: string
  /** A newer notice with the same tag replaces the older one instead of stacking. */
  tag: string
  /** In order of likelihood: Chrome shows the first two, Android three, a Windows toast four. */
  actions: NoticeAction[]
  /** Where a click on the notification itself lands. */
  url: string
  /** Silent by default: the digest (12k). Quiet hours make everything silent. */
  silent: boolean
  /** The tasks Done / Tomorrow act on; for Review (paper ready), the capture. */
  taskIds: string[]
}

/** The app_settings columns notify reads (0045 + 0048). Absent/null = the column default. */
export interface NoticePrefs {
  task_reminder_on?: boolean | null
  /** Event reminders (0077). */
  event_reminder_on?: boolean | null
  /** Routine reminders (0062). */
  routine_on?: boolean | null
  morning_digest_on?: boolean | null
  evening_nudge_on?: boolean | null
  focus_done_on?: boolean | null
  /** Paper capture ready, Birthday, Sync problem (0065). Birthday is off until turned on (12i). */
  paper_ready_on?: boolean | null
  birthday_on?: boolean | null
  sync_problem_on?: boolean | null
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
  event_reminder: 'event_reminder_on',
  routine: 'routine_on',
  morning_digest: 'morning_digest_on',
  evening_nudge: 'evening_nudge_on',
  focus_done: 'focus_done_on',
  paper_ready: 'paper_ready_on',
  birthday: 'birthday_on',
  sync_problem: 'sync_problem_on',
}

/** 12i draws Birthday's switch off; every other kind starts on (the 0065 column defaults). */
const OFF_UNTIL_ASKED: readonly NoticeKind[] = ['birthday']

/** The kind's own switch (Settings → Notifications → Kinds). Kinds without one are always on; an
 * unset switch (no settings row yet) is the kind's default. */
export function kindOn(kind: NoticeKind, p: NoticePrefs | null | undefined): boolean {
  const key = TOGGLE[kind]
  if (!key) return true
  const v = p?.[key]
  return v == null ? !OFF_UNTIL_ASKED.includes(kind) : v !== false
}

export function isPaused(p: NoticePrefs | null | undefined, now: Date): boolean {
  return !!p?.notify_paused_until && new Date(p.notify_paused_until).getTime() > now.getTime()
}

/** Inside quiet hours (on by default, 22:30–07:00 on the user's wall clock — `zone`, their
 * app_settings.timezone; the window may cross midnight). */
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

/** Task reminder: "Call the tyre supplier · in 10 min" / "09:50 · Car" · Done · In 10 min · In 1 hour ·
 * Tomorrow (snooze, Kai 2026-10-17: the reminder again later — 0082 remind_again_at — the task stays put).
 * Several at once are one grouped notice ("3 reminders"). Private (lock-screen names off): "A reminder". */
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
        { action: 'snooze10', title: 'In 10 min' },
        { action: 'snooze60', title: 'In 1 hour' },
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
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'snooze10', title: 'In 10 min' },
      { action: 'snooze60', title: 'In 1 hour' },
    ],
    url: '/today',
    silent: false,
    taskIds,
  }
}

export interface ReminderEvent {
  /** An occurrence's id (`<row id>::<start>`) or the one-off's. */
  id: string
  title: string
  starts_at: string
  ends_at: string
}

/** Event reminder (0077, A12): "Gym · in 15 min" / "18:00–19:30" · Open (the calendar on that day).
 * Several at once are one notice ("2 events"). Private (lock-screen names off): "An event · in 15 min". */
export function eventReminderNotice(events: readonly ReminderEvent[], p: NoticePrefs | null | undefined, now: Date, zone: string = RITUAL_ZONE): Notice {
  const names = showNames(p)
  const day = `/calendar?date=${dateKey(new Date(events[0].starts_at), zone)}`
  if (events.length === 1) {
    const [e] = events
    return {
      kind: 'event_reminder',
      title: `${names ? e.title : 'An event'} · ${lead(e.starts_at, now, zone)}`,
      body: names ? `${clock(e.starts_at, zone)}–${clock(e.ends_at, zone)}` : 'Unlock to see it',
      tag: `event-${e.id}`,
      actions: [{ action: 'open', title: 'Open' }],
      url: day,
      silent: false,
      taskIds: [],
    }
  }
  const shown = events.slice(0, 3).map((e) => e.title).join(' · ')
  return {
    kind: 'event_reminder',
    title: `${events.length} events`,
    body: names ? (events.length > 3 ? `${shown} · +${events.length - 3} more` : shown) : 'Unlock to see them',
    tag: 'events',
    actions: [{ action: 'open', title: 'Open' }],
    url: day,
    silent: false,
    taskIds: [],
  }
}

/** Morning digest: "Good morning — 3 to tend today" / "✶ GCI homework 1 — NumPy, then the lecture 2
 * survey and Skim OS lectures 1 + 2." · Plan my day · Open. Silent by default. `top3` = today's picks,
 * goal first (_shared/today.ts); `overdue` (2026-10-12, in place of the old hourly "Overdue" push) adds
 * "4 overdue." — a count, never a name. */
export function digestNotice(top3: readonly string[], p: NoticePrefs | null | undefined, overdue = 0): Notice {
  const [goal, ...rest] = top3
  const said = !goal
    ? 'Nothing picked yet — plan the day.'
    : showNames(p)
      ? `✶ ${goal}${rest.length ? `, then ${rest.join(' and ')}` : ''}.`
      : 'Unlock to see them'
  const body = overdue > 0 ? `${said.endsWith('.') ? said : `${said}.`} ${overdue} overdue.` : said
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

export interface ReminderRoutineCopy {
  id: string
  name: string
  /** 'HH:MM' or Postgres's 'HH:MM:SS'. */
  clock_time: string
}

/** Routine reminder (0062): "Stretch — 07:30" · Open. Several at once are one notice ("2 routines —
 * 07:30" / "Stretch · Journal"). Private (lock-screen names off): "A routine — 07:30". */
export function routineNotice(routines: readonly ReminderRoutineCopy[], p: NoticePrefs | null | undefined): Notice {
  const names = showNames(p)
  const at = routines[0].clock_time.slice(0, 5)
  const one = routines.length === 1
  const shown = routines.slice(0, 3).map((r) => r.name).join(' · ') + (routines.length > 3 ? ` · +${routines.length - 3} more` : '')
  return {
    kind: 'routine',
    title: `${one ? (names ? routines[0].name : 'A routine') : `${routines.length} routines`} — ${at}`,
    body: one ? (names ? '' : 'Unlock to see it') : names ? shown : 'Unlock to see them',
    tag: one ? `routine-${routines[0].id}` : 'routines',
    actions: [{ action: 'open', title: 'Open' }],
    url: '/routines',
    silent: false,
    taskIds: [],
  }
}

/** A read line below this confidence wants a look — the app's paper/paperMath.ts CHECK_BELOW
 * (copy.test.ts keeps the two equal). */
export const CHECK_BELOW = 0.7

export interface ReadCapture {
  id: string
  /** The page's own title as read ("OS lecture 3"), when it has one. */
  title: string | null
  items: readonly { confidence: number }[]
}

const things = (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`

/** Paper capture ready (12h/12k): "Your page is read — 7 things" / "From “OS lecture 3”. 2 need a
 * quick look." · Review. Silent (Captures). Private: "A page is ready". */
export function paperReadyNotice(c: ReadCapture, p: NoticePrefs | null | undefined): Notice {
  const unsure = c.items.filter((i) => i.confidence < CHECK_BELOW).length
  const body = [c.title ? `From “${c.title}”.` : '', unsure ? `${unsure} ${unsure === 1 ? 'needs' : 'need'} a quick look.` : ''].filter(Boolean).join(' ')
  const names = showNames(p)
  return {
    kind: 'paper_ready',
    title: names ? `Your page is read — ${things(c.items.length)}` : 'A page is ready',
    body: names ? body : 'Unlock to see it',
    tag: `paper-${c.id}`,
    actions: [{ action: 'review', title: 'Review' }],
    url: '/inbox',
    silent: true,
    taskIds: [c.id],
  }
}

export interface BirthdayPerson {
  id: string
  name: string
  /** Days since the last interaction logged with them; null = none. */
  lastSpokeDays: number | null
}

const lastSpoke = (d: number | null) => (d === null ? '' : d === 0 ? 'Last spoke today.' : d === 1 ? 'Last spoke yesterday.' : `Last spoke ${d} days ago.`)

/** Birthday (12k): "Omar’s birthday is today" / "Last spoke 12 days ago." · Open Omar. Silent
 * (People). Several on one day are one notice ("2 birthdays today"). Private: "A birthday" — and the
 * button says Open, never the name. `inDays` 7 = the week-ahead heads-up (P7 7b): "… is in a week". */
export function birthdayNotice(people: readonly BirthdayPerson[], p: NoticePrefs | null | undefined, inDays = 0): Notice {
  const names = showNames(p)
  const when = inDays ? 'in a week' : 'today'
  const soon = inDays ? '-soon' : ''
  if (people.length === 1) {
    const [b] = people
    return {
      kind: 'birthday',
      title: names ? `${b.name}’s birthday is ${when}` : inDays ? `A birthday ${when}` : 'A birthday',
      body: names ? lastSpoke(b.lastSpokeDays) : 'Unlock to see it',
      tag: `birthday${soon}-${b.id}`,
      actions: [{ action: 'open', title: names ? `Open ${b.name}` : 'Open' }],
      url: `/people/${b.id}`,
      silent: true,
      taskIds: [],
    }
  }
  const shown = people.slice(0, 3).map((b) => b.name).join(' · ') + (people.length > 3 ? ` · +${people.length - 3} more` : '')
  return {
    kind: 'birthday',
    title: `${people.length} birthdays ${when}`,
    body: names ? shown : 'Unlock to see them',
    tag: `birthdays${soon}`,
    actions: [{ action: 'open', title: 'Open' }],
    url: '/people',
    silent: true,
    taskIds: [],
  }
}

/** Sync problem (12k, this device only): "2 changes are waiting to sync" / "They’re safe on this
 * device. We’ll keep trying." · Open. Silent (Sync). No names in it, so nothing to hide. `parked` =
 * the server set them aside (outbox dead letters): nothing retries those, so it says what the app's
 * own toast says (lib/outbox.ts) rather than "we’ll keep trying". */
export function syncNotice(n: number, parked = false): Notice {
  const one = n === 1
  return {
    kind: 'sync_problem',
    title: parked ? `${n} ${one ? 'change' : 'changes'} couldn’t be saved` : `${n} ${one ? 'change is' : 'changes are'} waiting to sync`,
    body: parked ? 'Set aside so the rest sync on.' : `${one ? 'It’s' : 'They’re'} safe on this device. We’ll keep trying.`,
    tag: 'sync-problem',
    actions: [{ action: 'open', title: 'Open' }],
    url: '/today',
    silent: true,
    taskIds: [],
  }
}

export function testNotice(): Notice {
  return {
    kind: 'test',
    title: 'Kai’s Flow',
    body: 'Test notification — this device can show them.',
    tag: 'test',
    actions: [],
    url: '/settings',
    silent: false,
    taskIds: [],
  }
}
