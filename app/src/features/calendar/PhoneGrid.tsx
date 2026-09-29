import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Checkbox } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import { addDays, durationLabel, toMin } from '../../components/pickerMath'
import { longPress, tick } from '../../lib/haptics'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import type { CalendarEvent } from '../../lib/types'
import { LONG_PRESS_MS, SETTLE_MS, lockAxis } from '../tasks/swipe'
import { cairoTimeKey } from './eventTime'
import { layoutOverlaps } from './overlapLayout'
import { allDayOn, bubbleText, columnLabel, dayBlocks, dragSpan, eventSpan, minToPx, pxToMin, rangeText, swipeStep, type DragMode, type Span } from './phoneGridMath'

// ── The phone time grid (Calendar Phone.dc.html 7a–7n): 64px hours, blocks as fills (MK Week Strip
// look, radius 3), the MK Now line. Our own, not FullCalendar — the touch design needs a hold that
// lifts a block with a time bubble in the gutter, resize handles outside the block, a lift that stays
// until you tap elsewhere or press Back, and a day swipe where only the columns slide. ──

export interface BlockLook {
  /** Kind hue (CALENDAR.md §3): the fill and its ink. */
  fill: string
  ink: string
  /** Task blocks draw the 18px checkbox, always (never on hover only). */
  check?: { done: boolean; toggle: () => void }
}

export interface PhoneGridHandle {
  /** Today: the now line to the middle of the grid. */
  centerNow(): void
  /** Scroll so `minute` sits `offset` px under the grid's top edge. */
  scrollToMinute(minute: number, offset: number): void
  /** Screen rect of a span in the visible columns (a sheet draws its slot or block over the scrim). */
  rectOf(day: string, start: number, end: number): { left: number; top: number; width: number; height: number } | null
}

interface Lift {
  id: string
  orig: Span
  draft: Span
  /** What the finger is dragging; null = lifted and resting (finger up). */
  mode: DragMode | null
}

interface Props {
  days: string[]
  /** Days one swipe moves (1 · 3 · 7). */
  step: number
  today: string
  now: Date
  events: CalendarEvent[]
  look: (e: CalendarEvent) => BlockLook
  pending: ReadonlySet<string>
  loading: boolean
  onPage: (dir: 1 | -1) => void
  onTapSlot: (day: string, start: number) => void
  onTapBlock: (e: CalendarEvent) => void
  onCommit: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  /** Over the grid, not scrolling with it (the empty day). */
  overlay?: ReactNode
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const same = (a: Span, b: Span) => a.day === b.day && a.start === b.start && a.end === b.end

export const PhoneGrid = forwardRef<PhoneGridHandle, Props>(function PhoneGrid({ days, step, today, now, events, look, pending, loading, onPage, onTapSlot, onTapBlock, onCommit, overlay }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState<Lift | null>(null)
  const liftRef = useRef(lift)
  liftRef.current = lift
  const [swipeX, setSwipeX] = useState(0)
  const [settling, setSettling] = useState(false)
  const g = useRef({ id: -1, kind: 'idle' as 'idle' | 'press' | 'swipe' | 'drag', sx: 0, sy: 0, dx: 0, lastX: 0, lastT: 0, v: 0, timer: 0, swallow: false })
  const multi = days.length > 1
  const nowMin = toMin(cairoTimeKey(now))

  // Back (and Esc) puts a lifted block down before anything else closes.
  useEscapeStack(!!lift, () => setLift(null))
  useEffect(() => () => window.clearTimeout(g.current.timer), [])

  // A block picked up by a hold began as a pan-y touch: only a non-passive touchmove can keep the page
  // from scrolling under the drag (touch-action is fixed at touchstart). A day swipe likewise.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: TouchEvent) => {
      if (g.current.kind === 'drag' || g.current.kind === 'swipe') e.preventDefault()
    }
    el.addEventListener('touchmove', stop, { passive: false })
    return () => el.removeEventListener('touchmove', stop)
  }, [])

  const centerNow = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = minToPx(nowMin) - el.clientHeight / 2
  }
  useLayoutEffect(centerNow, []) // eslint-disable-line react-hooks/exhaustive-deps -- opening position only
  useImperativeHandle(ref, () => ({
    centerNow,
    scrollToMinute: (minute, offset) => {
      if (scrollRef.current) scrollRef.current.scrollTop = minToPx(minute) - offset
    },
    rectOf: (day, start, end) => {
      const r = trackRef.current?.getBoundingClientRect()
      const i = days.indexOf(day)
      if (!r || i < 0) return null
      const w = r.width / days.length
      const pxPerMin = r.height / 1440
      return { left: r.left + i * w + (multi ? 2 : 4), top: r.top + start * pxPerMin, width: w - (multi ? 4 : 20), height: (end - start) * pxPerMin }
    },
  }))

  const width = () => (trackRef.current?.getBoundingClientRect().width ?? 326) / uiZoom()

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary || settling) return
    const s = g.current
    const target = e.target as Element
    Object.assign(s, { id: e.pointerId, kind: 'idle', sx: e.clientX, sy: e.clientY, dx: 0, lastX: e.clientX, lastT: e.timeStamp, v: 0, swallow: false })
    window.clearTimeout(s.timer)
    const handle = target.closest<HTMLElement>('[data-pc-handle]')?.dataset.pcHandle as DragMode | undefined
    const blockEl = target.closest<HTMLElement>('.pc-block')
    const l = liftRef.current
    if (l && (handle || blockEl?.dataset.id === l.id)) {
      // The lifted block: its body moves, its handles resize — no second hold needed.
      s.kind = 'drag'
      s.swallow = true
      setLift({ ...l, draft: l.orig, mode: handle ?? 'move' })
      return
    }
    if (l) {
      setLift(null) // a tap anywhere else puts it down, and is only that
      s.swallow = true
      return
    }
    const ev = blockEl && events.find((x) => x.id === blockEl.dataset.id)
    if (!ev) return
    s.kind = 'press'
    s.timer = window.setTimeout(() => {
      // Held 400ms (--dur-longpress): the block lifts under the finger and follows it.
      longPress()
      const span = eventSpan(ev)
      setLift({ id: ev.id, orig: span, draft: span, mode: 'move' })
      s.kind = 'drag'
      s.swallow = true
    }, LONG_PRESS_MS)
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const s = g.current
    if (e.pointerId !== s.id) return
    const z = uiZoom()
    const dx = (e.clientX - s.sx) / z
    const dy = (e.clientY - s.sy) / z
    const dt = e.timeStamp - s.lastT
    if (dt > 0) s.v = (e.clientX - s.lastX) / z / dt
    s.lastX = e.clientX
    s.lastT = e.timeStamp
    if (s.kind === 'drag') {
      const l = liftRef.current
      if (!l?.mode) return
      const cols = days.length
      const col = days.indexOf(l.orig.day)
      const dDay = cols > 1 && col >= 0 ? Math.max(-col, Math.min(cols - 1 - col, Math.round(dx / (width() / cols)))) : 0
      const draft = dragSpan(l.orig, l.mode, pxToMin(dy), l.mode === 'move' ? dDay : 0)
      if (!same(draft, l.draft)) {
        tick() // one tick per 15-minute step
        setLift({ ...l, draft })
      }
      return
    }
    if (s.kind === 'idle' || s.kind === 'press') {
      const axis = lockAxis(dx, dy)
      if (!axis) return
      window.clearTimeout(s.timer) // moving is not holding
      if (axis === 'y') {
        s.id = -1 // a scroll: the page keeps it
        return
      }
      s.kind = 'swipe'
      s.swallow = true
    }
    s.dx = dx
    setSwipeX(dx)
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const s = g.current
    window.clearTimeout(s.timer)
    if (e.pointerId !== s.id) return
    s.id = -1
    const kind = s.kind
    s.kind = 'idle'
    if (kind === 'drag') {
      const l = liftRef.current
      if (!l) return
      const ev = events.find((x) => x.id === l.id)
      if (e.type !== 'pointercancel' && ev && l.mode && !same(l.draft, l.orig)) {
        onCommit(ev, l.orig, l.draft, l.mode)
        setLift(null)
      } else setLift({ ...l, draft: l.orig, mode: null }) // released without moving: it stays lifted
    } else if (kind === 'swipe') {
      // A finger that stopped before lifting (or a cancelled gesture) is not a fling.
      const v = e.type === 'pointercancel' || e.timeStamp - s.lastT > 100 ? 0 : s.v
      const dir = swipeStep(s.dx, v, width())
      setSettling(true)
      setSwipeX(dir ? -dir * width() : 0)
      window.setTimeout(() => {
        if (dir) onPage(dir)
        setSwipeX(0)
        setSettling(false)
      }, SETTLE_MS)
    }
  }

  function tapGrid(e: React.MouseEvent) {
    if ((e.target as Element).closest('.pc-block')) return
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return
    const col = Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - r.left) / r.width) * days.length)))
    onTapSlot(days[col], Math.floor(((e.clientY - r.top) / r.height) * 1440))
  }

  const sliding = swipeX !== 0 || settling
  const panes = sliding ? [-1, 0, 1] : [0]
  const inset = multi ? { l: 2, r: 2 } : { l: 4, r: 16 }

  function block(ev: CalendarEvent, start: number, end: number, geo: { left: string; width: string }) {
    const lifted = lift?.id === ev.id ? lift : null
    const s = lifted ? lifted.draft : { start, end }
    const h = minToPx(s.end - s.start)
    const lk = look(ev)
    const evStart = Date.parse(ev.starts_at)
    const evEnd = Date.parse(ev.ends_at)
    const t = now.getTime()
    const live = !lifted && evStart <= t && t < evEnd
    const past = !lifted && evEnd <= t
    // Two lines (title, then time) from 56px: always in the narrow columns, where the time can't sit
    // beside the title; in the day view for blocks without a checkbox (a task keeps its one row, 7f).
    const stacked = h >= 56 && (multi || !lk.check)
    const time = live ? `Now · ${durationLabel(Math.max(1, Math.ceil((evEnd - t) / 60_000)))} left` : rangeText(s.start, s.end)
    // A move into another column (3 days / week) slides the same node over, so the finger never loses it.
    const colShift = lifted ? days.indexOf(lifted.draft.day) - days.indexOf(lifted.orig.day) : 0
    const style = {
      top: minToPx(s.start),
      height: h,
      left: geo.left,
      width: geo.width,
      '--pc-fill': lk.fill,
      '--pc-ink': lk.ink,
      '--pc-shift': colShift ? `${(colShift * width()) / days.length}px` : undefined,
    } as CSSProperties
    return (
      <div
        key={ev.id}
        className={`pc-block${lifted ? ' is-lifted' : ''}${past ? ' is-past' : ''}${lk.check?.done ? ' is-done' : ''}`}
        data-id={ev.id}
        style={style}
        onClick={() => onTapBlock(ev)}
      >
        <div className={`pc-block-body${stacked ? ' is-stacked' : ''}`} style={{ height: stacked ? undefined : Math.min(32, h) }}>
          {lk.check && (
            <span className="pc-check" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <Checkbox subtask checked={lk.check.done} onChange={lk.check.toggle} label={ev.title} />
            </span>
          )}
          <span className="pc-name"><EmojiText text={ev.title} /></span>
          {(!multi || stacked) && <span className="pc-time">{time}</span>}
          {pending.has(ev.id) && <span className="pc-pending" role="img" aria-label="Pending sync" />}
        </div>
        {lifted && (
          <>
            <span className="pc-handle is-top" data-pc-handle="top" aria-hidden><i /></span>
            <span className="pc-handle is-bottom" data-pc-handle="bottom" aria-hidden><i /></span>
          </>
        )}
      </div>
    )
  }

  function column(day: string, live: boolean) {
    if (loading) {
      return (
        <div key={day} className="pc-col">
          {live && [[780, 840, 100], [900, 930, 76], [1080, 1140, 88]].map(([a, b, w]) => (
            <span key={a} className="pc-skel" style={{ top: minToPx(a), height: minToPx(b - a), left: inset.l, width: `calc(${w}% - ${inset.l + inset.r}px)` }} />
          ))}
        </div>
      )
    }
    const blocks = dayBlocks(events, day)
    const ov = layoutOverlaps(blocks.map((b) => ({ id: b.event.id, start: b.start, end: b.end })), lift?.id)
    const full = `(100% - ${inset.l + inset.r}px)`
    return (
      <div key={day} className="pc-col">
        {live && lift && lift.orig.day === day && (
          <span className="pc-ghost" style={{ top: minToPx(lift.orig.start), height: minToPx(lift.orig.end - lift.orig.start), left: inset.l, right: inset.r }} />
        )}
        {blocks.map((b) => {
          const slot = ov.get(b.event.id)
          if (slot?.kind === 'hidden') return null // ponytail: 4+ at once — no "+N more" on the phone yet
          const geo =
            slot?.kind === 'pair'
              ? { left: `calc(${inset.l}px + ${slot.lane} * (${full} / 2 + 2px))`, width: `calc(${full} / 2 - 2px)` }
              : slot?.kind === 'stack'
                ? { left: `calc(${inset.l}px + ${slot.lane} * 0.22 * ${full})`, width: `calc(0.56 * ${full})` }
                : { left: `${inset.l}px`, width: `calc${full}` }
          return block(b.event, b.start, b.end, geo)
        })}
      </div>
    )
  }

  const showNow = days.includes(today)
  // All-day events (the grid draws none): one chip row over the hours, only when the shown days hold one.
  const allDay = allDayOn(events, days)
  const bubble = lift && (lift.mode ?? 'move')
  return (
    <div className="pc-grid">
      {multi && (
        <div className="pc-colhead" style={{ transform: sliding ? `translateX(${swipeX}px)` : undefined }}>
          {days.map((d) => (
            <span key={d} className={d === today ? 'is-today' : undefined}>{columnLabel(d, days.length > 3)}</span>
          ))}
        </div>
      )}
      {allDay.length > 0 && (
        <div className="pc-allday">
          {allDay.map((e) => (
            <button key={e.id} type="button" className="pc-allday-chip" style={{ '--pc-fill': look(e).fill } as CSSProperties} onClick={() => onTapBlock(e)}>
              <EmojiText text={e.title} />
            </button>
          ))}
        </div>
      )}
      <div
        ref={scrollRef}
        className="pc-scroll"
        // A checkbox stops its own pointerdown (it never lifts), so the "swallow the next click" flag
        // left by a swipe is cleared here, in the capture phase, before anything else sees the press.
        onPointerDownCapture={() => {
          g.current.swallow = false
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()} // a long press on Android also fires contextmenu; the hold lifts
        onClickCapture={(e) => {
          if (!g.current.swallow) return
          g.current.swallow = false
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="pc-canvas" onClick={tapGrid}>
          {HOURS.map((h) => (
            <div key={h} className="pc-hour" style={{ top: h * 64 }}>
              <span>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>
              <i />
            </div>
          ))}
          {/* The track stays put (it clips the slide to the columns); the panes move. */}
          <div ref={trackRef} className={`pc-track${sliding ? ' is-sliding' : ''}`}>
            {panes.map((p) => {
              const pdays = p ? days.map((d) => addDays(d, p * step)) : days
              return (
                <div key={p} className={`pc-pane${multi ? ' is-multi' : ''}${days.length > 3 ? ' is-week' : ''}`} style={{ left: `${p * 100}%`, transform: sliding ? `translateX(${swipeX}px)` : undefined, transition: settling ? 'transform var(--dur-swipe-settle) var(--ease-standard)' : 'none' }}>
                  {pdays.map((d) => column(d, p === 0))}
                  {pdays.includes(today) && <span className="pc-nowline" style={{ top: minToPx(nowMin) }} />}
                </div>
              )
            })}
          </div>
          {showNow && !sliding && (
            <>
              <span className="pc-nowtag" style={{ top: minToPx(nowMin) }}>{cairoTimeKey(now)}</span>
              <span className="pc-nowdot" style={{ top: minToPx(nowMin) }} />
            </>
          )}
          {lift && bubble && (
            <span className="pc-bubble" style={{ top: minToPx(bubble === 'bottom' ? lift.draft.end : lift.draft.start) }}>{bubbleText(lift.draft, bubble)}</span>
          )}
        </div>
      </div>
      {overlay}
    </div>
  )
})
