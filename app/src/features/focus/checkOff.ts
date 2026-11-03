import { completeTaskWithUndo } from '../tasks/api'
import { logTimeEntry } from '../projects/api'
import { queryClient } from '../../lib/queryClient'
import type { Task } from '../../lib/types'
import { useFocusStore } from './focusStore'

/** Done on the focus task — the Focus page's ✓ and the pill's. A running round logs the minutes it ran
 * (they were spent; Undo keeps them), then the task is checked with the usual toast + Undo and the round resets. */
export function checkOffFocus(task: Task): void {
  const { mode, isRunning, secondsLeft, pomodoroStartIso, settings } = useFocusStore.getState()
  if (mode === 'pomodoro' && isRunning) {
    const elapsedMin = Math.ceil((settings.focusRoundMin * 60 - secondsLeft) / 60)
    if (elapsedMin > 0) logTimeEntry(task.project_id, task.id, 'Focused block (task completed)', elapsedMin, pomodoroStartIso || new Date().toISOString())
  }
  // Polish F2a: "Done" toast + Undo, like every other check.
  completeTaskWithUndo(task)
  useFocusStore.setState({ isRunning: false, pomodoroStartIso: null, ...(mode === 'pomodoro' ? { secondsLeft: settings.focusRoundMin * 60 } : {}) })
  for (const k of ['tasks', 'time_entries', 'projects']) void queryClient.invalidateQueries({ queryKey: [k] })
}
