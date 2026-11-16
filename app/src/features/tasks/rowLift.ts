import { createContext } from 'react'
import type { Task } from '../../lib/types'

/** Where a hold took a row: the finger's pointer and spot (client px), and the row it lifts. */
export interface RowHold {
  pointerId: number
  x: number
  y: number
  el: HTMLElement
}

/** F1 (v1.6.4): a page that wants a held task row to lift instead of select — the phone Today's Day bar takes the
 * row to a time (features/today/DayBarDrag). Rows read it in useRowGrammar; null = a hold selects, as before. */
export const RowLiftContext = createContext<((task: Task, hold: RowHold) => void) | null>(null)
