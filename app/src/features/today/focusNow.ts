import { useFocusStore } from '../focus/focusStore'
import type { FocusNow } from './nowCard'

// The focus store, as the Now card reads it (./nowCard): which task, running or paused mid-round.
// The store keeps no pause time, so this remembers when this device saw a round pause — "Paused ·
// since 11:02". ponytail: a pause made before Today's chunk loaded reads just "Paused"; a stamped
// pausedAt in focusStore would cover it.
let pausedAt: number | null = null
useFocusStore.subscribe((s, prev) => {
  if (prev.isRunning && !s.isRunning) pausedAt = Date.now()
  else if (s.isRunning) pausedAt = null
})

/** Null with no focus task, or none mid-round. Re-renders only on a change of state — not on every
 * second of a running round (secondsLeft is only read while paused, when it's frozen). */
export function useFocusNow(): FocusNow | null {
  const taskId = useFocusStore((s) => s.activeTask?.id ?? null)
  const running = useFocusStore((s) => s.isRunning && (s.mode === 'pomodoro' || s.mode === 'stopwatch'))
  // A pomodoro started and not run out (widgets/snapshot's "paused" rule): secondsLeft below a round.
  const pausedLeft = useFocusStore((s) => (s.isRunning || s.mode !== 'pomodoro' ? null : s.secondsLeft))
  const roundSeconds = useFocusStore((s) => s.settings.focusRoundMin * 60)
  if (!taskId) return null
  if (running) return { taskId, running: true, secondsLeft: 0, roundSeconds, pausedAt: null }
  if (pausedLeft == null || pausedLeft >= roundSeconds) return null
  return { taskId, running: false, secondsLeft: pausedLeft, roundSeconds, pausedAt }
}
