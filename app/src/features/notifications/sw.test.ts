import { describe, expect, it, vi } from 'vitest'
import code from '../../../public/sw-push.js?raw'

// public/sw-push.js, run against a fake service-worker global: what a push shows, and where a
// notification button goes (no keys in the worker — the app does the write).

function worker(windows: { visibilityState: string; postMessage: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[]) {
  const listeners: Record<string, (e: unknown) => void> = {}
  const self = {
    location: { origin: 'https://kais-flow.example' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null) },
  }
  new Function('self', code)(self)
  const fire = async (type: string, e: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...e, waitUntil: (p: Promise<unknown>) => (done = p) })
    await done
  }
  return { self, fire }
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

  it('a silent notice (digest, quiet hours) never renotifies', async () => {
    const { self, fire } = worker([])
    await fire('push', { data: { json: () => ({ ...reminder, silent: true }) } })
    expect(self.registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ silent: true, renotify: false }))
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
})
