import { Draggable } from '@fullcalendar/interaction'
import { uiZoom } from '../../lib/uiScale'
import { LONG_PRESS_MS } from '../tasks/swipe'
import { cardDragData } from './planningMode'

// Where the pointer holds the lifted copy, at most (CSS px at 100%): a short grab in from its left edge,
// about its middle row — so the copy sits under the pointer whatever its width or the row's.
const GRAB_X = 24
const GRAB_Y = 11

/** slot-outline A (Kai's pick, 2026-10-16) for every card dragged onto the grid — a rail, day-tray or
 * planning card, or a task held in a Time slot (Kai 2026-10-21: "look at the ghost figure of the
 * block"). FullCalendar's copy on <body> is a compact lifted card (CalendarGrid.css
 * `body > .fc-event-dragging[data-title]`) that follows the pointer everywhere — over the grid too,
 * beside FullCalendar's placeholder, which would otherwise hide it — and the card's own place stays a
 * dashed outline (`data-lifted`) meanwhile. */
export function liftCards(drag: Draggable): void {
  const mirror = drag.dragging.mirror
  // FullCalendar places the copy from the card's rect, keeping the grab offset: the full row's, which
  // a narrower copy would leave beside the pointer. Re-centre that rect on the pointer.
  const start = mirror.start.bind(mirror)
  mirror.start = (el, pageX, pageY) => {
    start(el, pageX, pageY)
    const r = mirror.sourceElRect
    if (!r) return
    const z = uiZoom()
    const x = pageX - window.scrollX
    const y = pageY - window.scrollY
    const left = x - Math.min(Math.max(0, x - r.left), GRAB_X * z)
    const top = y - Math.min(Math.max(0, y - r.top), GRAB_Y * z)
    mirror.sourceElRect = { left, top, right: left + r.right - r.left, bottom: top + r.bottom - r.top }
  }
  // Only while a drag is under way: FullCalendar's press calls setIsVisible(false) as its reset, and a
  // click (no drag) never stops the mirror, so forcing it there would strand the copy.
  const show = mirror.setIsVisible.bind(mirror)
  let lifted: HTMLElement | null = null
  mirror.setIsVisible = (v: boolean) => show(v || !!lifted)
  drag.dragging.emitter.on('dragstart', (ev: { subjectEl: HTMLElement }) => {
    lifted = ev.subjectEl
    lifted.dataset.lifted = ''
  })
  // (destroy() mid-drag ends it with an empty event — hence the element held from dragstart)
  drag.dragging.emitter.on('dragend', () => {
    if (lifted) delete lifted.dataset.lifted
    lifted = null
  })
}

/** On touch a card lifts after the grid's own long press (drag-fix 2026-10-26): FullCalendar's Draggable
 * defaults to 1s, and a finger already travelling when that ends drops a quarter above where it lets go. */
export const CARD_DRAG = { eventData: cardDragData, longPressDelay: LONG_PRESS_MS }

/** One Draggable on a container of `.unscheduled-task` cards (the rail, the day tray, planning mode):
 * it delegates, so cards that come and go need no re-binding. */
export function cardDraggable(el: HTMLElement): Draggable {
  const drag = new Draggable(el, { itemSelector: '.unscheduled-task', ...CARD_DRAG })
  liftCards(drag)
  return drag
}
