import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../projects/api', () => ({ logTimeEntry: vi.fn() }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }))
vi.mock('../../lib/sounds', () => ({ playSound: vi.fn() }))

import { useFocusStore, DEFAULT_SETTINGS } from '../focus/focusStore'
import { beginFocus } from './startFocus'

const reset = (over: Partial<ReturnType<typeof useFocusStore.getState>> = {}) =>
  useFocusStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    mode: 'pomodoro',
    isRunning: false,
    secondsLeft: DEFAULT_SETTINGS.focusRoundMin * 60,
    stopwatchSeconds: 0,
    currentRound: 1,
    breakType: 'short',
    activeTask: null,
    pomodoroStartIso: null,
    ...over,
  })

const task = { id: 't1', project_id: 'p1' }

describe('beginFocus — the one Start focus path (same as MiniFocus.start)', () => {
  beforeEach(() => reset())

  it('makes the task the active Focus task and starts an idle clock', () => {
    beginFocus(task)
    const s = useFocusStore.getState()
    expect(s.activeTask).toEqual({ id: 't1', project_id: 'p1' })
    expect(s.isRunning).toBe(true)
    expect(s.mode).toBe('pomodoro')
    expect(s.pomodoroStartIso).not.toBeNull()
  })

  it('a clock already running keeps running — pressing again never pauses it', () => {
    reset({ isRunning: true, activeTask: { id: 't1', project_id: 'p1' }, secondsLeft: 600 })
    beginFocus(task)
    const s = useFocusStore.getState()
    expect(s.isRunning).toBe(true)
    expect(s.secondsLeft).toBe(600)
  })

  it('switches a running session to the new task without restarting the round', () => {
    reset({ isRunning: true, activeTask: { id: 'other', project_id: null }, secondsLeft: 600 })
    beginFocus(task)
    const s = useFocusStore.getState()
    expect(s.activeTask?.id).toBe('t1')
    expect(s.secondsLeft).toBe(600)
    expect(s.isRunning).toBe(true)
  })

  it('during a break it begins a fresh focus round rather than running the break clock', () => {
    reset({ mode: 'break', isRunning: true, secondsLeft: 120 })
    beginFocus(task)
    const s = useFocusStore.getState()
    expect(s.mode).toBe('pomodoro')
    expect(s.secondsLeft).toBe(DEFAULT_SETTINGS.focusRoundMin * 60)
    expect(s.isRunning).toBe(true)
  })

  it('leaves a stopwatch session a stopwatch', () => {
    reset({ mode: 'stopwatch' })
    beginFocus(task)
    const s = useFocusStore.getState()
    expect(s.mode).toBe('stopwatch')
    expect(s.isRunning).toBe(true)
  })
})
