import { useEffect, useRef } from 'react'

/**
 * One Escape key = one overlay closes: whichever registered last (topmost). Replaces the
 * five competing `document.addEventListener('keydown', ...)` Escape handlers that used to
 * live in CommandBar/SearchOverlay/ContextMenu/SnoozeMenu and would all fire at once.
 */
const stack: (() => void)[] = []

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const top = stack[stack.length - 1]
    if (top) {
      e.preventDefault()
      top()
    }
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
    const entry = () => closeRef.current()
    stack.push(entry)
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i !== -1) stack.splice(i, 1)
    }
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
