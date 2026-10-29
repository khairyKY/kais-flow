// Web Push for Kai's Flow (design-export/Tray and Notifications.dc.html 12h), imported into the
// generated service worker (vite.config.ts workbox.importScripts).
//
// `push`: notify sends a Notice (supabase/functions/notify/copy.ts) — title, body, up to two actions,
// silent or not. Shown as is, with the app icon and the monochrome K badge — except "Your page is
// read" while a window of the app is focused: the read finished in front of you (12k: useful, never noise).
//
// `notificationclick`: no keys and no session here — every write goes through the app itself, so it
// is the signed-in app's own outbox write (RLS, offline-safe, logged):
//  - an open window gets the action as a message (features/notifications/actions.ts). Done,
//    Tomorrow, In 10 min / In 1 hour (a reminder's snooze), Break and Keep going run there without
//    bringing it forward; the rest focus it.
//  - with no window open, the app opens at the notice's page with ?kfAction=…&kfTasks=…, and runs
//    the action once it has loaded.
const KF_BACKGROUND = ['done', 'tomorrow', 'snooze10', 'snooze60', 'break', 'keep']

// iOS PWA (2026-10-29). Safari (iPhone, iPad, Mac) shows no notification buttons — `actions` is ignored — so a tap
// is the only way in: a single reminder opens its own task sheet (Done · Tomorrow · the date) instead of the list.
// Android and Chrome keep their buttons. (Also ignored there: `silent`, `renotify`; quiet hours are the server's.)
const KF_UA = (self.navigator && self.navigator.userAgent) || ''
const KF_NO_BUTTONS = /AppleWebKit/.test(KF_UA) && !/Chrome|Chromium|CriOS|Android|Edg|Firefox|FxiOS/.test(KF_UA)

self.addEventListener('push', (event) => {
  let n = {}
  try {
    n = event.data ? event.data.json() : {}
  } catch {
    n = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(kfShow(n))
})

// The notification sound pack (features/notifications/sounds.ts): a browser can't give a push its own
// sound, so a window of the app on screen plays the pack's and the notification goes out silent. No
// window on screen, or it can't play (no click in it yet) or doesn't answer in 600 ms: the system's sound.
function kfPlayedInApp(win, n) {
  return new Promise((done) => {
    const ch = new MessageChannel()
    const t = setTimeout(() => done(false), 600)
    ch.port1.onmessage = (e) => {
      clearTimeout(t)
      done(e.data === true)
    }
    win.postMessage({ type: 'kf-notification-sound', kind: n.kind || null, again: !!n.again }, [ch.port2])
  })
}

/** Where a tap takes you: the notice's page; on Safari a single reminder's own task sheet (see KF_NO_BUTTONS). */
function kfTapUrl(n) {
  const ids = n.taskIds || []
  return KF_NO_BUTTONS && n.kind === 'task_reminder' && ids.length === 1 ? `/today?task=${encodeURIComponent(ids[0])}` : n.url || '/today'
}

async function kfShow(n) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  // "Your page is read" while the app is in front of you: nothing to say. But every push must show a
  // notification — WebKit revokes a subscription whose pushes show none — so it shows, silently, and goes at once.
  if (n.kind === 'paper_ready' && windows.some((w) => w.focused)) {
    const tag = n.tag || 'kf-paper-ready'
    await self.registration.showNotification(n.title || 'Kai’s Flow', { body: n.body || '', icon: '/icon-192.png', badge: '/badge-96.png', tag, silent: true, data: { kind: n.kind, url: kfTapUrl(n), taskIds: n.taskIds || [] } })
    for (const shown of await self.registration.getNotifications({ tag })) shown.close()
    return
  }
  const onScreen = !n.silent && windows.find((w) => w.visibilityState === 'visible')
  const played = onScreen ? await kfPlayedInApp(onScreen, n) : false
  return self.registration.showNotification(n.title || 'Kai’s Flow', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: n.tag || undefined,
    renotify: !!n.tag && !n.silent && !played,
    silent: !!n.silent || played,
    // As many buttons as this browser shows (Chrome: 2 — a reminder's Done · In 10 min), the likeliest first.
    actions: (n.actions || []).slice(0, (self.Notification && self.Notification.maxActions) || 2),
    data: { kind: n.kind || null, url: kfTapUrl(n), taskIds: n.taskIds || [] },
  })
}

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
  if (!win) {
    const url = kfActionUrl(msg)
    // iOS: a tap that cold-starts the app can land on / instead of this address (WebKit bug 263687). The address
    // waits in Cache Storage too; the app takes it once it starts (features/notifications/actions.ts takePendingLink).
    if (KF_NO_BUTTONS) await caches.open('kf-pending').then((c) => c.put('/kf-pending-link', new Response(JSON.stringify({ url, at: Date.now() })))).catch(() => {})
    return self.clients.openWindow(url)
  }
  win.postMessage(msg)
  if (!KF_BACKGROUND.includes(msg.action) && win.focus) await win.focus()
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(kfNotificationClick(event.notification.data || {}, event.action))
})
