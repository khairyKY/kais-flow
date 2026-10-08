import { create } from 'zustand'
import { queryClient } from '../../lib/queryClient'
import { openCapture } from '../command-bar/commandBarStore'
import { useFocusStore } from '../focus/focusStore'
import { applyFocusCommand } from '../tray/focusChannel'
import { focusTarget } from '../tray/trayState'
import { goalIdOf } from '../today/top3Order'
import { legacyGoalId } from '../today/goalStore'
import { cachedStarEvents } from '../today/api'
import { toggleCompletion } from '../routines/api'
import { localDateKey } from '../routines/streaks'
import { native, setChatStarter } from './native'
import { parseQueue, type OpWrites, type WidgetOp } from './queue'
import type { Routine, RoutineCompletion, Task } from '../../lib/types'

// The home-screen ticks and taps (native/android/java/.../widgets): the ticks queued in the shell
// are applied here through the app's own writes (outbox, activity log); the taps that open the app
// (`?kfAction=`) run here. The bridge itself is ./native.

// ── "Hide titles on the home screen" — this device's widgets only ──

const HIDE_KEY = 'kf_widgets_hide_titles'
export const useHideTitles = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: (() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1'
    } catch {
      return false
    }
  })(),
  set: (on) => {
    try {
      localStorage.setItem(HIDE_KEY, on ? '1' : '0')
    } catch {
      /* this session only */
    }
    set({ on })
  },
}))

// ── Home-screen ticks ──

/** The app's writes for the queue (the notification "Done" path for tasks). */
export function appWrites(completeTasks: (ids: string[]) => void): OpWrites {
  return {
    completeTasks,
    checkRoutine: (id, at) => {
      const routine = queryClient.getQueryData<Routine[]>(['routines'])?.find((r) => r.id === id)
      const done = (queryClient.getQueryData<RoutineCompletion[]>(['routine_completions']) ?? []).some((c) => c.routine_id === id && c.completed_on === localDateKey(at))
      if (routine && !done) toggleCompletion(routine, at)
    },
    stopFocus: () => {
      const f = useFocusStore.getState()
      if (f.isRunning || (f.mode === 'pomodoro' && f.secondsLeft < f.settings.focusRoundMin * 60)) applyFocusCommand({ type: 'stop' })
    },
  }
}

export function takeQueue(): WidgetOp[] {
  return parseQueue(native()?.takeQueue())
}

// ── Widget taps that open the app (`?kfAction=`; notifications/actions.ts runs them) ──

/** Talk: the voice sheet (WidgetBridge draws it). */
export const useWidgetVoice = create<{ open: boolean }>(() => ({ open: false }))

/** The widget actions; false for anything that isn't one (the caller navigates instead). */
export function runWidgetAction(action: string, opts: { taskIds?: string[]; text?: string | null }, navigate: (to: string) => void): boolean {
  switch (action) {
    case 'capture':
      openCapture()
      return true
    case 'voice':
      useWidgetVoice.setState({ open: true })
      return true
    case 'paper':
      // A file input needs a tap of its own to open the camera, so Paper opens the capture sheet,
      // whose camera button is that tap.
      openCapture()
      return true
    case 'ask':
      setChatStarter(opts.text ?? null)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }))
      return true
    case 'focus-start': {
      const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
      const picked = opts.taskIds?.[0] ? tasks.find((t) => t.id === opts.taskIds![0]) : undefined
      const target = picked ?? focusTarget(tasks, useFocusStore.getState().activeTask?.id ?? null, goalIdOf(tasks, legacyGoalId(), cachedStarEvents()))
      applyFocusCommand({ type: 'start', task: target && { id: target.id, project_id: target.project_id } })
      navigate('/focus')
      return true
    }
    case 'replan':
      navigate('/today?ritual=replan')
      return true
    case 'journal':
    case 'journal-voice':
      navigate('/journal')
      return true
    default:
      return false
  }
}
