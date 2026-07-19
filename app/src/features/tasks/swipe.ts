// Row-swipe geometry + settle rule, pure so it's testable (TaskRow's useRowSwipe drives it).

export const SWIPE_RIGHT = 156 // Resched · Project · Snooze, 52px each
export const SWIPE_LEFT = 88 // Delete
export const DRAG_THRESHOLD = 8 // px of horizontal travel before a pointerdown becomes a drag
export const FLICK_VELOCITY = 0.5 // px/ms — a quick flick past this snaps even under halfway

/** Where the row rests after the pointer lifts: a fast flick snaps toward its direction
 * (closing first if the row was open the other way); otherwise nearest rest by position. */
export function settleSwipeX(x: number, velocity: number): number {
  if (velocity > FLICK_VELOCITY) return x < 0 ? 0 : SWIPE_RIGHT
  if (velocity < -FLICK_VELOCITY) return x > 0 ? 0 : -SWIPE_LEFT
  return x > SWIPE_RIGHT / 2 ? SWIPE_RIGHT : x < -SWIPE_LEFT / 2 ? -SWIPE_LEFT : 0
}
