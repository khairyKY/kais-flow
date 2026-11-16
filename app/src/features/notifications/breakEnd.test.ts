import { describe, expect, it } from 'vitest'
import { breakEnded } from './breakEnd'

describe('breakEnded', () => {
  it('a running break at its last second that became a round', () => {
    expect(breakEnded({ mode: 'break', isRunning: true, secondsLeft: 1 }, { mode: 'pomodoro' })).toBe(true)
  })
  it('not a skip (time left), not a paused break, not a round or the garden ending', () => {
    expect(breakEnded({ mode: 'break', isRunning: true, secondsLeft: 200 }, { mode: 'pomodoro' })).toBe(false)
    expect(breakEnded({ mode: 'break', isRunning: false, secondsLeft: 1 }, { mode: 'pomodoro' })).toBe(false)
    expect(breakEnded({ mode: 'pomodoro', isRunning: true, secondsLeft: 1 }, { mode: 'break' })).toBe(false)
    expect(breakEnded({ mode: 'break', isRunning: true, secondsLeft: 1 }, { mode: 'break' })).toBe(false)
  })
})
