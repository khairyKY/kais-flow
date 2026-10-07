import { flushSync } from 'react-dom'
import { create } from 'zustand'

interface CommandBarState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Open state lives here (not local to CommandBar) so the global `n` shortcut in AppLayout can open it. */
export const useCommandBarStore = create<CommandBarState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}))

/** The capture field — the phone sheet's and the desktop bar's (one input, one id). */
export const CAPTURE_INPUT_ID = 'kf-capture-input'

/**
 * Opens the capture bar from a tap or click with the cursor already in it. Android WebView and iOS
 * Safari only raise the keyboard for a focus() made while that tap is being handled, so the bar
 * renders synchronously here (flushSync — AppLayout keeps CommandBar mounted once its chunk has
 * loaded) and is focused before this returns. Every tap/click opener calls this; hotkeys and the
 * tray can keep `setOpen(true)` (no on-screen keyboard to raise). If the chunk hasn't landed yet
 * the bar still opens and focuses itself a moment later — too late for a phone keyboard.
 */
export function openCapture(): void {
  flushSync(() => useCommandBarStore.getState().setOpen(true))
  document.getElementById(CAPTURE_INPUT_ID)?.focus()
}
