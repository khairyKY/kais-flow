import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Checkbox, Chip } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { addDays, durationLabel, toMin } from '../../components/pickerMath'
import { longPress, tick } from '../../lib/haptics'
import { useMotionEnabled } from '../../lib/motion'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { clockText, hourLabel, useHour24 } from '../../lib/clock'
import type { CalendarEvent } from '../../lib/types'
import { LONG_PRESS_MS, SETTLE_MS, lockAxis } from '../tasks/swipe'
import { cairoTimeKey } from './eventTime'
import { layoutOverlaps } from './overlapLayout'
import { allDayOn, bubbleText, columnLabel, DAY_MIN, dayBlocks, dragSpan, edgeScrollSpeed, eventSpan, minToPx, pxToMin, rangeText, SNAP_MIN, spanIso, swipeStep, type DragMode, type Span } from './phoneGridMath'
import { slotAt } from './slots'
import '../tasks/TaskRow.css' // the long-press bloom (.kf-press-bloom)
import { bandChipLabel, isMultiDaySpan, spanDays } from './daySpans'
import { appZone } from '../../lib/appZone'

// ── The phone time grid (Calendar Phone.dc.html 7a–7n): 64px hours, blocks as fills (MK Week Strip
// look, radius 3), the MK Now line. Our own, not FullCalendar — the touch design needs a hold that
// lifts a block with a time bubble in the gutter, resize handles outside the block, a lift that stays
// until you tap elsewhere or press Back, a drag that scrolls the grid at its edges, and a day swipe
// where only the columns slide. ──

export interface BlockLook {
  /** Kind hue (CALENDAR.md §3): the fill and its ink. */
  fill: string
  ink: string
  /** Task blocks draw the 18px checkbox, always (never on hover only). */
  check?: { done: boolean; toggle: () => void }
  /** Replaces the time line — an overdue block's "Overdue · Replan" (Kai 2026-10-07). */
  note?: string
  /** A Time block's tasks (Time Slots, 0073) as rows under its title, and its "2 tasks · 45m of 2h" —
   * the desktop block's checklist: the box completes (with Undo), a tap opens the task. */
  slot?: { fill: string; held: { id: string; title: string; done: boolean; minutes: number; toggle: () => void; open: () => void }[] }
  /** A subtask's own block (Subtasks C): its parent's title, "↳ parent" on the time line. */
  parent?: string
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

/** slot-outline: a task held in a slot, lifted by a hold on its row (not the slot) and following the finger. */
interface HeldLift {
  taskId: string
  slotId: string
  title: string
  done: boolean
  minutes: number
  fill: string
  ink: string
  /** Where the finger took the row (client px) and the row's width, so it stays under the finger. */
  ox: number
  oy: number
  w: number
  x: number
  y: number
  /** The quarter under the finger; null off the grid (the strip): out of the slot. */
  at: { day: string; start: number } | null
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
  /** The "+N" chip on 4+ blocks at once: the blocks it stands for. */
  onTapMore: (hidden: CalendarEvent[]) => void
  onCommit: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  /** slot-outline: a held task's row dragged out of its slot and let go — `at` the quarter under the
   * finger, null off the grid. */
  onDropHeld?: (taskId: string, at: { day: string; start: number } | null) => void
  /** Over the grid, not scrolling with it (the empty day). */
  overlay?: ReactNode
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
// Kai 2026-10-07 (a 10-minute block was a clipped strip, its checkbox "[ ]", the handles over its
// text): every block draws at least one line of title (24px); under 25 minutes it's one compact line,
// title + time; from 56px the title wraps — as many 18px lines as fit over the time line, up to 3.
const MIN_BLOCK_PX = 24
const COMPACT_PX = minToPx(25)
const titleLines = (h: number) => Math.max(1, Math.min(3, Math.floor((h - 12 - 18) / 18)))
const same = (a: Span, b: Span) => a.day === b.day && a.start === b.start && a.end === b.end

export const PhoneGrid = forwardRef<PhoneGridHandle, Props>(function PhoneGrid({ days, step, today, now, events, look, pending, loading, onPage, onTapSlot, onTapBlock, onTapMore, onCommit, onDropHeld, overlay }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState<Lift | null>(null)
  const liftRef = useRef(lift)
  liftRef.current = lift
  const [held, setHeld] = useState<HeldLift | null>(null)
  const heldRef = useRef(held)
  heldRef.current = held
  const floatRef = useRef<HTMLDivElement>(null)
  // Effects 2l's long-press bloom on a held task's row while the hold counts (SwipeRow's).
  const motionOn = useMotionEnabled()
  const [bloom, setBloom] = useState<{ id: string; x: number; y: number; n: number; out: boolean } | null>(null)
  const drain = () => setBloom((b) => (b && !b.out ? { ...b, out: true } : b))
  useEffect(() => {
    if (!bloom?.out) return
    const t = window.setTimeout(() => setBloom(null), 200)
    return () => window.clearTimeout(t)
  }, [bloom])
  // S10 (2026-10-22 audit: a swipe re-rendered all three panes on every move): the offset is a CSS variable
  // on the grid, written as the finger moves; React hears once, when a swipe starts (the neighbour panes
  // mount) and when it settles.
  const gridRef = useRef<HTMLDivElement>(null)
  const setSwipe = (x: number) => gridRef.current?.style.setProperty('--pc-swipe', `${x}px`)
  const [sliding, setSliding] = useState(false)
  const [settling, setSettling] = useState(false)
  // st0: the grid's scrollTop at the press, so a drag that scrolls the grid (its edges) still tracks the finger.
  const g = useRef({ id: -1, kind: 'idle' as 'idle' | 'press' | 'swipe' | 'drag' | 'task', sx: 0, sy: 0, st0: 0, dx: 0, lastX: 0, lastY: 0, lastT: 0, v: 0, timer: 0, swallow: false, raf: 0, acc: 0 })
  const multi = days.length > 1
  const h24 = useHour24() // the person's clock (lib/clock) for the gutter and the now tag
  const nowMin = toMin(cairoTimeKey(now))

  // Back (and Esc) puts a lifted block down before anything else closes.
  useEscapeStack(!!lift, () => setLift(null))
  useEffect(
    () => () => {
      window.clearTimeout(g.current.timer)
      cancelAnimationFrame(g.current.raf)
    },
    [],
  )

  // A block picked up by a hold began as a pan-y touch: only a non-passive touchmove can keep the page
  // from scrolling under the drag (touch-action is fixed at touchstart). A day swipe likewise.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: TouchEvent) => {
      if (g.current.kind === 'drag' || g.current.kind === 'swipe' || g.current.kind === 'task') e.preventDefault()
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
      return { left: r.left + i * w + (multi ? 2 : 4), top: r.top + start * pxPerMin, width: w - (multi ? 4 : 20), height: Math.max((MIN_BLOCK_PX * pxPerMin) / minToPx(1), (end - start) * pxPerMin) }
    },
  }))

  const width = () => (trackRef.current?.getBoundingClientRect().width ?? 326) / uiZoom()

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary || settling) return
    const s = g.current
    const target = e.target as Element
    Object.assign(s, { id: e.pointerId, kind: 'idle', sx: e.clientX, sy: e.clientY, st0: scrollRef.current?.scrollTop ?? 0, dx: 0, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, v: 0, swallow: false })
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
    if (!ev || ev.source === 'gcal') return // a Google event (B1) never lifts — a tap still opens it
    s.kind = 'press'
    // slot-outline: a hold on a task row inside a slot lifts THAT task; the slot's header or empty
    // area still lifts the slot.
    const rowEl = target.closest<HTMLElement>('[data-slot-task]')
    const lk = rowEl ? look(ev) : undefined
    const task = lk?.slot?.held.find((t) => t.id === rowEl?.dataset.slotTask)
    if (task && rowEl && motionOn) {
      const r = rowEl.getBoundingClientRect()
      setBloom({ id: task.id, x: (e.clientX - r.left) / uiZoom(), y: (e.clientY - r.top) / uiZoom(), n: e.timeStamp, out: false })
    }
    s.timer = window.setTimeout(() => {
      // Held 400ms (--dur-longpress): the block lifts under the finger and follows it.
      longPress()
      if (task && rowEl && lk) {
        drain()
        const r = rowEl.getBoundingClientRect()
        s.kind = 'task'
        s.swallow = true
        heldRef.current = { taskId: task.id, slotId: ev.id, title: task.title, done: task.done, minutes: task.minutes, fill: lk.fill, ink: lk.ink, ox: s.sx - r.left, oy: s.sy - r.top, w: r.width, x: s.lastX, y: s.lastY, at: heldAt(s.lastX, s.lastY, task.minutes) }
        setHeld(heldRef.current)
        return
      }
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
    s.lastY = e.clientY
    s.lastT = e.timeStamp
    if (s.kind === 'drag' || s.kind === 'task') {
      if (s.kind === 'task') trackHeld()
      else track()
      if (!s.raf) {
        s.acc = 0
        s.raf = requestAnimationFrame((t) => edgeScroll(t, t - 16))
      }
      return
    }
    if (s.kind === 'idle' || s.kind === 'press') {
      const axis = lockAxis(dx, dy)
      if (!axis) return
      window.clearTimeout(s.timer) // moving is not holding
      drain()
      if (axis === 'y') {
        s.id = -1 // a scroll: the page keeps it
        return
      }
      s.kind = 'swipe'
      s.swallow = true
    }
    s.dx = dx
    if (!sliding) setSliding(true)
    setSwipe(dx)
  }

  /** The lifted block follows the finger on the 15-min grid — through any scroll since the press. */
  function track() {
    const s = g.current
    const l = liftRef.current
    if (!l?.mode) return
    const z = uiZoom()
    const dy = (s.lastY - s.sy) / z + (scrollRef.current?.scrollTop ?? s.st0) - s.st0
    const cols = days.length
    const col = days.indexOf(l.orig.day)
    const dDay = cols > 1 && col >= 0 ? Math.max(-col, Math.min(cols - 1 - col, Math.round((s.lastX - s.sx) / z / (width() / cols)))) : 0
    const draft = dragSpan(l.orig, l.mode, pxToMin(dy), l.mode === 'move' ? dDay : 0)
    if (same(draft, l.draft)) return
    tick() // one tick per 15-minute step
    liftRef.current = { ...l, draft } // the next frame of an edge scroll reads it before React re-renders
    setLift(liftRef.current)
  }

  /** slot-outline: the quarter under the finger on the shown days, room left for the task's own
   * minutes — null off the grid (above it: the strip; below: the tab bar). */
  function heldAt(cx: number, cy: number, minutes: number): { day: string; start: number } | null {
    const sr = scrollRef.current?.getBoundingClientRect()
    const tr = trackRef.current?.getBoundingClientRect()
    if (!sr || !tr || cx < sr.left || cx > sr.right || cy < sr.top || cy > sr.bottom) return null
    const col = Math.max(0, Math.min(days.length - 1, Math.floor(((cx - tr.left) / tr.width) * days.length)))
    const min = Math.floor((((cy - tr.top) / tr.height) * DAY_MIN) / SNAP_MIN) * SNAP_MIN
    return { day: days[col], start: Math.max(0, Math.min(DAY_MIN - minutes, min)) }
  }

  /** The lifted task follows the finger (moved in place, no re-render) and ticks once per quarter. */
  function trackHeld() {
    const s = g.current
    const h = heldRef.current
    if (!h) return
    const el = floatRef.current
    const z = uiZoom()
    if (el) {
      el.style.left = `${(s.lastX - h.ox) / z}px`
      el.style.top = `${(s.lastY - h.oy) / z}px`
    }
    const at = heldAt(s.lastX, s.lastY, h.minutes)
    if (at?.day === h.at?.day && at?.start === h.at?.start) return
    if (at) tick()
    heldRef.current = { ...h, x: s.lastX, y: s.lastY, at }
    setHeld(heldRef.current)
  }

  /** While the finger sits within 48px of the grid's top or bottom edge, the grid scrolls under it
   * (faster the deeper, capped) and the block keeps tracking, stopping at the day's ends. */
  function edgeScroll(t: number, last: number) {
    const s = g.current
    const el = scrollRef.current
    const z = uiZoom()
    const r = el?.getBoundingClientRect()
    // A lifted task scrolls the grid only while the finger is over it: above it is the strip.
    const on = s.kind === 'drag' ? !!liftRef.current?.mode : s.kind === 'task' && !!r && s.lastY >= r.top && s.lastY <= r.bottom
    const v = el && r && on ? edgeScrollSpeed(s.lastY / z, r.top / z, r.bottom / z) : 0
    if (!el || !v) {
      s.raf = 0
      return
    }
    s.acc += v * Math.min(t - last, 50) // whole pixels only: a fractional scrollTop can round away
    const px = Math.trunc(s.acc)
    s.acc -= px
    if (px) {
      // The browser stops at 00:00; 24:00 is ours to hold — a lifted block's handle hangs below the canvas.
      el.scrollTop = Math.min(el.scrollTop + px, minToPx(DAY_MIN) - el.clientHeight)
      if (s.kind === 'task') trackHeld()
      else track()
    }
    s.raf = requestAnimationFrame((next) => edgeScroll(next, t))
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const s = g.current
    window.clearTimeout(s.timer)
    drain()
    if (e.pointerId !== s.id) return
    s.id = -1
    const kind = s.kind
    s.kind = 'idle'
    if (kind === 'task') {
      const h = heldRef.current
      heldRef.current = null
      setHeld(null)
      if (e.type !== 'pointercancel' && h) onDropHeld?.(h.taskId, h.at)
    } else if (kind === 'drag') {
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
      setSwipe(dir ? -dir * width() : 0)
      window.setTimeout(() => {
        if (dir) onPage(dir)
        setSwipe(0)
        setSettling(false)
        setSliding(false)
      }, SETTLE_MS)
    }
  }

  function tapGrid(e: React.MouseEvent) {
    if ((e.target as Element).closest('.pc-block, .pc-more')) return
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return
    const col = Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - r.left) / r.width) * days.length)))
    onTapSlot(days[col], Math.floor(((e.clientY - r.top) / r.height) * 1440))
  }

  const panes = sliding ? [-1, 0, 1] : [0]
  const inset = multi ? { l: 2, r: 2 } : { l: 4, r: 16 }

  /** Calendar 3e "spans midnight": the open edge of a piece cut at 00:00 says where the block runs on. */
  const clock = (ms: number) => clockText(cairoTimeKey(new Date(ms)))
  // slot-outline: where a lifted task would land — another Time block takes it (ringed), empty time
  // gets its own block (a dashed ghost + the time bubble), its own slot nothing.
  const heldIso = held?.at ? spanIso({ day: held.at.day, start: held.at.start, end: held.at.start + held.minutes }).starts_at : null
  const heldInto = heldIso ? slotAt(events, heldIso) : undefined
  const heldGhost = held?.at && !heldInto ? held.at : null
  function block(ev: CalendarEvent, start: number, end: number, geo: { left: string; width: string }, cut: { from: boolean; into: boolean } = { from: false, into: false }) {
    const lifted = lift?.id === ev.id ? lift : null
    const s = lifted ? lifted.draft : { start, end }
    const h = Math.max(MIN_BLOCK_PX, minToPx(s.end - s.start))
    const lk = look(ev)
    const evStart = Date.parse(ev.starts_at)
    const evEnd = Date.parse(ev.ends_at)
    const t = now.getTime()
    const live = !lifted && evStart <= t && t < evEnd
    const past = !lifted && evEnd <= t
    // Title, then time on its own line, from 56px — task blocks too since Kai 2026-10-07 ("Crypto —
    // heavy sessio…" on one line of a 1h30 block, the rest empty); under that, one row.
    const stacked = h >= 56
    const cutFrom = !lifted && cut.from
    const cutInto = !lifted && cut.into
    const clockLine = lk.note ?? (live ? `Now · ${durationLabel(Math.max(1, Math.ceil((evEnd - t) / 60_000)))} left` : cutFrom || cutInto ? '' : rangeText(s.start, s.end))
    const time = lk.parent ? `${clockLine ? `${clockLine} · ` : ''}↳ ${lk.parent}` : clockLine
    // room for the cut's own line under / over the title (a sliver keeps just its title)
    const cutRoom = h >= 48
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
        className={`pc-block${lifted ? ' is-lifted' : ''}${heldInto && heldInto.id === ev.id && held?.slotId !== ev.id ? ' is-drop' : ''}${past ? ' is-past' : ''}${lk.check?.done ? ' is-done' : ''}${h < COMPACT_PX ? ' is-compact' : ''}${lk.note ? ' is-noted' : ''}${cutFrom ? ' is-cut-from' : ''}${cutInto ? ' is-cut-into' : ''}${cutRoom && cutFrom ? ' has-cut-label' : ''}`}
        data-id={ev.id}
        data-tour="calendar-block"
        style={{ ...style, '--pc-lines': lk.slot ? 1 : titleLines(h) } as CSSProperties}
        onClick={() => onTapBlock(ev)}
      >
        <div className={`pc-block-body${stacked ? ' is-stacked' : ''}`} style={{ height: stacked ? undefined : Math.min(32, h) }}>
          {lk.check && (
            <span className="pc-check" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <Checkbox subtask checked={lk.check.done} onChange={lk.check.toggle} label={ev.title} />
            </span>
          )}
          <span className="pc-name"><EmojiText text={ev.title} /></span>
          {(!multi || stacked) && time && (
            <span className="pc-time">
              {/* C10: one occurrence of a repeating event */}
              {ev.recurrence_rule && <Icon name="repeat" size={11} label="Repeats" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 4 }} />}
              {time}
            </span>
          )}
          {pending.has(ev.id) && <span className="pc-pending" role="img" aria-label="Pending sync" />}
          {/* Time Slots (0073): the rows clip with the body. A hold on a row lifts its task (slot-outline),
              and its place stays dashed while it's out; the box stops its own press, as the block's does. */}
          {lk.slot && stacked && !lifted && (
            <div className="pc-slot">
              <span className="pc-time pc-slot-fill">{lk.slot.fill}</span>
              {lk.slot.held.map((t) => (
                <div
                  key={t.id}
                  className={`pc-slot-row${t.done ? ' is-done' : ''}${held?.taskId === t.id ? ' is-gone' : ''}`}
                  data-slot-task={t.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    t.open()
                  }}
                >
                  <span className="pc-check" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <Checkbox subtask checked={t.done} onChange={t.toggle} label={t.title} />
                  </span>
                  <span className="pc-name"><EmojiText text={t.title} /></span>
                  {bloom?.id === t.id && (
                    <span className="kf-press-bloom-clip" data-out={bloom.out || undefined} aria-hidden="true">
                      <span key={bloom.n} className="kf-press-bloom" style={{ left: bloom.x, top: bloom.y }} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {cutRoom && cutFrom && <span className="pc-cut is-from" aria-hidden>⌃ from {clock(evStart)}</span>}
        {cutRoom && cutInto && <span className="pc-cut is-into" aria-hidden>⌄ {clock(evEnd)}</span>}
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
        {live && held && heldGhost?.day === day && (
          <span className="pc-ghost is-held" style={{ top: minToPx(heldGhost.start), height: minToPx(held.minutes), left: inset.l, right: inset.r }} />
        )}
        {blocks.map((b) => {
          const slot = ov.get(b.event.id)
          if (slot?.kind === 'hidden') return null // 4+ at once: under the topmost's "+N" chip
          const geo =
            slot?.kind === 'pair'
              ? { left: `calc(${inset.l}px + ${slot.lane} * (${full} / 2 + 2px))`, width: `calc(${full} / 2 - 2px)` }
              : slot?.kind === 'stack'
                ? // three equal lanes, 4px gutters (Kai 2026-10-14: the 56%/22% shingle buried the later blocks)
                  { left: `calc(${inset.l}px + ${slot.lane} * ((${full} - 8px) / 3 + 4px))`, width: `calc((${full} - 8px) / 3)` }
                : { left: `${inset.l}px`, width: `calc${full}` }
          return block(b.event, b.start, b.end, geo, b)
        })}
        {/* At most three drawn at once; the rest collapse into "+N" at the top-right of the stack. */}
        {blocks.map((b) => {
          const slot = ov.get(b.event.id)
          if (slot?.kind !== 'stack' || !slot.hidden.length || lift?.id === b.event.id) return null
          const hidden = slot.hidden.map((id) => events.find((x) => x.id === id)).filter((x) => x !== undefined)
          return (
            <span key={`more-${b.event.id}`} className="pc-more" style={{ top: minToPx(b.start) + 2, right: inset.r + 2 }}>
              <Chip tone="bordered" style={{ height: 'var(--sp-6)', padding: '0 var(--sp-2)', background: 'var(--paper-parchment)' }} onClick={() => onTapMore(hidden)}>
                +{hidden.length}
              </Chip>
            </span>
          )
        })}
      </div>
    )
  }

  const showNow = days.includes(today)
  // All-day events (the grid draws none): one chip row over the hours, only when the shown days hold one.
  const allDay = allDayOn(events, days)
  const zone = appZone()
  const bubble = lift && (lift.mode ?? 'move')
  return (
    <div className="pc-grid" ref={gridRef}>
      {multi && (
        <div className="pc-colhead" style={{ transform: sliding ? 'translateX(var(--pc-swipe, 0px))' : undefined, transition: settling ? 'transform var(--dur-swipe-settle) var(--ease-standard)' : 'none' }}>
          {days.map((d) => (
            <span key={d} className={d === today ? 'is-today' : undefined}>{columnLabel(d, days.length > 3)}</span>
          ))}
        </div>
      )}
      {allDay.length > 0 && (
        <div className="pc-allday">
          {allDay.map((e) => {
            // Calendar 3e: a multi-day span's chip reads « / » where it runs past the days shown.
            const span = isMultiDaySpan(e, zone) ? spanDays(e, zone) : null
            const cls = `pc-allday-chip${span && span.first < days[0] ? ' is-from' : ''}${span && span.last > days[days.length - 1] ? ' is-into' : ''}`
            return (
              <button key={e.id} type="button" className={cls} style={{ '--pc-fill': look(e).fill } as CSSProperties} onClick={() => onTapBlock(e)}>
                <EmojiText text={span ? bandChipLabel(e, days, zone, clock) : e.title} />
              </button>
            )
          })}
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
              <span>{h ? hourLabel(h, h24) : ''}</span>
              <i />
            </div>
          ))}
          {/* The track stays put (it clips the slide to the columns); the panes move. */}
          <div ref={trackRef} className={`pc-track${sliding ? ' is-sliding' : ''}`}>
            {panes.map((p) => {
              const pdays = p ? days.map((d) => addDays(d, p * step)) : days
              return (
                <div key={p} className={`pc-pane${multi ? ' is-multi' : ''}${days.length > 3 ? ' is-week' : ''}`} style={{ left: `${p * 100}%`, transform: sliding ? 'translateX(var(--pc-swipe, 0px))' : undefined, transition: settling ? 'transform var(--dur-swipe-settle) var(--ease-standard)' : 'none' }}>
                  {pdays.map((d) => column(d, p === 0))}
                  {pdays.includes(today) && <span className="pc-nowline" style={{ top: minToPx(nowMin) }} />}
                </div>
              )
            })}
          </div>
          {showNow && !sliding && (
            <>
              <span className="pc-nowtag" style={{ top: minToPx(nowMin) }}>{clockText(cairoTimeKey(now), h24)}</span>
              <span className="pc-nowdot" style={{ top: minToPx(nowMin) }} />
            </>
          )}
          {lift && bubble && (
            <span className="pc-bubble" style={{ top: minToPx(bubble === 'bottom' ? lift.draft.end : lift.draft.start) }}>{bubbleText(lift.draft, bubble)}</span>
          )}
          {held && heldGhost && <span className="pc-bubble" style={{ top: minToPx(heldGhost.start) }}>{rangeText(heldGhost.start, heldGhost.start + held.minutes)}</span>}
        </div>
      </div>
      {overlay}
      {/* slot-outline: the lifted task, fixed under the finger wherever it goes (over the strip too). */}
      {held && (
        <div
          ref={floatRef}
          className="pc-held-task"
          data-held-task={held.taskId}
          style={{ left: (held.x - held.ox) / uiZoom(), top: (held.y - held.oy) / uiZoom(), width: held.w / uiZoom(), '--pc-fill': held.fill, '--pc-ink': held.ink } as CSSProperties}
          aria-hidden
        >
          <span className="pc-check">
            <Checkbox subtask checked={held.done} label={held.title} />
          </span>
          <span className="pc-name"><EmojiText text={held.title} /></span>
        </div>
      )}
    </div>
  )
})
