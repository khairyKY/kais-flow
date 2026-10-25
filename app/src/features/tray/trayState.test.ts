import { describe, expect, it } from 'vitest'
import { dueReminders, focusMenuLabel, focusTarget, minutesText, pauseMenuLabel, pauseUntil, trayIconState, trayMenuState, trayNow, type TrayFocus } from './trayState'

const idle: TrayFocus = { mode: 'pomodoro', isRunning: false, secondsLeft: 1500, roundMin: 25 }
const base = { focus: idle, needsYou: false, offline: false, waiting: 0, quiet: false }

describe('tray icon state', () => {
  it('normal, then each state on its own', () => {
    expect(trayIconState(base)).toBe('normal')
    expect(trayIconState({ ...base, needsYou: true })).toBe('needs')
    expect(trayIconState({ ...base, offline: true })).toBe('offline')
    expect(trayIconState({ ...base, waiting: 2 })).toBe('offline')
    expect(trayIconState({ ...base, quiet: true })).toBe('quiet')
  })

  it('a running round fills its dot by quarters, and wins over the rest', () => {
    const run = (secondsLeft: number) => trayIconState({ ...base, needsYou: true, quiet: true, focus: { ...idle, isRunning: true, secondsLeft } })
    expect([1500, 1200, 1122, 750, 300, 1].map(run)).toEqual(['focus1', 'focus1', 'focus2', 'focus2', 'focus4', 'focus4'])
    expect(trayIconState({ ...base, focus: { ...idle, isRunning: true, mode: 'break', secondsLeft: 200 } })).toBe('normal')
  })

  it('order: needs you before changes waiting before quiet', () => {
    expect(trayIconState({ ...base, needsYou: true, waiting: 1, quiet: true })).toBe('needs')
    expect(trayIconState({ ...base, waiting: 1, quiet: true })).toBe('offline')
  })
})

describe('menu rows (12d)', () => {
  it('focus: start with the round length, stop with what is left', () => {
    expect(focusMenuLabel(idle)).toBe('Start focus · 25:00')
    expect(focusMenuLabel({ ...idle, roundMin: 5 })).toBe('Start focus · 05:00')
    expect(focusMenuLabel({ ...idle, isRunning: true, secondsLeft: 1122 })).toBe('Stop focus · 19 min left')
    expect(focusMenuLabel({ ...idle, secondsLeft: 1122 })).toBe('Stop focus · 19 min left') // paused mid-round
  })

  it('pause: until when, on the Cairo clock', () => {
    const now = new Date('2026-10-03T06:41:00Z') // 09:41 Cairo
    expect(pauseMenuLabel(null, now)).toBe('Pause notifications for 1 hour')
    expect(pauseMenuLabel('2026-10-03T07:41:00Z', now)).toBe('Resume notifications · paused until 10:41')
    expect(pauseMenuLabel('2026-10-03T06:00:00Z', now)).toBe('Pause notifications for 1 hour')
  })
})

describe('what the tray starts focus on', () => {
  const t = (id: string, o: Partial<{ status: string; top3: boolean; deleted_at: string | null }> = {}) => ({ id, project_id: null, status: 'todo', top3: true, deleted_at: null, ...o })
  const tasks = [t('a', { top3: false }), t('b'), t('goal'), t('done', { status: 'done' })]
  it('the task already in the timer, else the goal, else the first open Top 3', () => {
    expect(focusTarget(tasks, 'a', 'goal')?.id).toBe('a')
    expect(focusTarget(tasks, 'done', 'goal')?.id).toBe('goal')
    expect(focusTarget(tasks, null, 'done')?.id).toBe('b')
    expect(focusTarget([t('x', { top3: false })], null, null)).toBeNull()
  })
})

describe('the Windows app reminder sweep', () => {
  const now = new Date('2026-10-03T06:40:00Z')
  const r = (id: string, at: string | null, o = {}) => ({ id, status: 'todo', reminder_at: at, deleted_at: null, ...o })
  it('takes what came due since the last look, open, not trashed and not paused', () => {
    const tasks = [r('due', '2026-10-03T06:39:30Z'), r('paused', '2026-10-03T06:39:20Z', { paused: true }), r('old', '2026-10-03T06:29:00Z'), r('later', '2026-10-03T06:41:00Z'), r('done', '2026-10-03T06:39:00Z', { status: 'done' }), r('trash', '2026-10-03T06:39:00Z', { deleted_at: 'x' }), r('none', null)]
    expect(dueReminders(tasks, new Date(now.getTime() - 10 * 60_000), now).map((t) => t.id)).toEqual(['due'])
    expect(dueReminders(tasks, new Date(now.getTime() - 15 * 60_000), now).map((t) => t.id)).toEqual(['due', 'old'])
  })
})

describe('popover B: the Now card (options page §4, card A)', () => {
  // Sunday 25 Oct 2026, 18:03 in Cairo (UTC+3).
  const now = new Date('2026-10-25T15:03:00Z')
  const ev = (id: string, from: string, to: string, task_id: string | null = null) => ({ id, title: id, starts_at: `2026-10-25T${from}:00Z`, ends_at: `2026-10-25T${to}:00Z`, all_day: false, task_id })
  const none = () => false
  it('nothing left today', () => {
    expect(trayNow([ev('lunch', '09:00', '10:00')], none, now)).toEqual({ kind: 'none' })
  })
  it('up next within the hour: a count-down; over an hour away: a clock time', () => {
    expect(trayNow([ev('maghrib', '15:15', '15:40')], none, now)).toMatchObject({ kind: 'soon', inMin: 12 })
    expect(trayNow([ev('isha', '16:58', '17:20')], none, now)).toMatchObject({ kind: 'far' })
  })
  it('ongoing: time left and how far in; two at once, the one ending soonest leads', () => {
    expect(trayNow([ev('maghrib', '14:53', '15:18')], none, now)).toMatchObject({ kind: 'on', leftMin: 15, pct: 40, others: 0 })
    const two = trayNow([ev('long', '14:00', '16:00'), ev('short', '15:00', '15:10')], none, now)
    expect(two).toMatchObject({ kind: 'on', others: 1 })
    expect(two.kind === 'on' && two.event.id).toBe('short')
  })
  it("a done task's block is skipped", () => {
    expect(trayNow([ev('call', '15:10', '15:30', 't1'), ev('gym', '15:40', '16:30')], (id) => id === 't1', now)).toMatchObject({ kind: 'soon', event: { id: 'gym' } })
  })
  it('count-down text', () => {
    expect([12, 60, 70, 125].map(minutesText)).toEqual(['12m', '1h', '1h 10m', '2h 5m'])
  })
})

describe('menu B: the state the main window hands over', () => {
  const now = new Date('2026-10-25T15:03:00Z')
  const e = { id: 'm', title: 'المغرب', starts_at: '2026-10-25T15:15:00Z', ends_at: '2026-10-25T15:40:00Z', all_day: false, task_id: null }
  it('"Next · title · start", or "Now · title · until the end" while it runs; paused until when', () => {
    expect(trayMenuState({ kind: 'soon', event: e, inMin: 12 }, null, now)).toEqual({ signedIn: true, next: { now: false, title: 'المغرب', at: '6:15 PM' }, pausedUntil: null })
    expect(trayMenuState({ kind: 'on', event: e, leftMin: 5, pct: 80, others: 0 }, '2026-10-25T16:00:00Z', now)).toEqual({ signedIn: true, next: { now: true, title: 'المغرب', at: '6:40 PM' }, pausedUntil: '7:00 PM' })
    expect(trayMenuState({ kind: 'none' }, '2026-10-25T14:00:00Z', now)).toEqual({ signedIn: true, next: null, pausedUntil: null }) // a pause already over
  })
  it('Pause ▸ 30 minutes · 1 hour · Until tomorrow (09:00 on the user’s clock)', () => {
    expect(pauseUntil('30', now)).toBe('2026-10-25T15:33:00.000Z')
    expect(pauseUntil('60', now)).toBe('2026-10-25T16:03:00.000Z')
    expect(pauseUntil('tomorrow', now)).toBe('2026-10-26T06:00:00.000Z')
  })
})
