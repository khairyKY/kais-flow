import { clock, deliver, digestNotice, inQuietHours, isPaused, kindOn, nudgeNotice, reminderNotice, type Notice, type NoticePrefs } from '../../../../supabase/functions/notify/copy.ts'
import { DEFAULT_AT, dayBounds, minutesOf, ritualOn, type RitualSettings } from '../../../../supabase/functions/notify/ritual.ts'
import { dueReminders } from '../tray/trayState'
import { KIND_IDS, KIND_LOOK } from './kinds'

// Notifications a device shows by itself (notify-fix, 2026-10-08). Web Push only reaches a browser
// or an installed PWA; the Windows app (WebView2) and the Android app (Capacitor WebView) have no
// push at all, so the server's reminders and rituals never reached Kai's PC or phone. Both shells
// now work out the same notices from the data they already hold, in the words notify/copy.ts uses:
//  - Windows (TrayBridge): every 30s, what came due since the last sweep → a toast (tray.rs).
//  - Android (android.ts): the next few days, handed to the OS as scheduled notifications, so they
//    arrive with the app closed. Re-planned whenever the data changes while the app runs.
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
  prefs: PlanPrefs | null | undefined
  /** The window: notices whose moment falls in (from, to]. */
  from: Date
  to: Date
  /** The real clock. A notice shown late (the Windows sweep) is worded and judged at `now`. */
  now: Date
  zone: string
}

/** The instants in (from, to] at `min` minutes past midnight on `zone`'s wall clock (dayBounds' DST caveat). */
function wallTimes(min: number, from: Date, to: Date, zone: string): Date[] {
  const out: Date[] = []
  for (let day = Date.parse(dayBounds(from, zone).start); day <= to.getTime(); day = Date.parse(dayBounds(new Date(day + 36 * 3_600_000), zone).start)) {
    const at = day + min * 60_000
    if (at > from.getTime() && at <= to.getTime()) out.push(new Date(at))
  }
  return out
}

export function localPlan({ tasks, projects = [], prefs, from, to, now, zone }: PlanInput): Planned[] {
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

  // The morning digest and the evening nudge, at the user's own times (Settings → Notifications).
  const top3 = live
    .filter((t) => t.top3 && t.status === 'todo')
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((t) => t.title)
  for (const kind of ['morning_digest', 'evening_nudge'] as const) {
    if (!ritualOn(kind, prefs)) continue
    const min = minutesOf(prefs?.[`${kind}_at`]) ?? DEFAULT_AT[kind]
    for (const at of wallTimes(min, from, to, zone)) {
      add(`${kind}@${at.toISOString()}`, at, () => {
        if (kind === 'morning_digest') return digestNotice(top3, prefs)
        // "4 done · 2 left" for that day, as this device last saw it (notify's evening_nudge rule).
        const day = dayBounds(at, zone)
        const done = live.filter((t) => t.status === 'done' && !!t.completed_at && t.completed_at >= day.start && t.completed_at < day.end).length
        const left = live.filter((t) => t.status === 'todo' && !!t.due_at && Date.parse(t.due_at) < Date.parse(day.end)).length
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
  const off = KIND_IDS.filter((k) => !kindOn(k, p)).map((k) => KIND_LOOK[k].label)
  if (off.length) out.push(`Turned off: ${off.join(', ')}.`)
  return out
}
