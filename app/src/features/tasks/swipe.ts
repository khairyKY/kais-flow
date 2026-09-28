// Row gestures — the pure half of SwipeRow (DS-CHANGELOG §3 "Swipe row", Flow Audit §4: swipe
// right = Tomorrow, swipe left = Delete → Trash + Undo). Every distance here is CSS px: SwipeRow
// divides pointer deltas by the root zoom (lib/uiScale) before they get here.

export const TOUCH_SLOP = 8 // px a finger may drift before the gesture picks an axis
export const REVEAL_RIGHT = 196 // 4 + Tomorrow · Pick date · Project at 64 each (MK Swipe Row)
export const REVEAL_LEFT = 96 // Delete
export const SWIPE_COMMIT = 0.4 // --swipe-commit
export const FLICK_VELOCITY = 0.5 // px/ms — a flick opens (never commits) even under halfway
export const LONG_PRESS_MS = 400 // --dur-longpress
export const SETTLE_MS = 200 // --dur-swipe-settle (also the fly-off before a commit runs)

export type Axis = 'x' | 'y'

/** Direction lock. Undecided (null) until the finger leaves the slop; then sideways only when the
 * move is more horizontal than vertical — a tie or any steeper drift is a scroll, and the page
 * keeps it (the same split `touch-action: pan-y` makes, so there's no angle where nothing moves). */
export function lockAxis(dx: number, dy: number): Axis | null {
  if (Math.abs(dx) < TOUCH_SLOP && Math.abs(dy) < TOUCH_SLOP) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}

/** Where a full swipe commits: --swipe-commit (40%) of the row, but never inside the partial reveal
 * (+24). At 390 the three 64px actions already cover half the row, and a reveal that commits the
 * moment it opens could never rest open for a tap. */
export function commitAt(width: number, reveal: number): number {
  return Math.max(width * SWIPE_COMMIT, reveal + 24)
}

/** Past the commit line on either side — the one-action background shows and the haptic ticks. */
export function pastCommit(x: number, width: number): boolean {
  return x >= commitAt(width, REVEAL_RIGHT) || x <= -commitAt(width, REVEAL_LEFT)
}

export type SwipeEnd = 'close' | 'open-right' | 'open-left' | 'tomorrow' | 'delete'

/** What the row does when the finger lifts at `x`, moving at `velocity` px/ms. */
export function settleSwipe(x: number, velocity: number, width: number): SwipeEnd {
  if (x >= commitAt(width, REVEAL_RIGHT)) return 'tomorrow'
  if (x <= -commitAt(width, REVEAL_LEFT)) return 'delete'
  if (velocity > FLICK_VELOCITY) return x < 0 ? 'close' : 'open-right'
  if (velocity < -FLICK_VELOCITY) return x > 0 ? 'close' : 'open-left'
  if (x > REVEAL_RIGHT / 2) return 'open-right'
  if (x < -REVEAL_LEFT / 2) return 'open-left'
  return 'close'
}

/** The resting offset of each non-committing end. */
export const REST_X = { close: 0, 'open-right': REVEAL_RIGHT, 'open-left': -REVEAL_LEFT } as const
