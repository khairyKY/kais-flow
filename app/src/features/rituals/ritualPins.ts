import { useSyncExternalStore } from 'react'
import type { RitualKind } from './api'

// R4-5a (Kai's 2026-07-20 audit): "the rituals… shouldn't always be displayed there… the user
// should be able to choose whether they stay pinned." Pinned rituals ride the Today page;
// unpinned ones drop off it and are reached from Routines instead (R4-5b). A local preference,
// same shape as the sidebar-collapsed / plan-open flags — no schema change for a view toggle.

const KEY = 'kf.ritualPins'

function read(): Record<RitualKind, boolean> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { morning: true, evening: true, ...JSON.parse(raw) }
  } catch {
    /* private mode / bad JSON — fall through to the default */
  }
  return { morning: true, evening: true }
}

let snapshot = read()
const listeners = new Set<() => void>()

function emit() {
  snapshot = read()
  listeners.forEach((l) => l())
}

export function toggleRitualPin(kind: RitualKind): void {
  const next = { ...read(), [kind]: !read()[kind] }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode — the toggle just won't persist */
  }
  emit()
}

export function useRitualPins(): Record<RitualKind, boolean> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
    () => snapshot,
  )
}
