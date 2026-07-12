import { useEffect } from 'react'

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

/** Call with `active=true` while an overlay is open; it registers `onClose` as the topmost. */
export function useEscapeStack(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    stack.push(onClose)
    return () => {
      const i = stack.lastIndexOf(onClose)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [active, onClose])
}
