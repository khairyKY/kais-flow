import { useFocusStore } from '../focus/focusStore'
import { beginFocus } from '../today/startFocus'
import { FOCUS_CHANNEL, type FocusCommand, type FocusMessage, type FocusSnapshot } from './focusMirror'

// The tray's windows are second and third windows on the same app; the one focus timer lives in the main
// window (focusStore, driven by the shell's ticker). This is the main window's side of the channel: it
// posts every change and obeys commands. The tray windows' side is ./focusMirror.

export type { FocusCommand, FocusSnapshot } from './focusMirror'

export function focusSnapshot(): FocusSnapshot {
  const s = useFocusStore.getState()
  const { focusRoundMin, shortBreakMin, longBreakMin, roundsBeforeLongBreak } = s.settings
  return {
    mode: s.mode, isRunning: s.isRunning, secondsLeft: s.secondsLeft, roundMin: focusRoundMin, taskId: s.activeTask?.id ?? null,
    block: s.block, kept: s.kept, breakType: s.breakType, pomodoroStartIso: s.pomodoroStartIso, plan: { focusRoundMin, shortBreakMin, longBreakMin, roundsBeforeLongBreak },
  }
}

/** Start (on a task, or a plain round), pause/resume, stop — the tray's three focus moves. */
export function applyFocusCommand(c: FocusCommand): void {
  const s = useFocusStore.getState()
  if (c.type === 'toggle') return s.togglePlay()
  if (c.type === 'stop') {
    if (s.mode === 'pomodoro') s.resetRound()
    else s.setMode('pomodoro') // a break or the garden: back to a fresh, idle round
    return
  }
  // A task, or a plain round (focus D3: a block of one round from now) — the one Start focus path either way.
  beginFocus(c.task)
}

/** Main window: publish the timer, take commands. */
export function serveFocus(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(FOCUS_CHANNEL)
  const post = () => ch.postMessage({ kind: 'snapshot', s: focusSnapshot() } satisfies FocusMessage)
  const unsubscribe = useFocusStore.subscribe(post)
  ch.onmessage = (e: MessageEvent<FocusMessage>) => {
    if (e.data.kind === 'hello') post()
    else if (e.data.kind === 'command') applyFocusCommand(e.data.c)
  }
  return () => {
    unsubscribe()
    ch.close()
  }
}
