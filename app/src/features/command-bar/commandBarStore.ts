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
