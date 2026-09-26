import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useFocusStore } from '../focus/focusStore'

// Loop A (2026-09-26 daily cycle, docs/DAILY-CYCLE.md "Do"): "the next move is always one tap".
// Every ▶ Start focus on Today — Top 3 rows, Up next rows, the Day card, the row menus — goes
// through this one path, so they can't drift apart.
//
// It does what MiniFocus.start() does on the task editor (R4-D3): make the task the one active
// Focus task and run the clock if it's idle. Then it lands on /focus, where the full timer shows
// the same session (focusStore is shared) with this task picked.

export interface FocusableTask {
  id: string
  project_id: string | null
}

/** MiniFocus.start(), plus one guard: a Start focus pressed during a break (or the long-break
 * garden) begins a fresh focus round instead of running the break clock for the task. */
export function beginFocus(task: FocusableTask): void {
  const s = useFocusStore.getState()
  if (s.mode === 'break' || s.mode === 'garden') s.setMode('pomodoro')
  if (s.activeTask?.id !== task.id) s.setActiveTask({ id: task.id, project_id: task.project_id })
  if (!useFocusStore.getState().isRunning) useFocusStore.getState().togglePlay()
}

/** Start focus on `task` and open the Focus page on it. */
export function useStartFocus(): (task: FocusableTask) => void {
  const navigate = useNavigate()
  return useCallback(
    (task: FocusableTask) => {
      beginFocus(task)
      navigate('/focus')
    },
    [navigate],
  )
}
