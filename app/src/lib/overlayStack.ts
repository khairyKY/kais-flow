import { useEffect, useRef } from 'react'

/**
 * One Escape key = one overlay closes: whichever registered last (topmost). Replaces the
 * five competing `document.addEventListener('keydown', ...)` Escape handlers that used to
 * live in CommandBar/SearchOverlay/ContextMenu/SnoozeMenu and would all fire at once.
 * M1b: Android Back lands here too (lib/androidBack.ts) — sheets, menus, popovers, pickers,
 * rituals and selection mode all register, so Back closes them in the reverse of opening order.
 */
const stack: (() => void)[] = []

/** Registers `close` as the topmost overlay. Returns the unregister (safe to call in any order). */
export function pushOverlay(close: () => void): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i !== -1) stack.splice(i, 1)
  }
}

/** How many overlays are open — the tour waits while any is (features/tour). */
export const overlayCount = (): number => stack.length

/** Closes the topmost overlay; false when none is open. The overlay leaves the stack itself,
 * when it unmounts or goes inactive — an overlay that refuses to close stays on top. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeTopOverlay()) e.preventDefault()
  })
}

/** Call with `active=true` while an overlay is open; it registers `onClose` as the topmost.
 * F3 fix: the handler rides a ref so inline-arrow `onClose` props don't tear down and re-push
 * on every parent render — which silently re-promoted that overlay to topmost above whatever
 * genuinely opened later (drift-audit Esc-stack finding). Stack position now reflects true
 * open order; only `active` transitions move an entry. */
export function useEscapeStack(active: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!active) return
    return pushOverlay(() => closeRef.current())
  }, [active])
}

/** Body scroll lock, reference-counted so two overlays open at once don't unlock the body
 * when the first one closes. Prevents a full-screen overlay's backdrop click/scroll from
 * chaining to the page underneath. */
let lockCount = 0

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    lockCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      lockCount -= 1
      if (lockCount === 0) document.body.style.overflow = ''
    }
  }, [active])
}
