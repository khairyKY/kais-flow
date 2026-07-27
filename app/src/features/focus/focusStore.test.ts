import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../projects/api', () => ({ logTimeEntry: vi.fn() }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }))
// The tick loop rings the round-end chime; a unit test has no business booting an audio engine.
vi.mock('../../lib/sounds', () => ({ playSound: vi.fn() }))

import { useFocusStore, DEFAULT_SETTINGS } from './focusStore'

const reset = (over: Partial<ReturnType<typeof useFocusStore.getState>> = {}) =>
  useFocusStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    mode: 'pomodoro',
    isRunning: true,
    secondsLeft: 5,
    stopwatchSeconds: 0,
    currentRound: 1,
    breakType: 'short',
    activeTask: null,
    pomodoroStartIso: null,
    ...over,
  })

describe('focusStore tick', () => {
  beforeEach(() => reset())

  it('counts down while time remains', () => {
    useFocusStore.getState().tick()
    expect(useFocusStore.getState().secondsLeft).toBe(4)
  })

  it('does nothing when paused', () => {
    reset({ isRunning: false })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState().secondsLeft).toBe(5)
  })

  it('rolls a finished focus round into a short break before the long-break threshold', () => {
    reset({ secondsLeft: 1, currentRound: 1 })
    useFocusStore.getState().tick()
    const s = useFocusStore.getState()
    expect(s.mode).toBe('break')
    expect(s.breakType).toBe('short')
    expect(s.secondsLeft).toBe(DEFAULT_SETTINGS.shortBreakMin * 60)
  })

  it('opens the garden on the long break when that setting is on', () => {
    reset({ secondsLeft: 1, currentRound: DEFAULT_SETTINGS.roundsBeforeLongBreak })
    useFocusStore.getState().tick()
    const s = useFocusStore.getState()
    expect(s.mode).toBe('garden')
    expect(s.breakType).toBe('long')
    expect(s.isRunning).toBe(false) // the garden is a rest, never auto-running
  })

  it('honors autoStartBreaks=false by pausing at the break instead of running into it', () => {
    reset({
      secondsLeft: 1,
      currentRound: 1,
      settings: { ...DEFAULT_SETTINGS, autoStartBreaks: false },
    })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState().isRunning).toBe(false)
  })

  it('advances the round counter when a break ends, and wraps after the long break', () => {
    reset({ mode: 'break', secondsLeft: 1, currentRound: 2 })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState().currentRound).toBe(3)

    reset({ mode: 'break', secondsLeft: 1, currentRound: DEFAULT_SETTINGS.roundsBeforeLongBreak })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState().currentRound).toBe(1)
  })

  it('counts up in stopwatch mode instead of down', () => {
    reset({ mode: 'stopwatch', stopwatchSeconds: 7 })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState().stopwatchSeconds).toBe(8)
  })
})
