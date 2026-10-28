import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { reducedMotionNow } from '../lib/motion'
import './Collapse.css'

/** T8 — the one fold-out for the whole app (Today's folds, Show more, subtasks, the Inbox GitHub fold,
 * the Plan drawer, ritual sections, Weekly Review, Trash's confirm cards, DoneView): the section eases
 * open and shut, grid-template-rows 0fr ↔ 1fr over --dur-collapse on --ease-standard, instead of
 * mounting in one frame and shoving everything under it. Functional motion (RM2): it plays with
 * Effects off and is a cut under reduced motion.
 *
 * Closed, the children unmount once the fold has shut (as a plain `{open && …}` did), so nothing
 * hidden stays mounted. Padding and margins belong INSIDE the children — anything on the inner box
 * would stop it folding to zero. */
const COLLAPSE_MS = 200

export function Collapse({ open, children, className, ...rest }: { open: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  // Where the fold last came to rest; `open !== settled` = moving.
  const [settled, setSettled] = useState(open)
  useEffect(() => {
    if (open === settled) return
    const t = window.setTimeout(() => setSettled(open), reducedMotionNow() ? 0 : COLLAPSE_MS)
    return () => window.clearTimeout(t)
  }, [open, settled])
  return (
    <div {...rest} className={className ? `kf-collapse ${className}` : 'kf-collapse'} data-open={open || undefined} data-moving={open !== settled || undefined} inert={!open || undefined}>
      <div className="kf-collapse-inner">{(open || settled) && children}</div>
    </div>
  )
}
