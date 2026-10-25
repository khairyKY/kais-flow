import { useEffect, useRef, useState } from 'react'
import type { FocusableTask } from '../today/startFocus'

// The tray's own windows (the flyout, the right-click menu) show the main window's one focus timer and
// drive it over this channel; ./focusChannel is the main window's side. Kept apart from it so neither
// tray window loads the focus store. BroadcastChannel: same-origin windows only, nothing leaves the device.

export const FOCUS_CHANNEL = 'kf-focus'

export interface FocusSnapshot {
  mode: 'pomodoro' | 'break' | 'stopwatch' | 'garden'
  isRunning: boolean
  secondsLeft: number
  roundMin: number
  taskId: string | null
}

export type FocusCommand = { type: 'start'; task: FocusableTask | null } | { type: 'toggle' } | { type: 'stop' }

export type FocusMessage = { kind: 'snapshot'; s: FocusSnapshot } | { kind: 'hello' } | { kind: 'command'; c: FocusCommand }

/** A round under way: running, or paused part-way (then Stop, not Start). */
export function inRound(f: FocusSnapshot | null): boolean {
  return !!f && (f.isRunning || (f.mode === 'pomodoro' && f.secondsLeft < f.roundMin * 60))
}

/** "18:42" */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The main window's timer, live (null until it answers), and a way to drive it. */
export function useFocusMirror(): [FocusSnapshot | null, (c: FocusCommand) => void] {
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null)
  const ch = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const c = new BroadcastChannel(FOCUS_CHANNEL)
    ch.current = c
    c.onmessage = (e: MessageEvent<FocusMessage>) => {
      if (e.data.kind === 'snapshot') setSnapshot(e.data.s)
    }
    const hello = () => c.postMessage({ kind: 'hello' } satisfies FocusMessage)
    hello()
    // The tray windows are hidden and shown, not reloaded: ask again whenever one comes back.
    window.addEventListener('focus', hello)
    return () => {
      window.removeEventListener('focus', hello)
      c.close()
      ch.current = null
    }
  }, [])
  return [snapshot, (c) => ch.current?.postMessage({ kind: 'command', c } satisfies FocusMessage)]
}
