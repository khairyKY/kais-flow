import { LocalNotifications, type Channel, type Importance, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { Notice } from '../../../../supabase/functions/notify/copy.ts'
import type { DevicePermission, Planned } from './plan'
import { NOTIFY_PACKS, NOTIFY_PACK_LOOK, NOTIFY_SOUNDS, NOTIFY_SOUND_LABEL, notifyPack, soundName, soundOf, type NotifyPack, type NotifySound } from './sounds'

// The Android app's notifications (notify-fix, 2026-10-08). Its WebView has no Web Push and no
// Notification API, so before this nothing the app promised could reach the phone. Now: Android's
// own notifications (@capacitor/local-notifications) — shown now (the test, focus done) or scheduled
// with the OS from plan.ts, so a reminder arrives with the app closed. ponytail: they're planned from
// what the phone last synced, a few days ahead; a task added on the PC reaches the phone's schedule
// the next time the app opens (server push to the APK = FCM, still on the "later" list).

// Channels (notif-sounds, 2026-10-26): a channel's sound is fixed once Android has made it, so each
// sound of the chosen pack is its own channel — kf_<pack>_<sound>, playing res/raw/kf_<pack>_<sound>.wav
// (the Android build copies public/notification-sounds there) — plus Quiet for the silent ones (the
// digest, quiet hours). Switching packs re-plans onto the new pack's channels, then deletes the old ones.
const QUIET = { id: 'quiet', name: 'Quiet', importance: 2, description: 'Without a sound: the morning digest, and everything in quiet hours' } as const
/** Heads-up (4) for what wants you now; the rest default (3). */
const URGENT: readonly NotifySound[] = ['task_reminder', 'event_reminder', 'snoozed_again', 'focus_end', 'break_end']
/** The channels before the packs (and the old packs' own): deleted once the chosen pack's exist. */
const LEGACY_CHANNELS = ['reminders', 'rituals', 'focus']

export function channelsFor(pack: NotifyPack): (Channel & { importance: Importance })[] {
  return [
    ...NOTIFY_SOUNDS.map((s) => ({
      id: soundName(pack, s),
      name: `${NOTIFY_SOUND_LABEL[s]} (${NOTIFY_PACK_LOOK[pack].label})`,
      description: `${NOTIFY_PACK_LOOK[pack].label} sounds — pick another pack in Kai’s Flow: Settings → Notifications & sound`,
      importance: (URGENT.includes(s) ? 4 : 3) as Importance,
      sound: `${soundName(pack, s)}.wav`,
    })),
    QUIET,
  ]
}

/** The channels to delete when `pack` is the one in use: the pre-pack ones and every other pack's.
 * Anything else (Android's own, a plugin's) is left alone. */
export function staleChannels(existing: readonly string[], pack: NotifyPack): string[] {
  const keep = `kf_${pack}_`
  return existing.filter((id) => LEGACY_CHANNELS.includes(id) || (NOTIFY_PACKS.some((p) => id.startsWith(`kf_${p}_`)) && !id.startsWith(keep)))
}

export function channelFor(n: Notice, pack: NotifyPack = notifyPack()): string {
  return n.silent ? QUIET.id : soundName(pack, soundOf(n))
}

/** A stable positive 31-bit id per key, so planning the same notice again replaces it. */
export function notificationId(key: string): number {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) | 0
  return (h & 0x7fffffff) || 1
}

/** The button pair a notice uses, as an Android action type (registered before it's posted). */
const actionTypeOf = (n: Notice) => n.actions.map((a) => `${a.action}:${a.title}`).join('|')

export function toAndroid(n: Notice, id: number, at?: Date, exact = true, pack: NotifyPack = notifyPack()): LocalNotificationSchema {
  return {
    id,
    title: n.title,
    body: n.body,
    channelId: channelFor(n, pack),
    ...(n.silent ? {} : { sound: `${soundName(pack, soundOf(n))}.wav` }), // Android 7, which has no channels
    smallIcon: 'ic_stat_kf',
    iconColor: '#9C5139',
    ...(n.actions.length ? { actionTypeId: actionTypeOf(n) } : {}),
    extra: { kind: n.kind, url: n.url, taskIds: n.taskIds },
    ...(at ? { schedule: { at, allowWhileIdle: true }, isExactNotification: exact } : {}),
  }
}

let ready: { pack: NotifyPack; done: Promise<void> } | null = null
/** The pack's channels: idempotent on Android, done once a run per pack. */
function prepare(pack: NotifyPack): Promise<void> {
  if (ready?.pack === pack) return ready.done
  const done = (async () => {
    for (const c of channelsFor(pack)) await LocalNotifications.createChannel({ ...c, visibility: 0, vibration: c.importance >= 3 })
  })().catch((e) => {
    ready = null
    throw e
  })
  ready = { pack, done }
  return done
}

/** Deletes the channels `pack` doesn't use — after the plan has moved onto its own. */
async function dropStaleChannels(pack: NotifyPack): Promise<void> {
  const { channels } = await LocalNotifications.listChannels()
  for (const id of staleChannels(channels.map((c) => c.id), pack)) await LocalNotifications.deleteChannel({ id })
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
  const pack = notifyPack()
  await prepare(pack)
  await registerTypes([n])
  await LocalNotifications.schedule({ notifications: [toAndroid(n, notificationId(n.tag), undefined, true, pack)] })
}

/** Exact alarms allowed ("Alarms & reminders"; USE_EXACT_ALARM grants it at install on Android 13+). */
export function exactAlarms(): Promise<boolean> {
  return LocalNotifications.checkExactNotificationSetting().then((s) => s.exact_alarm === 'granted', () => false)
}

/** Opens Android's "Alarms & reminders" page for the app (Settings → Notifications → This phone). */
export function openExactAlarmSettings(): Promise<unknown> {
  return LocalNotifications.changeExactNotificationSetting().catch(() => undefined)
}

interface BackgroundBridge {
  backgroundAllowed?: () => boolean
  openBackgroundSettings?: () => void
}
const shell = () => (window as unknown as { KaisFlowShell?: BackgroundBridge }).KaisFlowShell

/** Battery optimisation off for the app (MainActivity Shell.backgroundAllowed). Undefined on an APK
 * from before v1.5.1, which has no such check. Stock Android fires an exact alarm in Doze anyway;
 * Samsung's "sleeping apps", Xiaomi's and others' battery savers don't. */
export function backgroundAllowed(): boolean | undefined {
  try {
    return shell()?.backgroundAllowed?.()
  } catch {
    return undefined
  }
}

export function openBackgroundSettings(): void {
  shell()?.openBackgroundSettings?.()
}

/** Android keeps at most 500 alarms per app; the plan is sorted, so the farthest drop first. */
const MAX_SCHEDULED = 400

let queue: Promise<void> = Promise.resolve()
/** Replaces everything this app has scheduled with `plan`, on `pack`'s channels. One at a time, in order. */
export function scheduleAndroid(plan: readonly Planned[], pack: NotifyPack = notifyPack()): Promise<void> {
  queue = queue.then(async () => {
    if ((await androidPermission()) !== 'granted') return
    await prepare(pack)
    // Without the exact-alarm permission, asking for exact makes the plugin open a Settings screen
    // on every schedule — so inexact then (Android may hold it a few minutes in Doze).
    const exact = await exactAlarms()
    const { notifications: pending } = await LocalNotifications.getPending()
    const next = plan.slice(0, MAX_SCHEDULED).map((p) => toAndroid(p.notice, notificationId(p.key), p.at, exact, pack))
    // The new plan goes in first (a same id replaces its alarm), then whatever it no longer holds is
    // cancelled. It used to cancel everything first: the app swiped away, or put to sleep, between the
    // two steps left the phone with nothing scheduled at all until it was opened again (notif 2026-10-26).
    if (next.length) {
      await registerTypes(plan.map((p) => p.notice))
      await LocalNotifications.schedule({ notifications: next })
    }
    const keep = new Set(next.map((n) => n.id))
    const stale = pending.filter((p) => !keep.has(p.id))
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((p) => ({ id: p.id })) })
    // A pack switch: everything pending now rides the new pack's channels, so the old ones can go.
    await dropStaleChannels(pack)
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
