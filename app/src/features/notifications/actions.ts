import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { TASK_COLUMNS } from '../../lib/columns'
import { completeTaskWithUndo, moveToTomorrowWithUndo } from '../tasks/api'
import { useFocusStore } from '../focus/focusStore'
import { BUNDLED_VERSION, openWhatsNew } from '../../lib/whatsNew'
import { native } from '../tray/native'
import type { Task } from '../../lib/types'

// What a notification's buttons do (Tray and Notifications.dc.html 12k), wherever they were pressed:
// the service worker (public/sw-push.js — a message, or ?kfAction= on a fresh window), a Windows toast
// (src-tauri tray.rs → window.__kfNotifyAction) or a row in the in-app history (Activity). Every
// write is this window's own outbox write, so it is the signed-in user's, offline-safe and logged.

export interface NotificationAction {
  action: string
  kind?: string | null
  taskIds?: string[]
  url?: string
  /** 'whats-new': the version the toast was about. */
  version?: string
}

/** The action a fresh window was opened for (sw-push.js kfActionUrl), or null. */
export function actionFromSearch(search: string): NotificationAction | null {
  const q = new URLSearchParams(search)
  const action = q.get('kfAction')
  if (!action) return null
  return { action, taskIds: (q.get('kfTasks') ?? '').split(',').filter(Boolean) }
}

/** The same address without the action params, so a reload doesn't run it twice. */
export function withoutAction(path: string, search: string): string {
  const q = new URLSearchParams(search)
  q.delete('kfAction')
  q.delete('kfTasks')
  const rest = q.toString()
  return rest ? `${path}?${rest}` : path
}

/** Rows from the cache, the rest from the server (a cold window may not have loaded tasks yet). */
async function tasksById(ids: readonly string[] = []): Promise<Task[]> {
  const cached = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  const found = cached.filter((t) => ids.includes(t.id))
  const missing = ids.filter((id) => !found.some((t) => t.id === id))
  if (missing.length === 0) return found
  const { data } = await supabase.from('tasks').select(TASK_COLUMNS).in('id', missing)
  return [...found, ...((data ?? []) as unknown as Task[])]
}

export async function runNotificationAction(a: NotificationAction, navigate: (to: string) => void): Promise<void> {
  const focus = useFocusStore.getState()
  switch (a.action) {
    case 'done':
      for (const t of await tasksById(a.taskIds)) if (t.status !== 'done') completeTaskWithUndo(t)
      return
    case 'tomorrow': {
      const open = (await tasksById(a.taskIds)).filter((t) => t.status !== 'done')
      if (open.length) moveToTomorrowWithUndo(open)
      return
    }
    case 'break':
      // The round's end already started the break when breaks auto-start; this makes sure it runs.
      if (focus.mode !== 'break') focus.setMode('break')
      if (!useFocusStore.getState().isRunning) useFocusStore.getState().togglePlay()
      return
    case 'keep':
      focus.setMode('pomodoro') // a fresh round on the same task
      useFocusStore.getState().togglePlay()
      return
    case 'plan':
      navigate('/today?ritual=morning')
      return
    case 'shutdown':
      navigate('/today?ritual=evening')
      return
    case 'whats-new':
      // The Windows "vX is out" toast's button (features/whats-new): bring the window forward, open the sheet.
      void native('tray_open')
      openWhatsNew(a.version ?? BUNDLED_VERSION)
      return
    default:
      navigate(a.url ?? '/today')
  }
}

/** Mounted once in the app shell: notification buttons reach this window from the service worker,
 * a Windows toast, or the address a fresh window was opened at. */
export function installNotificationActions(navigate: (to: string) => void): () => void {
  const run = (a: NotificationAction) => void runNotificationAction(a, navigate)
  const fromUrl = actionFromSearch(location.search)
  if (fromUrl) {
    history.replaceState(history.state, '', withoutAction(location.pathname, location.search))
    run(fromUrl)
  }
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'kf-notification-action') run(e.data as NotificationAction)
  }
  navigator.serviceWorker?.addEventListener('message', onMessage)
  const w = window as unknown as { __kfNotifyAction?: (action: string, payload: Omit<NotificationAction, 'action'>) => void }
  w.__kfNotifyAction = (action, payload) => run({ ...payload, action })
  return () => {
    navigator.serviceWorker?.removeEventListener('message', onMessage)
    delete w.__kfNotifyAction
  }
}
