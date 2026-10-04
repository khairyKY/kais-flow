import { beforeEach, describe, expect, it, vi } from 'vitest'

// What a notification's buttons do in the app (Tray and Notifications.dc.html 12k).
const fetched: string[][] = []
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          fetched.push(ids)
          return { data: ids.map((id) => ({ id, title: `server ${id}`, status: 'todo' })) }
        },
      }),
    }),
  },
}))
const cache: { tasks?: unknown[] } = {}
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => cache.tasks } }))
const completeTaskWithUndo = vi.fn()
const moveToTomorrowWithUndo = vi.fn()
vi.mock('../tasks/api', () => ({ completeTaskWithUndo: (t: unknown) => completeTaskWithUndo(t), moveToTomorrowWithUndo: (t: unknown) => moveToTomorrowWithUndo(t) }))
const focus = { mode: 'break', isRunning: true, setMode: vi.fn(), togglePlay: vi.fn() }
vi.mock('../focus/focusStore', () => ({ useFocusStore: { getState: () => focus } }))

const { actionFromSearch, runNotificationAction, withoutAction } = await import('./actions')

describe('notification actions', () => {
  beforeEach(() => {
    fetched.length = 0
    cache.tasks = [{ id: 'a', title: 'Call the tyre supplier', status: 'todo' }, { id: 'd', title: 'Done already', status: 'done' }]
    vi.clearAllMocks()
  })

  it('a fresh window reads its action from the address, then drops it', () => {
    expect(actionFromSearch('?kfAction=done&kfTasks=a,b')).toEqual({ action: 'done', taskIds: ['a', 'b'] })
    expect(actionFromSearch('?focus=a')).toBeNull()
    expect(withoutAction('/tasks', '?focus=a&kfAction=done&kfTasks=a')).toBe('/tasks?focus=a')
    expect(withoutAction('/today', '?kfAction=plan')).toBe('/today')
  })

  it('Done completes the open tasks — cached, else read from the server', async () => {
    await runNotificationAction({ action: 'done', taskIds: ['a', 'd', 'x'] }, vi.fn())
    expect(fetched).toEqual([['x']])
    expect(completeTaskWithUndo.mock.calls.map(([t]) => (t as { id: string }).id)).toEqual(['a', 'x'])
  })

  it('Tomorrow moves the open ones with one undo', async () => {
    await runNotificationAction({ action: 'tomorrow', taskIds: ['a', 'd'] }, vi.fn())
    expect(moveToTomorrowWithUndo).toHaveBeenCalledTimes(1)
    expect((moveToTomorrowWithUndo.mock.calls[0][0] as { id: string }[]).map((t) => t.id)).toEqual(['a'])
  })

  it('the rituals and Open navigate; the focus buttons drive the timer', async () => {
    const nav = vi.fn()
    await runNotificationAction({ action: 'plan' }, nav)
    await runNotificationAction({ action: 'shutdown' }, nav)
    await runNotificationAction({ action: 'open', url: '/tasks?focus=a' }, nav)
    expect(nav.mock.calls.map(([to]) => to)).toEqual(['/today?ritual=morning', '/today?ritual=evening', '/tasks?focus=a'])
    await runNotificationAction({ action: 'break' }, nav)
    expect(focus.setMode).not.toHaveBeenCalled() // already on the break, and it runs
    expect(focus.togglePlay).not.toHaveBeenCalled()
    await runNotificationAction({ action: 'keep' }, nav)
    expect(focus.setMode).toHaveBeenCalledWith('pomodoro')
    expect(focus.togglePlay).toHaveBeenCalledTimes(1)
  })
})
