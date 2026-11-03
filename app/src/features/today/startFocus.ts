import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useFocusStore } from '../focus/focusStore'
import { blockFor } from '../focus/focusPlan'
import { queryClient } from '../../lib/queryClient'
import type { CalendarEvent, Task } from '../../lib/types'

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
 * garden) begins a fresh focus round instead of running the break clock for the task.
 * Focus D3: a session that isn't already under way lands on its block, split into rounds (./focus/focusPlan) —
 * the task's block today, `event` (a block's own "Focus on this"), else the task's estimate from now. */
export function beginFocus(task: FocusableTask | null, event?: CalendarEvent | null): void {
  const s = useFocusStore.getState()
  const inRound = s.isRunning || (s.mode === 'pomodoro' && (!!s.pomodoroStartIso || s.secondsLeft < s.settings.focusRoundMin * 60))
  if (s.mode !== 'stopwatch' && (!inRound || s.mode === 'break' || s.mode === 'garden' || event)) {
    const full = task ? (queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === task.id) ?? null) : null
    const events = queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []
    s.setBlock(blockFor(full ?? (task && { id: task.id, title: 'Focus', scheduled_start: null, scheduled_end: null, duration_min: null }), events, s.settings, new Date(), event))
    s.setMode('pomodoro') // a fresh round of the new block
  }
  if (task && s.activeTask?.id !== task.id) s.setActiveTask({ id: task.id, project_id: task.project_id })
  if (!useFocusStore.getState().isRunning) useFocusStore.getState().togglePlay()
}

/** Start focus on `task` (or a block, `event`) and open the Focus page on it. */
export function useStartFocus(): (task: FocusableTask | null, event?: CalendarEvent | null) => void {
  const navigate = useNavigate()
  return useCallback(
    (task: FocusableTask | null, event?: CalendarEvent | null) => {
      beginFocus(task, event)
      navigate('/focus')
    },
    [navigate],
  )
}
