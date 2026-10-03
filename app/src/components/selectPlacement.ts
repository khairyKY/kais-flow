// Where a <Select>'s popover goes. Pure, and entirely in LAYOUT px: the caller divides the
// trigger rect and the viewport by the root zoom first (lib/uiScale.ts — rects and
// window.innerWidth are visual px, `position: fixed` offsets are layout px). At the default
// 125% (a user choice; the phone default until F2b) a 390px phone is ~312 layout px wide, and the old clamp against the raw innerWidth let
// the popover run off the right edge (FIX-6 follow-up, conductor decision 2026-09-26).

/** Gap kept between the popover and every viewport edge. */
export const SELECT_EDGE = 8
/** Estimated option row height for fine pointers (the rows size to their text, ~31px). */
export const SELECT_ROW_H = 32
/** Option row height on touch / coarse pointers: the 44px accessibility floor, in layout px like
 * X4's `kf-hit`, so it never drops below 44 on-screen at any interface size ≥100%. */
export const SELECT_TOUCH_ROW_H = 44
/** Border-box caps, as before (Tailwind's preflight makes every box border-box). */
export const SELECT_MAX_H = 320
export const SELECT_MIN_W = 160
export const SELECT_MAX_W = 320
/** The panel's padding (6px each side) + border (1px each side): rows need this much on top of
 * their own height to show without scrolling. */
export const SELECT_CHROME = 14
/** Space between trigger and popover. */
const GAP = 4

export interface TriggerRect {
  left: number
  top: number
  bottom: number
  width: number
}

export interface SelectPlacement {
  left: number
  top?: number
  bottom?: number
  /** Border-box sizes, for the panel's own style. */
  minWidth: number
  maxWidth: number
  maxHeight: number
  /** True under a coarse pointer — option rows get `minHeight: SELECT_TOUCH_ROW_H`. */
  touch: boolean
}

/** Keeps a panel `width` wide inside [EDGE, viewportWidth − EDGE]; one wider than the room pins
 * to the left edge (its maxWidth already caps it to the room). */
export function clampSelectLeft(left: number, width: number, viewportWidth: number): number {
  return Math.max(SELECT_EDGE, Math.min(left, viewportWidth - width - SELECT_EDGE))
}

/** Where a popover opened at a pointer goes (all LAYOUT px, like placeSelect): right of and below
 * the pointer, flipped to the pointer's other side on an axis where it would run past the edge,
 * then kept SELECT_EDGE inside the viewport — one taller/wider than the room pins to the top/left.
 * QuickCreate measures its real size and places with this (Kai 2026-10-03: at 150% it overran). */
export function placeAtPointer(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const axis = (at: number, size: number, room: number) => {
    const max = room - size - SELECT_EDGE
    if (at <= max) return Math.max(SELECT_EDGE, at) // fits after the pointer
    if (at - size >= SELECT_EDGE) return at - size // fits before it
    return Math.max(SELECT_EDGE, max) // neither: as close to the far edge as the room allows
  }
  return { left: axis(pointer.x, size.width, viewport.width), top: axis(pointer.y, size.height, viewport.height) }
}

export function placeSelect(
  trigger: TriggerRect,
  viewport: { width: number; height: number },
  optionCount: number,
  coarse: boolean,
): SelectPlacement {
  const rowHeight = coarse ? SELECT_TOUCH_ROW_H : SELECT_ROW_H
  const room = Math.max(0, viewport.width - 2 * SELECT_EDGE)
  const minWidth = Math.min(Math.max(trigger.width, SELECT_MIN_W), room)
  const maxWidth = Math.max(minWidth, Math.min(SELECT_MAX_W, room))

  // Below unless it doesn't fit there and above has more room; then cap the height to the side
  // it opens on (never below one row — the list scrolls).
  const wanted = Math.min(optionCount * rowHeight + SELECT_CHROME, SELECT_MAX_H)
  const spaceBelow = viewport.height - trigger.bottom - GAP - SELECT_EDGE
  const spaceAbove = trigger.top - GAP - SELECT_EDGE
  const below = wanted <= spaceBelow || spaceBelow >= spaceAbove
  const maxHeight = Math.max(rowHeight + SELECT_CHROME, Math.min(SELECT_MAX_H, below ? spaceBelow : spaceAbove))

  const left = clampSelectLeft(trigger.left, minWidth, viewport.width)
  return below
    ? { left, top: trigger.bottom + GAP, minWidth, maxWidth, maxHeight, touch: coarse }
    : { left, bottom: viewport.height - trigger.top + GAP, minWidth, maxWidth, maxHeight, touch: coarse }
}
