import { deliver, paperReadyNotice, type Notice, type NoticePrefs, type ReadCapture } from '../../../../supabase/functions/notify/copy.ts'
import { isTauri, native } from '../tray/native'
import { isCapacitorShell } from '../../lib/platform'
import { queryClient } from '../../lib/queryClient'
import { appZone } from '../../lib/appZone'
import { writeRow } from '../../lib/outbox'
import { activityRow } from '../../lib/activity'

/** A notification from the app itself (focus done; the test; on Windows the reminders and rituals it
 * plans, plan.ts), in the same words and with the same buttons as a pushed one. Windows: a toast
 * (tray.rs notify_local). Android: the OS's own notification (android.ts). A browser or installed
 * PWA: through the service worker, so its buttons work like a push's (sw-push.js) — when
 * notifications are allowed and a worker is registered; otherwise nothing. */
export async function showLocal(n: Notice): Promise<void> {
  if (isTauri()) {
    await native('notify_local', {
      title: n.title,
      body: n.body,
      actions: n.actions.map((a) => [a.action, a.title]),
      silent: n.silent,
      payload: JSON.stringify({ kind: n.kind, taskIds: n.taskIds, url: n.url }),
    })
    return
  }
  if (isCapacitorShell()) return (await import('./android')).showAndroid(n)
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !navigator.serviceWorker) return
  const registration = await navigator.serviceWorker.getRegistration()
  await registration?.showNotification(n.title, {
    body: n.body,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: n.tag,
    silent: n.silent,
    actions: n.actions,
    data: { kind: n.kind, url: n.url, taskIds: n.taskIds },
  } as NotificationOptions)
}

/** Someone is looking at this window right now (then the app itself is the notification). */
export function lookingHere(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
}

/** This account's Settings → Notifications, as last read. */
export const noticePrefs = () => queryClient.getQueryData(['app_settings']) as NoticePrefs | undefined

/** A local notice for something that happened while nobody was looking — its kind's switch, pause and
 * quiet hours apply (copy.ts deliver). The notice shown, or null. */
export function tellAway(n: Notice): Notice | null {
  if (lookingHere()) return null
  const shown = deliver(n, noticePrefs(), new Date(), appZone())
  if (shown) void showLocal(shown)
  return shown
}

/** Paper capture ready (12k), from features/paper when a read finishes here: the Windows tray, the
 * Android app in the background, a hidden tab. notify says it too (capture-image → notify), for an
 * app that left mid-read; on the web both carry the same tag, so it shows once. */
export function tellPaperRead(c: ReadCapture): void {
  tellAway(paperReadyNotice(c, noticePrefs()))
}

/** Sync problem (12k), from TrayBridge: shown when nobody's looking, and kept in the history (12j) —
 * stamped now, though the row itself may only reach the server once the changes do. */
export function tellSyncProblem(n: Notice): void {
  if (!tellAway(n)) return
  writeRow('activity_log', { ...activityRow('notify.sync_problem', 'notification', crypto.randomUUID(), { title: n.title, body: n.body }), created_at: new Date().toISOString() })
}
