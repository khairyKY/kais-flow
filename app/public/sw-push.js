// Web Push for Kai's Flow (design-export/Tray and Notifications.dc.html 12h), imported into the
// generated service worker (vite.config.ts workbox.importScripts).
//
// `push`: notify sends a Notice (supabase/functions/notify/copy.ts) — title, body, up to two actions,
// silent or not. Shown as is, with the app icon and the monochrome K badge.
//
// `notificationclick`: no keys and no session here — every write goes through the app itself, so it
// is the signed-in app's own outbox write (RLS, offline-safe, logged):
//  - an open window gets the action as a message (features/notifications/actions.ts). Done,
//    Tomorrow, Break and Keep going run there without bringing it forward; the rest focus it.
//  - with no window open, the app opens at the notice's page with ?kfAction=…&kfTasks=…, and runs
//    the action once it has loaded.
const KF_BACKGROUND = ['done', 'tomorrow', 'break', 'keep']

self.addEventListener('push', (event) => {
  let n = {}
  try {
    n = event.data ? event.data.json() : {}
  } catch {
    n = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(n.title || 'Kai’s Flow', {
      body: n.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: n.tag || undefined,
      renotify: !!n.tag && !n.silent,
      silent: !!n.silent,
      actions: (n.actions || []).slice(0, 2),
      data: { kind: n.kind || null, url: n.url || '/today', taskIds: n.taskIds || [] },
    }),
  )
})

/** The page that runs `action` when no window is open: the notice's own page, plus the action. */
function kfActionUrl(msg) {
  const url = new URL(msg.url || '/today', self.location.origin)
  if (msg.action !== 'open') {
    url.searchParams.set('kfAction', msg.action)
    if (msg.taskIds.length) url.searchParams.set('kfTasks', msg.taskIds.join(','))
  }
  return url.pathname + url.search
}

async function kfNotificationClick(data, action) {
  const msg = { type: 'kf-notification-action', action: action || 'open', kind: data.kind || null, taskIds: data.taskIds || [], url: data.url || '/today' }
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const win = windows.find((w) => w.visibilityState === 'visible') || windows[0]
  if (!win) return self.clients.openWindow(kfActionUrl(msg))
  win.postMessage(msg)
  if (!KF_BACKGROUND.includes(msg.action) && win.focus) await win.focus()
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(kfNotificationClick(event.notification.data || {}, event.action))
})
