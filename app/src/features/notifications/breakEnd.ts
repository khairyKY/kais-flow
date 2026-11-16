import type { FocusMode } from '../focus/focusStore'

interface Timer {
  mode: FocusMode
  isRunning: boolean
  secondsLeft: number
}

/** A running break just ran out — focusStore tick() is the only thing that moves a break to a round at
 * its last second (a hand-picked mode, "Keep going" or a skip leaves more than a second on the clock). */
export const breakEnded = (prev: Timer, s: Pick<Timer, 'mode'>): boolean => prev.mode === 'break' && prev.isRunning && prev.secondsLeft <= 1 && s.mode === 'pomodoro'
