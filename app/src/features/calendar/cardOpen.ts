import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useOpenTask } from '../tasks/openTask'

/** Past this, a press was a drag (FullCalendar's Draggable starts at 5px for a mouse). */
const DRAG_PX = 4

/** A not-yet-planned task's card (the rail, the day tray, planning mode) opens on a click, as a block
 * does (Kai 2026-10-17: "why can't I open the task if I am pressing it in the calendar before I plan
 * it" — Akiflow / Sunsama / Todoist: a click opens, a drag schedules). The popover hangs off the card.
 * The checkbox, Plan ▾ and ⋯ are dragGuard'd, so their clicks never reach here; a click inside the
 * card's own menu (portalled, but still its React child) is skipped. Enter on the focused card opens
 * it too. Spread the result onto the card. */
export function useCardOpen(taskId: string) {
  const openTask = useOpenTask()
  const down = useRef<{ x: number; y: number } | null>(null)
  return {
    tabIndex: 0,
    onPointerDown: (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY }
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.target as Node)) return
      const d = down.current
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return
      openTask(taskId, undefined, e.currentTarget)
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' || e.target !== e.currentTarget) return
      e.preventDefault()
      openTask(taskId, undefined, e.currentTarget)
    },
  }
}
