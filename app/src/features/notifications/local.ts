import type { Notice } from '../../../../supabase/functions/notify/copy.ts'
import { isTauri, native } from '../tray/native'

/** A notification from the app itself (focus done; reminders while the Windows app runs), in the same
 * words and with the same buttons as a pushed one. Windows: a toast (tray.rs notify_local). A browser
 * or installed PWA: through the service worker, so its buttons work like a push's (sw-push.js) —
 * when notifications are allowed and a worker is registered; otherwise nothing. */
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
