import { beforeEach, describe, expect, it, vi } from 'vitest'
import { digestNotice, reminderNotice, testNotice } from '../../../../supabase/functions/notify/copy.ts'

// android.ts against a stand-in for @capacitor/local-notifications: what the phone is asked to
// show/schedule, on which channel, with which buttons — and that nothing happens without permission.
const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(async () => {}),
  registerActionTypes: vi.fn(async () => {}),
  schedule: vi.fn(async (_o: { notifications: Record<string, unknown>[] }) => ({ notifications: [] })),
  getPending: vi.fn(async () => ({ notifications: [{ id: 7 }, { id: 8 }] })),
  cancel: vi.fn(async () => {}),
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
  addListener: vi.fn(),
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }))

const { androidPermission, channelFor, notificationId, onAndroidAction, scheduleAndroid, showAndroid, toAndroid } = await import('./android')

const now = new Date('2026-10-03T05:00:00Z')
const reminder = reminderNotice([{ id: 't1', title: 'Call the tyre supplier', due_at: '2026-10-03T05:50:00Z' }], { lock_screen_names: true }, now, 'Africa/Cairo')

beforeEach(() => {
  vi.clearAllMocks()
  ln.checkPermissions.mockResolvedValue({ display: 'granted' })
})

describe('the notice → an Android notification', () => {
  it('channel by kind; silent ones go to Quiet', () => {
    expect(channelFor(reminder)).toBe('reminders')
    expect(channelFor(digestNotice(['a'], {}))).toBe('quiet')
    expect(channelFor({ ...reminder, silent: true })).toBe('quiet')
    expect(channelFor(testNotice())).toBe('reminders')
  })

  it('stable positive ids', () => {
    expect(notificationId('focus-done')).toBe(notificationId('focus-done'))
    expect(notificationId('a')).not.toBe(notificationId('b'))
    for (const k of ['', 'x', 't1@2026-10-03T05:40:00Z', 'morning_digest@2026-10-04T05:00:00.000Z']) {
      expect(notificationId(k)).toBeGreaterThan(0)
      expect(notificationId(k)).toBeLessThanOrEqual(0x7fffffff)
    }
  })

  it('title, body, buttons, the K, and what a tap needs', () => {
    const at = new Date('2026-10-03T05:40:00Z')
    const n = toAndroid(reminder, 42, at, false)
    expect(n).toMatchObject({
      id: 42,
      title: 'Call the tyre supplier · in 50 min',
      body: '08:50',
      channelId: 'reminders',
      smallIcon: 'ic_stat_kf',
      actionTypeId: 'done:Done|snooze10:In 10 min|snooze60:In 1 hour|tomorrow:Tomorrow',
      extra: { kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1'] },
      schedule: { at, allowWhileIdle: true },
      isExactNotification: false,
    })
    expect(toAndroid(testNotice(), 1)).not.toHaveProperty('schedule')
    expect(toAndroid(testNotice(), 1)).not.toHaveProperty('actionTypeId')
  })
})

describe('permission', () => {
  it('asks only when asked to, and only when Android hasn’t decided', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'prompt' })
    ln.requestPermissions.mockResolvedValue({ display: 'granted' })
    expect(await androidPermission()).toBe('prompt')
    expect(ln.requestPermissions).not.toHaveBeenCalled()
    expect(await androidPermission(true)).toBe('granted')
    ln.checkPermissions.mockResolvedValue({ display: 'denied' })
    expect(await androidPermission(true)).toBe('denied')
    expect(ln.requestPermissions).toHaveBeenCalledTimes(1)
  })
})

describe('show now / schedule', () => {
  it('shows now: channels made, buttons registered, posted without a schedule', async () => {
    await showAndroid(reminder)
    expect(ln.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'reminders', importance: 4 }))
    expect(ln.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'quiet', importance: 2 }))
    expect(ln.registerActionTypes).toHaveBeenCalledWith({ types: [{ id: 'done:Done|snooze10:In 10 min|snooze60:In 1 hour|tomorrow:Tomorrow', actions: [{ id: 'done', title: 'Done' }, { id: 'snooze10', title: 'In 10 min' }, { id: 'snooze60', title: 'In 1 hour' }, { id: 'tomorrow', title: 'Tomorrow' }] }] })
    expect(ln.schedule.mock.calls[0][0].notifications[0]).toMatchObject({ id: notificationId(reminder.tag), title: reminder.title })
  })

  it('nothing without permission', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'denied' })
    await showAndroid(reminder)
    await scheduleAndroid([{ key: 'k', at: now, notice: reminder }])
    expect(ln.schedule).not.toHaveBeenCalled()
    expect(ln.cancel).not.toHaveBeenCalled()
  })

  it('replaces what was pending with the plan; exact when allowed, inexact otherwise', async () => {
    const at = new Date('2026-10-03T05:40:00Z')
    await scheduleAndroid([{ key: 't1@x', at, notice: reminder }])
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }, { id: 8 }] })
    expect(ln.schedule.mock.calls[0][0].notifications).toEqual([expect.objectContaining({ id: notificationId('t1@x'), schedule: { at, allowWhileIdle: true }, isExactNotification: true })])
    ln.checkExactNotificationSetting.mockResolvedValueOnce({ exact_alarm: 'denied' })
    await scheduleAndroid([{ key: 't1@x', at, notice: reminder }])
    expect(ln.schedule.mock.calls[1][0].notifications[0].isExactNotification).toBe(false)
  })

  it('the new plan goes in before anything is cancelled, and a still-planned one is never cancelled', async () => {
    const order: string[] = []
    ln.schedule.mockImplementationOnce(async () => (order.push('schedule'), { notifications: [] }))
    ln.cancel.mockImplementationOnce(async () => void order.push('cancel'))
    const keep = notificationId('t1@x')
    ln.getPending.mockResolvedValueOnce({ notifications: [{ id: keep }, { id: 8 }] })
    await scheduleAndroid([{ key: 't1@x', at: new Date('2026-10-03T05:40:00Z'), notice: reminder }])
    expect(order).toEqual(['schedule', 'cancel'])
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 8 }] })
  })

  it('a schedule that fails cancels nothing (the old plan stays)', async () => {
    ln.schedule.mockRejectedValueOnce(new Error('bridge gone'))
    await scheduleAndroid([{ key: 't1@x', at: new Date('2026-10-03T05:40:00Z'), notice: reminder }])
    expect(ln.cancel).not.toHaveBeenCalled()
  })

  it('at most 400 alarms (Android allows 500 an app), the soonest kept', async () => {
    const plan = Array.from({ length: 450 }, (_, i) => ({ key: `k${i}`, at: new Date(now.getTime() + (i + 1) * 60_000), notice: reminder }))
    await scheduleAndroid(plan)
    const sent = ln.schedule.mock.calls[0][0].notifications
    expect(sent).toHaveLength(400)
    expect(sent[0].id).toBe(notificationId('k0'))
  })

  it('an empty plan just clears', async () => {
    await scheduleAndroid([])
    expect(ln.cancel).toHaveBeenCalled()
    expect(ln.schedule).not.toHaveBeenCalled()
  })
})

describe('taps', () => {
  it('a tap opens the notice; a button runs its action with the tasks', () => {
    let listener: (e: unknown) => void = () => {}
    ln.addListener.mockImplementation((_: string, fn: (e: unknown) => void) => {
      listener = fn
      return Promise.resolve({ remove: vi.fn() })
    })
    const run = vi.fn()
    onAndroidAction(run)
    listener({ actionId: 'tap', notification: { extra: { kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1'] } } })
    listener({ actionId: 'done', notification: { extra: { kind: 'task_reminder', taskIds: ['t1'] } } })
    expect(run.mock.calls).toEqual([
      ['open', { kind: 'task_reminder', url: '/tasks?focus=t1', taskIds: ['t1'] }],
      ['done', { kind: 'task_reminder', taskIds: ['t1'] }],
    ])
  })
})
