import { useEffect, useRef, useState } from 'react'
import { useFocusStore } from '../focus/focusStore'
import { beginFocus, type FocusableTask } from '../today/startFocus'

// The tray flyout is a second window on the same app; the one focus timer lives in the main window
// (focusStore, driven by the shell's ticker). This channel mirrors it: the main window posts every
// change and obeys commands, the flyout shows the mirror and sends commands. BroadcastChannel —
// same-origin windows only, nothing leaves the device.

const NAME = 'kf-focus'

export interface FocusSnapshot {
  mode: 'pomodoro' | 'break' | 'stopwatch' | 'garden'
  isRunning: boolean
  secondsLeft: number
  roundMin: number
  taskId: string | null
}

export type FocusCommand = { type: 'start'; task: FocusableTask | null } | { type: 'toggle' } | { type: 'stop' }

type Message = { kind: 'snapshot'; s: FocusSnapshot } | { kind: 'hello' } | { kind: 'command'; c: FocusCommand }

export function focusSnapshot(): FocusSnapshot {
  const s = useFocusStore.getState()
  return { mode: s.mode, isRunning: s.isRunning, secondsLeft: s.secondsLeft, roundMin: s.settings.focusRoundMin, taskId: s.activeTask?.id ?? null }
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
  if (c.task) return beginFocus(c.task)
  if (s.mode !== 'pomodoro') s.setMode('pomodoro')
  if (!useFocusStore.getState().isRunning) useFocusStore.getState().togglePlay()
}

/** Main window: publish the timer, take commands. */
export function serveFocus(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(NAME)
  const post = () => ch.postMessage({ kind: 'snapshot', s: focusSnapshot() } satisfies Message)
  const unsubscribe = useFocusStore.subscribe(post)
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data.kind === 'hello') post()
    else if (e.data.kind === 'command') applyFocusCommand(e.data.c)
  }
  return () => {
    unsubscribe()
    ch.close()
  }
}

/** Flyout: the main window's timer, live (null until it answers), and a way to drive it. */
export function useFocusMirror(): [FocusSnapshot | null, (c: FocusCommand) => void] {
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null)
  const ch = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const c = new BroadcastChannel(NAME)
    ch.current = c
    c.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.kind === 'snapshot') setSnapshot(e.data.s)
    }
    const hello = () => c.postMessage({ kind: 'hello' } satisfies Message)
    hello()
    // The flyout is hidden and shown, not reloaded: ask again whenever it comes back.
    window.addEventListener('focus', hello)
    return () => {
      window.removeEventListener('focus', hello)
      c.close()
      ch.current = null
    }
  }, [])
  return [snapshot, (c) => ch.current?.postMessage({ kind: 'command', c } satisfies Message)]
}
