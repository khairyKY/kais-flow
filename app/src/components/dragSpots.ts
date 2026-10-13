import { useCallback, useState, useSyncExternalStore } from 'react'

// The light half of the drag kit (components/drag.tsx), so the shell never loads @dnd-kit at start.
// The sidebar's filing spots (Today, Due Today, Someday) register their element here; whichever page
// has something to drag holds the DragShell (one DndContext, loaded with that page) and turns every
// registered spot into a drop target, handing the spot back its class while something is over it.

/** A place something can be dropped. `label` is what a screen reader hears. */
export interface Spot {
  kind: string
  label: string
}

/** What's in hand. `verdict` (method syntax, so a load typed for its own spots still fits here):
 * true = takes it, false = refuses it (the soft no), null = not a place for this load at all. */
export interface DragLoad<S extends Spot = Spot> {
  /** Everything lifted together — the selection, when the row is part of one. */
  ids: readonly string[]
  /** What the ghost says (the first one's title). */
  label: string
  verdict(spot: S): boolean | null
  drop(spot: S): void
}

export interface ShellSpot {
  el: HTMLElement
  spot: Spot
  setClass: (className: string) => void
}

const spots = new Map<string, ShellSpot>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => {
  version++
  listeners.forEach((fn) => fn())
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The registered shell spots (DragShell reads them; re-renders when one comes or goes). */
export function useShellSpots(): ReadonlyMap<string, ShellSpot> {
  useSyncExternalStore(subscribe, () => version)
  return spots
}

/** A shell element that is a drop spot: spread `ref` and `className` on it. Inert until a page with
 * a DragShell is open; then it opens / warms like any spot (kf-drop-over / kf-drop-no). */
export function useShellSpot(id: string, spot: Spot | null): { ref: (el: HTMLElement | null) => void; className: string } {
  const [className, setClass] = useState('')
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (el && spot) spots.set(id, { el, spot, setClass })
      else if (spots.has(id)) spots.delete(id)
      else return
      changed()
    },
    [id, spot],
  )
  return { ref, className }
}
