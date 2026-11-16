import { FLICK_VELOCITY } from '../tasks/swipe'

// F1 (v1.6.4): the pure half of the phone Day bar's two gestures — where a finger over the bar is on the
// clock, and whether a sideways drag on it turns the day. DayStripView draws the bar; ./DayBarDrag carries the task.

/** The bar's range: 7 AM to 11 PM. */
export const BAR_FROM = 7
export const BAR_TO = 23
const SNAP = 15
const COMMIT_PX = 48

/** Minutes since midnight for a finger at `x` over a bar spanning `left`..`left + width`, floored to the quarter
 * hour (14:20 → 14:15) and kept inside the bar (the last quarter is 22:45). */
export function barMinute(x: number, left: number, width: number): number {
  const f = width > 0 ? Math.min(1, Math.max(0, (x - left) / width)) : 0
  const m = Math.floor((BAR_FROM * 60 + f * (BAR_TO - BAR_FROM) * 60) / SNAP) * SNAP
  return Math.min(m, BAR_TO * 60 - SNAP)
}

/** Is the finger on the bar? The bar's box, plus a thumb's slack (8 across, 16 above and below): the ghost row
 * hides the bar under the finger, so the target has to forgive. */
export function overBar(x: number, y: number, r: { left: number; right: number; top: number; bottom: number }): boolean {
  return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 16 && y <= r.bottom + 16
}

/** A sideways drag of `dx` px ending at `v` px/ms: +1 (the next day) for a drag left, -1 for one right, 0 when
 * it was neither far (48px) nor a flick (over FLICK_VELOCITY the same way). */
export function dayStep(dx: number, v: number): -1 | 0 | 1 {
  if (dx <= -COMMIT_PX || (dx < 0 && v <= -FLICK_VELOCITY)) return 1
  if (dx >= COMMIT_PX || (dx > 0 && v >= FLICK_VELOCITY)) return -1
  return 0
}
