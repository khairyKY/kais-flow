import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../projects/api', () => ({ logTimeEntry: vi.fn() }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }))
// The tick loop rings the round-end chime; a unit test has no business booting an audio engine.
vi.mock('../../lib/sounds', () => ({ playSound: vi.fn() }))

import { useFocusStore, DEFAULT_SETTINGS, resumeAway } from './focusStore'
import { logTimeEntry } from '../projects/api'

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
    block: null,
    kept: 0,
    ...over,
  })

describe('focusStore tick', () => {
  beforeEach(() => reset())

  it('focus D3: a round kept in a block counts, and the last round of the block ends the day (no break)', () => {
    const block = { title: 'Deep work', start: 'a', end: 'b', srcStart: 'a', srcEnd: 'b', color: 'var(--blk-iris)', ink: 'var(--blk-iris-ink)', rounds: 2, fill: true, fromCalendar: true, eventId: 'e1' }
    reset({ secondsLeft: 1, block, kept: 0 })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState()).toMatchObject({ mode: 'break', kept: 1 })
    reset({ secondsLeft: 1, block, kept: 1, pomodoroStartIso: 'x' })
    useFocusStore.getState().tick()
    expect(useFocusStore.getState()).toMatchObject({ mode: 'pomodoro', isRunning: false, kept: 2, pomodoroStartIso: null })
  })

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

describe('a focus round survives a reload (A30)', () => {
  beforeEach(() => reset())

  it('a running round catches up on the time it was away', () => {
    reset({ secondsLeft: 600 })
    resumeAway(60_400)
    expect(useFocusStore.getState()).toMatchObject({ mode: 'pomodoro', isRunning: true, secondsLeft: 540 })
  })

  it('a round that ran out meanwhile ends there — logged once, from its real start — and the break waits', () => {
    vi.mocked(logTimeEntry).mockClear()
    reset({ secondsLeft: 600, activeTask: { id: 't1', project_id: 'p1' }, pomodoroStartIso: '2026-10-13T08:00:00.000Z' })
    resumeAway(3 * 3_600_000) // closed for three hours
    expect(useFocusStore.getState()).toMatchObject({ mode: 'break', isRunning: false, secondsLeft: DEFAULT_SETTINGS.shortBreakMin * 60, pomodoroStartIso: null })
    expect(logTimeEntry).toHaveBeenCalledTimes(1)
    expect(logTimeEntry).toHaveBeenCalledWith('p1', 't1', 'Pomodoro round completed', DEFAULT_SETTINGS.focusRoundMin, '2026-10-13T08:00:00.000Z')
  })

  it('a stopwatch adds the time; a paused timer is left as it was', () => {
    reset({ mode: 'stopwatch', stopwatchSeconds: 100 })
    resumeAway(30_000)
    expect(useFocusStore.getState().stopwatchSeconds).toBe(130)
    reset({ isRunning: false, secondsLeft: 600 })
    resumeAway(60_000)
    expect(useFocusStore.getState()).toMatchObject({ isRunning: false, secondsLeft: 600 })
  })

  it('the session is written on every change and comes back on load', async () => {
    const saved = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v), removeItem: (k: string) => void saved.delete(k) })
    try {
      reset({ secondsLeft: 300, activeTask: { id: 't1', project_id: null }, pomodoroStartIso: '2026-10-13T08:00:00.000Z' })
      const row = JSON.parse(saved.get('kf_focus_session')!)
      expect(row).toMatchObject({ mode: 'pomodoro', isRunning: true, secondsLeft: 300, activeTask: { id: 't1' } })
      expect(typeof row.savedAt).toBe('number')
      vi.resetModules()
      const reloaded = await import('./focusStore')
      expect(reloaded.useFocusStore.getState()).toMatchObject({ mode: 'pomodoro', isRunning: true, secondsLeft: 300, activeTask: { id: 't1', project_id: null }, pomodoroStartIso: '2026-10-13T08:00:00.000Z' })
      saved.set('kf_focus_session', '{"mode":"nap"}') // not a session this build wrote: start fresh
      vi.resetModules()
      expect((await import('./focusStore')).useFocusStore.getState()).toMatchObject({ mode: 'pomodoro', isRunning: false, activeTask: null })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
