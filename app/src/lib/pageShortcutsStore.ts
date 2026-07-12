import { create } from 'zustand'

export interface ShortcutEntry {
  keys: string[]
  label: string
}

interface PageShortcutsState {
  section: string | null
  entries: ShortcutEntry[]
  set: (section: string, entries: ShortcutEntry[]) => void
  clear: () => void
}

/** Whichever list page is mounted registers its live key bindings here (via `useListKeys`) —
 * the `?` cheatsheet reads the same array it dispatches on, so the two can't drift apart. */
export const usePageShortcutsStore = create<PageShortcutsState>((set) => ({
  section: null,
  entries: [],
  set: (section, entries) => set({ section, entries }),
  clear: () => set({ section: null, entries: [] }),
}))
