// F7 · multi-day events — the resize grips on an all-day band bar's two real ends. FullCalendar can't do it: the band
// draws a span as one 1-day piece per day (Calendar 3e), and a one-day event has no room to shrink or grow. So the
// first piece grows a grip on its left edge and the last one on its right; a drag counts whole day-columns, a tip
// beside the pointer names the range it would leave, and letting go commits through `commit` (scope question + Undo).

/** One day-column's width on screen: a time-grid column or a month cell, else the piece itself. */
function columnWidth(el: HTMLElement): number {
  const cell = el.closest('.fc')?.querySelector<HTMLElement>('.fc-timegrid-col, .fc-daygrid-day')
  return cell?.getBoundingClientRect().width || el.getBoundingClientRect().width || 1
}

export function addSpanGrips(el: HTMLElement, o: { first: boolean; last: boolean; label: (edge: 'start' | 'end', days: number) => string; commit: (edge: 'start' | 'end', days: number) => void }): void {
  for (const edge of ['start', 'end'] as const) {
    if (edge === 'start' ? !o.first : !o.last) continue
    const grip = document.createElement('span')
    grip.className = `kf-seg-grip kf-seg-grip-${edge}`
    grip.setAttribute('aria-hidden', 'true')
    // FullCalendar's own drag starts on mousedown / touchstart: the grip keeps them to itself.
    for (const t of ['mousedown', 'touchstart', 'click', 'dblclick']) grip.addEventListener(t, (e) => e.stopPropagation())
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return
      ev.preventDefault()
      ev.stopPropagation()
      const x0 = ev.clientX
      const col = columnWidth(el)
      let days = 0
      const tip = document.createElement('div')
      tip.className = 'kf-seg-tip'
      document.body.appendChild(tip)
      grip.setPointerCapture(ev.pointerId)
      const move = (e: PointerEvent) => {
        days = Math.round((e.clientX - x0) / col)
        tip.textContent = o.label(edge, days)
        tip.style.left = `${e.clientX + 12}px`
        tip.style.top = `${e.clientY - 30}px`
      }
      const done = (e: PointerEvent, commit: boolean) => {
        grip.removeEventListener('pointermove', move)
        grip.removeEventListener('pointerup', up)
        grip.removeEventListener('pointercancel', cancel)
        if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId)
        tip.remove()
        if (commit && days) o.commit(edge, days)
      }
      const up = (e: PointerEvent) => done(e, true)
      const cancel = (e: PointerEvent) => done(e, false)
      grip.addEventListener('pointermove', move)
      grip.addEventListener('pointerup', up)
      grip.addEventListener('pointercancel', cancel)
      move(ev)
    })
    el.appendChild(grip)
  }
}
