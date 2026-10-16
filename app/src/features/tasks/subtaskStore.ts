import { create } from 'zustand'

// Subtasks in a list (A): each parent's fold, remembered on this device, and the one add line open
// (from the row's +, or ⋯ → Add a subtask). ponytail: a flat id list in localStorage — a few hundred
// parents at most; prune when it ever matters.

const KEY = 'kf.subtasks.folded'

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return [] // no storage (tests, a private window): this visit only
  }
}

interface SubtaskUi {
  folded: string[]
  /** The parent whose add line is open in a list, or null. */
  adding: string | null
  toggle: (parentId: string) => void
  /** Unfolds it (a search jump to a subtask, an add from the row). */
  show: (parentId: string) => void
  setAdding: (parentId: string | null) => void
}

export const useSubtaskUi = create<SubtaskUi>((set, get) => {
  const save = (folded: string[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(folded)) } catch { /* storage off: this visit only */ }
    set({ folded })
  }
  return {
    folded: load(),
    adding: null,
    toggle: (id) => save(get().folded.includes(id) ? get().folded.filter((f) => f !== id) : [...get().folded, id]),
    show: (id) => { if (get().folded.includes(id)) save(get().folded.filter((f) => f !== id)) },
    setAdding: (id) => {
      if (id) get().show(id)
      set({ adding: id })
    },
  }
})
