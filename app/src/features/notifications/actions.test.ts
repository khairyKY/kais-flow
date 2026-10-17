import { beforeEach, describe, expect, it, vi } from 'vitest'

// What a notification's buttons do in the app (Tray and Notifications.dc.html 12k).
const fetched: string[][] = []
const server = { down: false }
const unreviewed = new Set(['c-waiting'])
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({ is: () => ({ maybeSingle: async () => ({ data: unreviewed.has(id) ? { id } : null, error: null }) }) }),
        in: async (_col: string, ids: string[]) => {
          fetched.push(ids)
          if (server.down) return { data: null, error: new Error('Failed to fetch') }
          return { data: ids.map((id) => ({ id, title: `server ${id}`, status: 'todo' })), error: null }
        },
      }),
    }),
  },
}))
const toastAction = vi.fn()
vi.mock('../../lib/undo', () => ({ toastAction: (...a: unknown[]) => toastAction(...a) }))
const cache: { tasks?: unknown[] } = {}
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => cache.tasks } }))
const completeTaskWithUndo = vi.fn()
const moveToTomorrowWithUndo = vi.fn()
const remindAgainWithUndo = vi.fn()
vi.mock('../tasks/api', () => ({
  completeTaskWithUndo: (t: unknown) => completeTaskWithUndo(t),
  moveToTomorrowWithUndo: (t: unknown) => moveToTomorrowWithUndo(t),
  remindAgainWithUndo: (t: unknown, min: number) => remindAgainWithUndo(t, min),
}))
const focus = { mode: 'break', isRunning: true, setMode: vi.fn(), togglePlay: vi.fn() }
vi.mock('../focus/focusStore', () => ({ useFocusStore: { getState: () => focus } }))

const show = vi.fn()
vi.mock('../paper/paperStore', () => ({ usePaperStore: { getState: () => ({ show }) } }))

const { actionFromSearch, runNotificationAction, withoutAction } = await import('./actions')

describe('notification actions', () => {
  beforeEach(() => {
    fetched.length = 0
    server.down = false
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

  it("a press the server can't answer isn't dropped: it says so, with Try again", async () => {
    server.down = true
    await runNotificationAction({ action: 'done', taskIds: ['a', 'x'] }, vi.fn())
    expect(completeTaskWithUndo).not.toHaveBeenCalled() // not even the cached one: all or nothing, like the press
    expect(toastAction).toHaveBeenCalledTimes(1)
    expect(toastAction.mock.calls[0].slice(0, 2)).toEqual(['Couldn’t reach that task just now', 'Try again'])
    server.down = false
    ;(toastAction.mock.calls[0][2] as () => void)() // Try again
    await vi.waitFor(() => expect(completeTaskWithUndo.mock.calls.map(([t]) => (t as { id: string }).id)).toEqual(['a', 'x']))
    server.down = true
    await runNotificationAction({ action: 'tomorrow', taskIds: ['x'] }, vi.fn())
    expect(moveToTomorrowWithUndo).not.toHaveBeenCalled()
    expect(toastAction).toHaveBeenCalledTimes(2)
  })

  it('Tomorrow moves the open ones with one undo', async () => {
    await runNotificationAction({ action: 'tomorrow', taskIds: ['a', 'd'] }, vi.fn())
    expect(moveToTomorrowWithUndo).toHaveBeenCalledTimes(1)
    expect((moveToTomorrowWithUndo.mock.calls[0][0] as { id: string }[]).map((t) => t.id)).toEqual(['a'])
  })

  // Snooze (Kai 2026-10-17): a reminder's In 10 min / In 1 hour — the reminder again, the task untouched.
  it('In 10 min / In 1 hour remind the open ones again then, one undo each press', async () => {
    const nav = vi.fn()
    await runNotificationAction({ action: 'snooze10', taskIds: ['a', 'd'] }, nav)
    await runNotificationAction({ action: 'snooze60', taskIds: ['a'] }, nav)
    expect(remindAgainWithUndo.mock.calls.map(([ts, min]) => [(ts as { id: string }[]).map((t) => t.id), min])).toEqual([[['a'], 10], [['a'], 60]])
    expect(nav).not.toHaveBeenCalled() // a background press: nothing opens
    expect(moveToTomorrowWithUndo).not.toHaveBeenCalled()
    expect(actionFromSearch('?kfAction=snooze10&kfTasks=a')).toEqual({ action: 'snooze10', taskIds: ['a'] }) // a cold window runs it too
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

describe('Review (paper capture ready)', () => {
  it('opens the Inbox, and the page’s results while it still waits for review', async () => {
    const nav = vi.fn()
    await runNotificationAction({ action: 'review', taskIds: ['c-waiting'] }, nav)
    expect(nav).toHaveBeenCalledWith('/inbox')
    expect(show).toHaveBeenCalledWith({ kind: 'results', captureId: 'c-waiting' })
  })
  it('a page reviewed since (or no capture): only the Inbox — its lines are never offered twice', async () => {
    show.mockClear()
    const nav = vi.fn()
    await runNotificationAction({ action: 'review', taskIds: ['c-reviewed'] }, nav)
    await runNotificationAction({ action: 'review' }, nav)
    expect(nav.mock.calls).toEqual([['/inbox'], ['/inbox']])
    expect(show).not.toHaveBeenCalled()
  })
})
