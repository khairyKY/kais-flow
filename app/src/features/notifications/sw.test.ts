import { describe, expect, it, vi } from 'vitest'
import code from '../../../public/sw-push.js?raw'

// public/sw-push.js, run against a fake service-worker global: what a push shows, and where a
// notification button goes (no keys in the worker — the app does the write).

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1'

function worker(windows: { visibilityState: string; focused?: boolean; postMessage: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[], Notification?: { maxActions: number }, userAgent = CHROME_ANDROID) {
  const listeners: Record<string, (e: unknown) => void> = {}
  const shown: { tag?: string; close: ReturnType<typeof vi.fn> }[] = []
  const pending = new Map<string, string>()
  const self = {
    Notification,
    navigator: { userAgent },
    location: { origin: 'https://kais-flow.example' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    registration: {
      showNotification: vi.fn(async (_title: string, o: { tag?: string }) => void shown.push({ tag: o.tag, close: vi.fn() })),
      getNotifications: vi.fn(async ({ tag }: { tag: string }) => shown.filter((n) => n.tag === tag)),
    },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null) },
  }
  const caches = { open: async () => ({ put: async (k: string, r: Response) => void pending.set(k, await r.text()) }) }
  new Function('self', 'caches', code)(self, caches)
  const fire = async (type: string, e: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...e, waitUntil: (p: Promise<unknown>) => (done = p) })
    await done
  }
  return { self, fire, shown, pending }
}

const reminder = {
  kind: 'task_reminder',
  title: 'Call the tyre supplier · in 10 min',
  body: '09:50 · Car',
  tag: 'reminder-t1',
  actions: [{ action: 'done', title: 'Done' }, { action: 'tomorrow', title: 'Tomorrow' }],
  url: '/tasks?focus=t1',
  silent: false,
  taskIds: ['t1'],
}
const clicked = (data: unknown, action = '') => ({ action, notification: { data, close: vi.fn() } })
const win = (visibilityState = 'hidden') => ({ visibilityState, postMessage: vi.fn(), focus: vi.fn(async () => {}) })

describe('sw-push.js', () => {
  it('shows the notice as sent, with the icon, the monochrome badge and its buttons', async () => {
    const { self, fire } = worker([])
    await fire('push', { data: { json: () => reminder } })
    expect(self.registration.showNotification).toHaveBeenCalledWith('Call the tyre supplier · in 10 min', {
      body: '09:50 · Car',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: 'reminder-t1',
      renotify: true,
      silent: false,
      actions: reminder.actions,
      data: { kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1'] },
    })
  })

  // Snooze (Kai 2026-10-17): a reminder carries Done · In 10 min · In 1 hour · Tomorrow; the worker shows as
  // many as the browser does (Chrome: 2), the likeliest first.
  it('shows as many buttons as the browser has room for', async () => {
    const four = { ...reminder, actions: [{ action: 'done', title: 'Done' }, { action: 'snooze10', title: 'In 10 min' }, { action: 'snooze60', title: 'In 1 hour' }, { action: 'tomorrow', title: 'Tomorrow' }] }
    const chrome = worker([])
    await chrome.fire('push', { data: { json: () => four } })
    expect(chrome.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ actions: four.actions.slice(0, 2) }))
    const roomy = worker([], { maxActions: 3 })
    await roomy.fire('push', { data: { json: () => four } })
    expect(roomy.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ actions: four.actions.slice(0, 3) }))
  })

  it('In 10 min / In 1 hour with the app open: the window does it in the background', async () => {
    const open = win()
    const { fire } = worker([open])
    for (const action of ['snooze10', 'snooze60']) await fire('notificationclick', clicked({ kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1'] }, action))
    expect(open.postMessage.mock.calls.map(([m]) => m.action)).toEqual(['snooze10', 'snooze60'])
    expect(open.focus).not.toHaveBeenCalled()
  })

  // Sound packs (2026-10-26): a window on screen plays the pack's sound and the push goes out silent;
  // a window that can't play (or none on screen) leaves the system's sound.
  it('a window on screen plays the pack’s sound: the notification is silent', async () => {
    const answers = (played: boolean) => ({ ...win('visible'), postMessage: vi.fn((_m: unknown, [port]: MessagePort[]) => port.postMessage(played)) })
    const yes = answers(true)
    const a = worker([yes])
    await a.fire('push', { data: { json: () => ({ ...reminder, again: true }) } })
    expect(yes.postMessage.mock.calls[0][0]).toEqual({ type: 'kf-notification-sound', kind: 'task_reminder', again: true })
    expect(a.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ silent: true, renotify: false }))
    const no = answers(false)
    const b = worker([no])
    await b.fire('push', { data: { json: () => reminder } })
    expect(b.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ silent: false, renotify: true }))
  })

  it('no window on screen, or a silent notice: nothing asked, the system decides', async () => {
    const hidden = win('hidden')
    const a = worker([hidden])
    await a.fire('push', { data: { json: () => reminder } })
    expect(hidden.postMessage).not.toHaveBeenCalled()
    expect(a.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ silent: false }))
    const shown = win('visible')
    const b = worker([shown])
    await b.fire('push', { data: { json: () => ({ ...reminder, silent: true }) } })
    expect(shown.postMessage).not.toHaveBeenCalled()
  })

  it('a silent notice (digest, quiet hours) never renotifies', async () => {
    const { self, fire } = worker([])
    await fire('push', { data: { json: () => ({ ...reminder, silent: true }) } })
    expect(self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ silent: true, renotify: false }))
  })

  it('"Your page is read" is dropped while a window is focused (the results are on screen), shown otherwise', async () => {
    const paper = { kind: 'paper_ready', title: 'Your page is read — 7 things', body: 'From “OS lecture 3”. 2 need a quick look.', tag: 'paper-c1', actions: [{ action: 'review', title: 'Review' }], url: '/inbox', silent: true, taskIds: ['c1'] }
    // In front of you: shown silently (WebKit revokes a subscription whose pushes show nothing) and closed at once.
    const looking = worker([{ ...win('visible'), focused: true }])
    await looking.fire('push', { data: { json: () => paper } })
    expect(looking.self.registration.showNotification).toHaveBeenCalledWith(paper.title, expect.objectContaining({ tag: 'paper-c1', silent: true }))
    expect(looking.shown[0].close).toHaveBeenCalled()
    const away = worker([{ ...win('hidden'), focused: false }])
    await away.fire('push', { data: { json: () => paper } })
    expect(away.self.registration.showNotification).toHaveBeenCalledWith('Your page is read — 7 things', expect.objectContaining({ tag: 'paper-c1', silent: true, renotify: false, data: { kind: 'paper_ready', url: '/inbox', taskIds: ['c1'] } }))
    const focusedReminder = worker([{ ...win('visible'), focused: true }])
    await focusedReminder.fire('push', { data: { json: () => reminder } })
    expect(focusedReminder.self.registration.showNotification).toHaveBeenCalled()
    expect(focusedReminder.shown[0].close).not.toHaveBeenCalled() // only the page read goes again
  })

  it('Review from a closed app: it opens on the Inbox with the capture to open', async () => {
    const { self, fire } = worker([])
    await fire('notificationclick', clicked({ kind: 'paper_ready', url: '/inbox', taskIds: ['c1'] }, 'review'))
    expect(self.clients.openWindow).toHaveBeenCalledWith('/inbox?kfAction=review&kfTasks=c1')
  })

  it('Done with the app open: the window does it, without coming forward', async () => {
    const open = win()
    const { self, fire } = worker([open])
    const n = clicked({ kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1'] }, 'done')
    await fire('notificationclick', n)
    expect(n.notification.close).toHaveBeenCalled()
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'kf-notification-action', action: 'done', kind: 'task_reminder', taskIds: ['t1'], url: '/tasks?focus=t1' })
    expect(open.focus).not.toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('Plan my day with the app open: the window comes forward', async () => {
    const open = win()
    const { fire } = worker([open])
    await fire('notificationclick', clicked({ kind: 'morning_digest', url: '/today', taskIds: [] }, 'plan'))
    expect(open.postMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'plan' }))
    expect(open.focus).toHaveBeenCalled()
  })

  it('no window open: the app opens on the notice’s page with the action to run', async () => {
    const { self, fire } = worker([])
    await fire('notificationclick', clicked({ kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1', 't2'] }, 'tomorrow'))
    expect(self.clients.openWindow).toHaveBeenCalledWith('/tasks?focus=t1&kfAction=tomorrow&kfTasks=t1%2Ct2')
    await fire('notificationclick', clicked({ kind: 'morning_digest', url: '/today', taskIds: [] }))
    expect(self.clients.openWindow).toHaveBeenLastCalledWith('/today')
  })

  // iOS PWA (2026-10-29): Safari shows no buttons, so the tap opens the reminder's own task sheet; Android keeps both.
  it('on an iPhone a single reminder opens its task sheet; Android keeps the list and the buttons', async () => {
    const iphone = worker([], undefined, IPHONE)
    await iphone.fire('push', { data: { json: () => reminder } })
    expect(iphone.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ data: { kind: 'task_reminder', url: '/today?task=t1', taskIds: ['t1'] } }))
    const android = worker([])
    await android.fire('push', { data: { json: () => reminder } })
    expect(android.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ actions: reminder.actions, data: expect.objectContaining({ url: '/tasks?focus=t1' }) }))
    const grouped = worker([], undefined, IPHONE)
    await grouped.fire('push', { data: { json: () => ({ ...reminder, taskIds: ['t1', 't2'], url: '/today' }) } })
    expect(grouped.self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ data: expect.objectContaining({ url: '/today' }) }))
  })

  it('on an iPhone a cold start also leaves the address for the app (WebKit can open it at /)', async () => {
    const { self, fire, pending } = worker([], undefined, IPHONE)
    await fire('notificationclick', clicked({ kind: 'task_reminder', url: '/today?task=t1', taskIds: ['t1'] }))
    expect(self.clients.openWindow).toHaveBeenCalledWith('/today?task=t1')
    expect(JSON.parse(pending.get('/kf-pending-link') ?? '{}').url).toBe('/today?task=t1')
    const android = worker([])
    await android.fire('notificationclick', clicked({ kind: 'morning_digest', url: '/today', taskIds: [] }))
    expect(android.pending.size).toBe(0)
  })
})
