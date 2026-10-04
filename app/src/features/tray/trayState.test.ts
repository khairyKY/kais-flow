import { describe, expect, it } from 'vitest'
import { dueReminders, focusMenuLabel, focusTarget, pauseMenuLabel, trayIconState, type TrayFocus } from './trayState'

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
  it('takes what came due since the last look, open and not trashed', () => {
    const tasks = [r('due', '2026-10-03T06:39:30Z'), r('old', '2026-10-03T06:29:00Z'), r('later', '2026-10-03T06:41:00Z'), r('done', '2026-10-03T06:39:00Z', { status: 'done' }), r('trash', '2026-10-03T06:39:00Z', { deleted_at: 'x' }), r('none', null)]
    expect(dueReminders(tasks, new Date(now.getTime() - 10 * 60_000), now).map((t) => t.id)).toEqual(['due'])
    expect(dueReminders(tasks, new Date(now.getTime() - 15 * 60_000), now).map((t) => t.id)).toEqual(['due', 'old'])
  })
})
