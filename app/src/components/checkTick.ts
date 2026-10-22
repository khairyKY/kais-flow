/** M3 (audit 2026-10-22): a kit box pops (boxFill + checkPop) only when it turns ticked while it is
 * on screen, never when it mounts ticked (a phone day swipe, a list opening, a view change). `pop`
 * stays on while the box stays ticked, so a re-render mid-pop never cuts the animation short; an
 * untick clears it, so the next tick pops again. Same object back when nothing changed. */
export interface CheckTick {
  checked: boolean
  pop: boolean
}
export const firstTick = (checked: boolean): CheckTick => ({ checked, pop: false })
export const nextTick = (prev: CheckTick, checked: boolean): CheckTick => (checked === prev.checked ? prev : { checked, pop: checked })
