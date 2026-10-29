import { birthdayNotice, clock, deliver, digestNotice, eventReminderNotice, inQuietHours, isPaused, kindOn, nudgeNotice, reminderNotice, routineNotice, type Notice, type NoticePrefs } from '../../../../supabase/functions/notify/copy.ts'
import { DEFAULT_AT, dayBounds, minutesOf, ritualOn, shutDownOn, type RitualSettings } from '../../../../supabase/functions/notify/ritual.ts'
import { routineDueOn, type ReminderRoutine, type RoutineDone } from '../../../../supabase/functions/notify/routine.ts'
import { BIRTHDAY_AT, birthdayGroups, type PersonFacts, type Spoke } from '../../../../supabase/functions/notify/birthday.ts'
import { isOverdue, todaysTop3 } from '../../../../supabase/functions/_shared/today.ts'
import { addDays, dateKey, wallToInstant } from '../../../../supabase/functions/_shared/zone.ts'
import { eventRemindersDue, type RemindRow } from '../../../../supabase/functions/_shared/eventReminder.ts'
import { ruleBetween } from '../calendar/series'
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
// reminders notify/routine.ts's, birthdays notify/birthday.ts's (2026-10-12), event reminders
// _shared/eventReminder.ts's (0077).
// Pure, so the same rules (kind switches, pause, quiet hours, lock-screen names) are tested here.

export interface PlanTask {
  id: string
  title: string
  status: string
  due_at: string | null
  reminder_at: string | null
  /** A snoozed reminder's one more (0082, "In 10 min" / "In 1 hour"). */
  remind_again_at?: string | null
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

/** A calendar_events row as the cache holds it — a repeating one is its series row (0061). */
export type PlanEvent = RemindRow & { title: string }

export interface PlanInput {
  tasks: readonly PlanTask[]
  /** Calendar rows; the ones with `remind_min` remind before each start (0077). */
  events?: readonly PlanEvent[]
  projects?: readonly { id: string; name: string }[]
  /** Routines with a reminder time (routines.clock_time) and their check-offs. */
  routines?: readonly ReminderRoutine[]
  completions?: readonly RoutineDone[]
  /** People (their Birthday fact) and the interactions logged with them ("Last spoke 12 days ago"). */
  people?: readonly PersonFacts[]
  interactions?: readonly Spoke[]
  /** The `ritual.finished` rows this device holds (rituals/api useRitualFinishedRows): once Shut down
   * is done on a loop day, that day's evening nudge stays quiet, as notify's does (ritual.ts shutDownOn). */
  finished?: readonly { payload: unknown }[]
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

export function localPlan({ tasks, events = [], projects = [], routines = [], completions = [], people = [], interactions = [], finished = [], prefs, from, to, now, zone }: PlanInput): Planned[] {
  const out: Planned[] = []
  const add = (key: string, at: Date, build: (said: Date) => Notice | null) => {
    const said = new Date(Math.max(at.getTime(), now.getTime()))
    const n = build(said)
    const shown = n && deliver(n, prefs, said, zone)
    if (shown) out.push({ key, at, notice: shown })
  }
  const live = tasks.filter((t) => !t.deleted_at)

  // Task reminders: the ones due at the same moment are one grouped notice (copy.ts). A snoozed one
  // (0082 remind_again_at) is a reminder at that moment too — keyed by it, so it shows once more.
  const groups = new Map<number, PlanTask[]>()
  const again = live.flatMap((t) => (t.remind_again_at ? [{ ...t, reminder_at: t.remind_again_at }] : []))
  for (const t of [...dueReminders(live, from, to), ...dueReminders(again, from, to)]) {
    const at = Date.parse(t.reminder_at!)
    groups.set(at, [...(groups.get(at) ?? []), t])
  }
  for (const [at, group] of groups) {
    const rows = group.map((t) => ({ id: t.id, title: t.title, due_at: t.due_at, project: projects.find((p) => p.id === t.project_id)?.name ?? null }))
    // All snoozed ones coming back: the pack's "snoozed again" sound (notifications/sounds.ts).
    const snoozed = group.every((t) => t.reminder_at === t.remind_again_at)
    add(group.map((t) => `${t.id}@${t.reminder_at}`).join(','), new Date(at), (said) => ({ ...reminderNotice(rows, prefs, said, zone), ...(snoozed ? { again: true } : {}) }))
  }

  // Event reminders (0077): every occurrence, at its start minus remind_min — notify's rule. Several at
  // one moment are one notice.
  const eventGroups = new Map<number, PlanEvent[]>()
  for (const d of eventRemindersDue(events, from, to, zone, ruleBetween)) eventGroups.set(d.at.getTime(), [...(eventGroups.get(d.at.getTime()) ?? []), d.event])
  for (const [at, group] of eventGroups) {
    add(`event:${group.map((e) => e.id).join(',')}@${new Date(at).toISOString()}`, new Date(at), (said) => eventReminderNotice(group, prefs, said, zone))
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

  // Birthdays at 08:00 on the user's clock (12j): the day's, and a week ahead (P7 7b) — notify's groups,
  // as this device last synced its people.
  for (const at of wallTimes(BIRTHDAY_AT, from, to, zone)) {
    for (const g of birthdayGroups(people, interactions, dateKey(at, zone), zone)) {
      add(`birthday${g.inDays ? '-soon' : ''}:${g.people.map((b) => b.id).join(',')}@${at.toISOString()}`, at, () => birthdayNotice(g.people, prefs, g.inDays))
    }
  }

  // The morning digest and the evening nudge, at the user's own times (Settings → Notifications).
  for (const kind of ['morning_digest', 'evening_nudge'] as const) {
    if (!ritualOn(kind, prefs)) continue
    const min = minutesOf(prefs?.[`${kind}_at`]) ?? DEFAULT_AT[kind]
    for (const at of wallTimes(min, from, to, zone)) {
      add(`${kind}@${at.toISOString()}`, at, () => {
        // That morning's Top 3 (goal first) and overdue count, notify's rules (_shared/today.ts).
        if (kind === 'morning_digest') return digestNotice(todaysTop3(live, at, zone).map((t) => t.title), prefs, live.filter((t) => isOverdue(t, at, zone)).length)
        // Shut down already walked on that loop day: no nudge (A29, notify's rule).
        if (shutDownOn(finished, at, zone)) return null
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

export type DeviceChannel = 'windows' | 'mac' | 'android' | 'web'
/** The OS / browser permission here. 'unsupported' = no way to show one at all (a browser without push). */
export type DevicePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface DeviceState {
  channel: DeviceChannel
  permission: DevicePermission
  /** Web only: this browser's push subscription is stored for the account. */
  subscribed: boolean
  /** Web on an iPhone/iPad: permission lives in the system's Settings, not the browser's. */
  ios?: boolean
  /** Android: exact alarms allowed ("Alarms & reminders"). */
  exact?: boolean
  /** Android: battery optimisation off for the app; undefined = this APK can't tell. */
  background?: boolean
}

/** Plain lines, worst first; empty = nothing in the way that this app can see. */
export function blockers(d: DeviceState, p: NoticePrefs | null | undefined, now: Date, zone: string): string[] {
  const out: string[] = []
  if (d.permission === 'unsupported') out.push('No delivery channel on this device — this browser can’t receive push notifications.')
  else if (d.permission === 'denied')
    out.push(
      d.channel === 'android'
        ? 'Permission denied — turn notifications on for Kai’s Flow in Android Settings → Apps → Kai’s Flow → Notifications.'
        : d.ios
          ? 'Permission denied — turn notifications on in the iPhone’s Settings → Notifications → Kai’s Flow.'
          : 'Permission denied — allow notifications for this site in the browser’s site settings.',
    )
  else if (d.permission === 'prompt') out.push('Notifications aren’t allowed yet — the test will ask.')
  if (d.channel === 'android' && d.permission === 'granted') {
    if (d.exact === false) out.push('Alarms & reminders is off — reminders can come a few minutes late. Turn it on under This phone.')
    if (d.background === false) out.push('Battery saving can hold reminders while the app is closed — let it run in the background under This phone.')
  }
  if (d.channel === 'web' && d.permission !== 'unsupported' && !d.subscribed) out.push('This device isn’t subscribed — tap “Subscribe this device” first.')
  if (isPaused(p, now)) out.push(`Notifications are paused until ${clock(p!.notify_paused_until!, zone)}.`)
  if (inQuietHours(p, now, zone)) out.push('Quiet hours are on — notifications come without a sound.')
  // Kinds turned off that start on — Birthday starting off (12i) isn't something in the way.
  const off = KIND_IDS.filter((k) => !kindOn(k, p) && kindOn(k, null)).map((k) => KIND_LOOK[k].label)
  if (off.length) out.push(`Turned off: ${off.join(', ')}.`)
  return out
}
