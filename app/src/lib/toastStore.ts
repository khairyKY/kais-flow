import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  onUndo?: () => void
  /** Non-undo action rendered like the Undo button, e.g. { label: 'Jump there →', run: () => navigate(...) } */
  action?: { label: string; run: () => void }
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000) // Motion 3d: 4s dwell
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
