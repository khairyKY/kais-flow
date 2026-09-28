import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  onUndo?: () => void
  /** Non-undo action rendered like the Undo button, e.g. { label: 'Jump there →', run: () => navigate(...) } */
  action?: { label: string; run: () => void }
}

interface ToastState {
  /** The whole queue, oldest first. Only the first TOAST_MAX_VISIBLE are on screen. */
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

// ── MK Undo Toast (DS-CHANGELOG §3): max two on screen, newest at the bottom, the older one
// above at 0.92; a third waits its turn instead of wiping the first Undo. Each toast lives
// 6s (--dur-toast-life) counted only while it is on screen and not touched/hovered, so the
// clock runs in ToastHost (one timer per visible card), not here. The store is just the queue. ──

export const TOAST_MAX_VISIBLE = 2
export const TOAST_LIFE_MS = 6000

/** The on-screen slice: oldest first (drawn above), the newest visible last (at the bottom). */
export function visibleToasts<T>(queue: readonly T[]): T[] {
  return queue.slice(0, TOAST_MAX_VISIBLE)
}

/** Life left after the clock ran from `since` to `now` — the pause/resume arithmetic. */
export function lifeLeft(left: number, since: number, now: number): number {
  return Math.max(0, left - (now - since))
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => set((s) => ({ toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
