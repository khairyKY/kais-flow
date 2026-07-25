// A checkbox sitting on a draggable (a calendar block, an unscheduled rail card) has to swallow
// the gesture before the drag layer sees it. React's synthetic events can't do that here:
// FullCalendar binds native listeners on its own container, which sits BELOW React's root, so a
// synthetic stopPropagation runs too late. Binding natively on the element itself puts us first
// in the bubble path.
//
// Usage: <span ref={dragGuard(() => completeTask(t))}>…</span>

export function dragGuard(onActivate: () => void) {
  return (el: HTMLElement | null) => {
    if (!el) return
    const swallow = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
    }
    el.onpointerdown = swallow
    el.onmousedown = swallow
    el.ondragstart = swallow
    el.onclick = (e) => {
      swallow(e)
      onActivate()
    }
  }
}
