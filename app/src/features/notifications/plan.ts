import { birthdayNotice, clock, deliver, digestNotice, inQuietHours, isPaused, kindOn, nudgeNotice, reminderNotice, routineNotice, type Notice, type NoticePrefs } from '../../../../supabase/functions/notify/copy.ts'
import { DEFAULT_AT, dayBounds, minutesOf, ritualOn, type RitualSettings } from '../../../../supabase/functions/notify/ritual.ts'
import { routineDueOn, type ReminderRoutine, type RoutineDone } from '../../../../supabase/functions/notify/routine.ts'
import { BIRTHDAY_AT, birthdaysOn, type PersonFacts, type Spoke } from '../../../../supabase/functions/notify/birthday.ts'
import { isOverdue, todaysTop3 } from '../../../../supabase/functions/_shared/today.ts'
import { addDays, dateKey, wallToInstant } from '../../../../supabase/functions/_shared/zone.ts'
import { dueReminders } from '../tray/trayState'
import { KIND_IDS, KIND_LOOK } from './kinds'

// Notifications a device shows by itself (notify-fix, 2026-10-08). Web Push only reaches a browser
// or an installed PWA; the Windows app (WebView2) and the Android app (Capacitor WebView) have no
// push at all, so the server's reminders and rituals never reached Kai's PC or phone. Both shells
// now work out the same notices from the data they already hold, in the words notify/copy.ts uses:
//  - Windows (TrayBridge): every 30s, what came due since the last sweep → a toast (tray.rs).
//  - Android (android.ts): the next few days, handed to the OS as scheduled notifications, so they
//    arrive with the app closed. Re-planned whenever the data changes while the app runs.
// The same rules as notify: the digest's Top 3 and overdue count are _shared/today.ts's, routine
// reminders notify/routine.ts's, birthdays notify/birthday.ts's (2026-10-12).
// Pure, so the same rules (kind switches, pause, quiet hours, lock-screen names) are tested here.

export interface PlanTask {
  id: string
  title: string
  status: string
  due_at: string | null
  reminder_at: string | null
  deleted_at?: string | null
  project_id?: string | null
  top3?: boolean
  top3_rank?: number | null
  someday?: boolean
  scheduled_start?: string | null
  completed_at?: string | null
  created_at?: string
}

export type PlanPrefs = NoticePrefs & RitualSettings

export interface Planned {
  /** Stable per notice and moment: a device shows each key once (Windows) / schedules it once (Android). */
  key: string
  at: Date
  notice: Notice
}

export interface PlanInput {
  tasks: readonly PlanTask[]
  projects?: readonly { id: string; name: string }[]
  /** Routines with a reminder time (routines.clock_time) and their check-offs. */
  routines?: readonly ReminderRoutine[]
  completions?: readonly RoutineDone[]
  /** People (their Birthday fact) and the interactions logged with them ("Last spoke 12 days ago"). */
  people?: readonly PersonFacts[]
  interactions?: readonly Spoke[]
  prefs: PlanPrefs | null | undefined
  /** The window: notices whose moment falls in (from, to]. */
  from: Date
  to: Date
  /** The real clock. A notice shown late (the Windows sweep) is worded and judged at `now`. */
  now: Date
  zone: string
}

/** The instants in (from, to] at `min` minutes past midnight on `zone`'s wall clock. */
function wallTimes(min: number, from: Date, to: Date, zone: string): Date[] {
  const out: Date[] = []
  for (let day = dateKey(from, zone); day <= dateKey(to, zone); day = addDays(day, 1)) {
    const at = wallToInstant(day, Math.floor(min / 60), min % 60, zone)
    if (at > from && at <= to) out.push(at)
  }
  return out
}

export function localPlan({ tasks, projects = [], routines = [], completions = [], people = [], interactions = [], prefs, from, to, now, zone }: PlanInput): Planned[] {
  const out: Planned[] = []
  const add = (key: string, at: Date, build: (said: Date) => Notice | null) => {
    const said = new Date(Math.max(at.getTime(), now.getTime()))
    const n = build(said)
    const shown = n && deliver(n, prefs, said, zone)
    if (shown) out.push({ key, at, notice: shown })
  }
  const live = tasks.filter((t) => !t.deleted_at)

  // Task reminders: the ones due at the same moment are one grouped notice (copy.ts).
  const groups = new Map<number, PlanTask[]>()
  for (const t of dueReminders(live, from, to)) {
    const at = Date.parse(t.reminder_at!)
    groups.set(at, [...(groups.get(at) ?? []), t])
  }
  for (const [at, group] of groups) {
    const rows = group.map((t) => ({ id: t.id, title: t.title, due_at: t.due_at, project: projects.find((p) => p.id === t.project_id)?.name ?? null }))
    add(group.map((t) => `${t.id}@${t.reminder_at}`).join(','), new Date(at), (said) => reminderNotice(rows, prefs, said, zone))
  }

  // Routine reminders: at each routine's time, on its days, unless it's checked off by then (as this
  // device last saw it). Routines at the same moment are one notice.
  const routineGroups = new Map<number, ReminderRoutine[]>()
  for (const r of routines) {
    const min = minutesOf(r.clock_time)
    if (min === null) continue
    for (const at of wallTimes(min, from, to, zone)) {
      if (routineDueOn(r, dateKey(at, zone), completions)) routineGroups.set(at.getTime(), [...(routineGroups.get(at.getTime()) ?? []), r])
    }
  }
  for (const [at, group] of routineGroups) {
    add(`routine:${group.map((r) => r.id).join(',')}@${new Date(at).toISOString()}`, new Date(at), () => routineNotice(group as (ReminderRoutine & { clock_time: string })[], prefs))
  }

  // Birthdays at 08:00 on the user's clock (12j), as this device last synced its people.
  for (const at of wallTimes(BIRTHDAY_AT, from, to, zone)) {
    const today = birthdaysOn(people, interactions, dateKey(at, zone), zone)
    if (today.length) add(`birthday:${today.map((b) => b.id).join(',')}@${at.toISOString()}`, at, () => birthdayNotice(today, prefs))
  }

  // The morning digest and the evening nudge, at the user's own times (Settings → Notifications).
  for (const kind of ['morning_digest', 'evening_nudge'] as const) {
    if (!ritualOn(kind, prefs)) continue
    const min = minutesOf(prefs?.[`${kind}_at`]) ?? DEFAULT_AT[kind]
    for (const at of wallTimes(min, from, to, zone)) {
      add(`${kind}@${at.toISOString()}`, at, () => {
        // That morning's Top 3 (goal first) and overdue count, notify's rules (_shared/today.ts).
        if (kind === 'morning_digest') return digestNotice(todaysTop3(live, at, zone).map((t) => t.title), prefs, live.filter((t) => isOverdue(t, at, zone)).length)
        // "4 done · 2 left" for that day, as this device last saw it (notify's evening_nudge rule).
        const day = dayBounds(at, zone)
        const done = live.filter((t) => t.status === 'done' && !!t.completed_at && t.completed_at >= day.start && t.completed_at < day.end).length
        const left = live.filter((t) => t.status === 'todo' && !t.someday && !!t.due_at && Date.parse(t.due_at) < Date.parse(day.end)).length
        return done + left === 0 ? null : nudgeNotice(done, left)
      })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

// ── Settings → Notifications → Send a test notification: what stands between a notice and this screen ──

export type DeviceChannel = 'windows' | 'android' | 'web'
/** The OS / browser permission here. 'unsupported' = no way to show one at all (a browser without push). */
export type DevicePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface DeviceState {
  channel: DeviceChannel
  permission: DevicePermission
  /** Web only: this browser's push subscription is stored for the account. */
  subscribed: boolean
}

/** Plain lines, worst first; empty = nothing in the way that this app can see. */
export function blockers(d: DeviceState, p: NoticePrefs | null | undefined, now: Date, zone: string): string[] {
  const out: string[] = []
  if (d.permission === 'unsupported') out.push('No delivery channel on this device — this browser can’t receive push notifications.')
  else if (d.permission === 'denied')
    out.push(
      d.channel === 'android'
        ? 'Permission denied — turn notifications on for Kai’s Flow in Android Settings → Apps → Kai’s Flow → Notifications.'
        : 'Permission denied — allow notifications for this site in the browser’s site settings.',
    )
  else if (d.permission === 'prompt') out.push('Notifications aren’t allowed yet — the test will ask.')
  if (d.channel === 'web' && d.permission !== 'unsupported' && !d.subscribed) out.push('This device isn’t subscribed — tap “Subscribe this device” first.')
  if (isPaused(p, now)) out.push(`Notifications are paused until ${clock(p!.notify_paused_until!, zone)}.`)
  if (inQuietHours(p, now, zone)) out.push('Quiet hours are on — notifications come without a sound.')
  // Kinds turned off that start on — Birthday starting off (12i) isn't something in the way.
  const off = KIND_IDS.filter((k) => !kindOn(k, p) && kindOn(k, null)).map((k) => KIND_LOOK[k].label)
  if (off.length) out.push(`Turned off: ${off.join(', ')}.`)
  return out
}
