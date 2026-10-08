import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { Notice } from '../../../../supabase/functions/notify/copy.ts'
import type { DevicePermission, Planned } from './plan'

// The Android app's notifications (notify-fix, 2026-10-08). Its WebView has no Web Push and no
// Notification API, so before this nothing the app promised could reach the phone. Now: Android's
// own notifications (@capacitor/local-notifications) — shown now (the test, focus done) or scheduled
// with the OS from plan.ts, so a reminder arrives with the app closed. ponytail: they're planned from
// what the phone last synced, a few days ahead; a task added on the PC reaches the phone's schedule
// the next time the app opens (server push to the APK = FCM, still on the "later" list).

/** Android channels, one per kind's KIND_LOOK.channel, plus Quiet for silent ones (the digest, quiet hours). */
const CHANNELS = [
  { id: 'reminders', name: 'Reminders', importance: 4 },
  { id: 'rituals', name: 'Rituals', importance: 3 },
  { id: 'focus', name: 'Focus', importance: 4 },
  { id: 'quiet', name: 'Quiet', importance: 2, description: 'Without a sound: the morning digest, and everything in quiet hours' },
] as const

const CHANNEL_OF: Partial<Record<Notice['kind'], string>> = { task_reminder: 'reminders', morning_digest: 'rituals', evening_nudge: 'rituals', focus_done: 'focus' }

export function channelFor(n: Notice): string {
  return n.silent ? 'quiet' : (CHANNEL_OF[n.kind] ?? 'reminders')
}

/** A stable positive 31-bit id per key, so planning the same notice again replaces it. */
export function notificationId(key: string): number {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) | 0
  return (h & 0x7fffffff) || 1
}

/** The button pair a notice uses, as an Android action type (registered before it's posted). */
const actionTypeOf = (n: Notice) => n.actions.map((a) => `${a.action}:${a.title}`).join('|')

export function toAndroid(n: Notice, id: number, at?: Date, exact = true): LocalNotificationSchema {
  return {
    id,
    title: n.title,
    body: n.body,
    channelId: channelFor(n),
    smallIcon: 'ic_stat_kf',
    iconColor: '#9C5139',
    ...(n.actions.length ? { actionTypeId: actionTypeOf(n) } : {}),
    extra: { kind: n.kind, url: n.url, taskIds: n.taskIds },
    ...(at ? { schedule: { at, allowWhileIdle: true }, isExactNotification: exact } : {}),
  }
}

let ready: Promise<void> | null = null
/** Channels and button types: idempotent on Android, done once a run. */
function prepare(): Promise<void> {
  return (ready ??= (async () => {
    for (const c of CHANNELS) await LocalNotifications.createChannel({ ...c, visibility: 0, vibration: c.importance >= 3 })
  })().catch((e) => {
    ready = null
    throw e
  }))
}

async function registerTypes(notices: readonly Notice[]): Promise<void> {
  const types = new Map<string, Notice['actions']>()
  for (const n of notices) if (n.actions.length) types.set(actionTypeOf(n), n.actions)
  if (types.size === 0) return
  await LocalNotifications.registerActionTypes({
    types: [...types].map(([id, actions]) => ({ id, actions: actions.map((a) => ({ id: a.action, title: a.title })) })),
  })
}

export async function androidPermission(ask = false): Promise<DevicePermission> {
  try {
    let { display } = await LocalNotifications.checkPermissions()
    if (ask && display !== 'granted' && display !== 'denied') ({ display } = await LocalNotifications.requestPermissions())
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'unsupported'
  }
}

/** Shown now (the test, focus done). */
export async function showAndroid(n: Notice): Promise<void> {
  if ((await androidPermission()) !== 'granted') return
  await prepare()
  await registerTypes([n])
  await LocalNotifications.schedule({ notifications: [toAndroid(n, notificationId(n.tag))] })
}

let queue: Promise<void> = Promise.resolve()
/** Replaces everything this app has scheduled with `plan`. One at a time, in order. */
export function scheduleAndroid(plan: readonly Planned[]): Promise<void> {
  queue = queue.then(async () => {
    if ((await androidPermission()) !== 'granted') return
    await prepare()
    // Without the exact-alarm permission, asking for exact makes the plugin open a Settings screen
    // on every schedule — so inexact then (Android may hold it a few minutes in Doze).
    const exact = await LocalNotifications.checkExactNotificationSetting().then((s) => s.exact_alarm === 'granted', () => false)
    const { notifications: pending } = await LocalNotifications.getPending()
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((p) => ({ id: p.id })) })
    if (plan.length === 0) return
    await registerTypes(plan.map((p) => p.notice))
    await LocalNotifications.schedule({ notifications: plan.map((p) => toAndroid(p.notice, notificationId(p.key), p.at, exact)) })
  }).catch(() => {
    /* the next change plans again */
  })
  return queue
}

/** A tap on an Android notification (or one of its buttons) → the same handler a push uses. */
export function onAndroidAction(run: (action: string, payload: { kind?: string; url?: string; taskIds?: string[] }) => void): () => void {
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const extra = (e.notification.extra ?? {}) as { kind?: string; url?: string; taskIds?: string[] }
    run(e.actionId === 'tap' ? 'open' : e.actionId, extra)
  })
  return () => void handle.then((h) => h.remove())
}
