import { createContext, type RefObject } from 'react'

/** What the Day bar (./DayStripView) reads from the drag that carries a task onto it (./DayBarDrag). */
export interface BarDrop {
  /** The bar, for the finger's hit test. */
  barRef: RefObject<HTMLDivElement | null>
  /** A task is lifted: the bar shows even when the day is empty, so there is somewhere to drop. */
  lifting: boolean
  /** Over the bar: the quarter hour under the finger, and the Time block it would go into. */
  at: { minute: number; slotId: string | null } | null
}

export const BarDropContext = createContext<BarDrop | null>(null)
