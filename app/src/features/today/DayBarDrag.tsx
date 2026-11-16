import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EmojiText } from '../../components/EmojiText'
import { longPress, tick } from '../../lib/haptics'
import { motionOnNow, reducedMotionNow } from '../../lib/motion'
import { uiZoom } from '../../lib/uiScale'
import type { CalendarEvent, Task } from '../../lib/types'
import { dropOnGrid } from '../calendar/gridDrop'
import { spanIso } from '../calendar/phoneGridMath'
import { slotAt } from '../calendar/slots'
import { RowLiftContext, type RowHold } from '../tasks/rowLift'
import { type BarDrop, BarDropContext } from './barDrop'
import { barMinute, overBar } from './dayBarMath'

// F1 (v1.6.4): drag a task onto the phone's Day bar. A hold on any task row (SwipeRow's 400ms) lifts it (the row
// reads RowLiftContext in useRowGrammar); a ghost follows the finger, and over the bar (./DayStripView, which reads
// BarDropContext) a line and a time bubble say where it would land, on the quarter hour. Let go on the bar and it
// goes where the calendar's own drop sends it (calendar/gridDrop dropOnGrid: into a Time block, else a block of
// the task's length, one Undo); let go anywhere else and the ghost eases back, no write. It is not PhoneGrid's
// carry: that one is built around the grid's columns and scroll, and this needs only x → minutes over one bar.

interface Lifted {
  task: Task
  w: number
  ox: number
  oy: number
  x: number
  y: number
}

interface Live {
  task: Task
  pointerId: number
  el: HTMLElement
  minute: number | null
  ox: number
  oy: number
}

export function DayBarDrag({ enabled, day, events, children }: {
  /** Phone, Day view, a day that can still be planned. Off: the rows' holds select, as before. */
  enabled: boolean
  /** The day the bar shows (YYYY-MM-DD, the user's zone). */
  day: string
  /** That day's calendar events (the Time blocks a drop can land in). */
  events: CalendarEvent[]
  children: ReactNode
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const live = useRef<Live | null>(null)
  const [lifted, setLifted] = useState<Lifted | null>(null)
  const [at, setAt] = useState<BarDrop['at']>(null)
  const latest = useRef({ day, events })
  latest.current = { day, events }
  const startIso = (m: number) => spanIso({ day: latest.current.day, start: m, end: m }).starts_at

  // A non-passive touchmove, there from the touch's start, is what keeps the page from scrolling under a lifted
  // row (the phone calendar's tray does the same); it only cancels while a row is lifted.
  useEffect(() => {
    if (!enabled) return
    const stop = (e: TouchEvent) => {
      if (live.current && e.cancelable) e.preventDefault()
    }
    // Capture, so it runs before the page scroller's boundary pull (lib/motion), which stands down for a prevented move.
    window.addEventListener('touchmove', stop, { passive: false, capture: true })
    return () => window.removeEventListener('touchmove', stop, { capture: true })
  }, [enabled])

  const lift = useCallback((task: Task, h: RowHold) => {
    if (live.current) return
    longPress()
    const z = uiZoom()
    const r = h.el.getBoundingClientRect()
    const s: Live = { task, pointerId: h.pointerId, el: h.el, minute: null, ox: h.x - r.left, oy: h.y - r.top }
    live.current = s
    h.el.dataset.lifted = ''
    setLifted({ task, w: r.width / z, ox: s.ox, oy: s.oy, x: h.x, y: h.y })

    const move = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return
      if (ghost.current) ghost.current.style.translate = `${(e.clientX - s.ox) / z}px ${(e.clientY - s.oy) / z}px`
      const r = barRef.current?.getBoundingClientRect()
      const minute = r && overBar(e.clientX, e.clientY, r) ? barMinute(e.clientX, r.left, r.width) : null
      if (minute === s.minute) return
      s.minute = minute
      if (minute !== null) tick() // one per quarter hour, as the phone calendar's carry does
      setAt(minute === null ? null : { minute, slotId: slotAt(latest.current.events, startIso(minute))?.id ?? null })
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      live.current = null
      // The finger that dropped is no tap on whatever is under it (the bar opens the calendar).
      const eat = (ev: MouseEvent) => (ev.stopPropagation(), ev.preventDefault())
      window.addEventListener('click', eat, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 400)
      const done = () => {
        delete s.el.dataset.lifted
        setLifted(null)
        setAt(null)
      }
      if (e.type === 'pointerup' && s.minute !== null) {
        dropOnGrid({ task }, startIso(s.minute), task.duration_min || 30, latest.current.events)
        return done()
      }
      // Off the bar (or the touch was taken from us): the ghost eases back to its row.
      const g = ghost.current
      if (!g || !s.el.isConnected || reducedMotionNow() || !motionOnNow()) return done()
      const home = s.el.getBoundingClientRect()
      const a = g.animate([{ translate: g.style.translate, opacity: 1 }, { translate: `${home.left / z}px ${home.top / z}px`, opacity: 0 }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' })
      a.onfinish = done
      a.oncancel = done
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only refs and the stable setters
  }, [])

  // A page that goes away mid-lift puts its row down.
  useEffect(() => () => {
    if (live.current) delete live.current.el.dataset.lifted
    live.current = null
  }, [])

  const drop = useMemo<BarDrop>(() => ({ barRef, lifting: !!lifted, at }), [lifted, at])
  const z = uiZoom()
  // One tree on or off: a page that flips `enabled` keeps its children mounted.
  return (
    <RowLiftContext.Provider value={enabled ? lift : null}>
      <BarDropContext.Provider value={enabled ? drop : null}>
        {children}
        {/* ds-ok: a drag ghost, not a popover — it has to sit over everything, under the finger */}
        {lifted && createPortal(
          <div ref={ghost} className="tp-lift" data-over={at ? "" : undefined} aria-hidden style={{ translate: `${(lifted.x - lifted.ox) / z}px ${(lifted.y - lifted.oy) / z}px`, width: lifted.w }}>
            <EmojiText text={lifted.task.title} />
          </div>,
          document.body,
        )}
      </BarDropContext.Provider>
    </RowLiftContext.Provider>
  )
}
