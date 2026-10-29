// cal-scroll (Kai 2026-10-29: "calendars should be horizontally scrollable" — glide through days, as Notion
// Calendar and Amie do). The desktop grid renders the days on screen plus a buffer either side (CalendarGrid's
// views), each day column `visible / width` wide, and FullCalendar's three scrollers (the day row, the all-day
// band, the hours) are moved sideways together from here — one scrollLeft each, written in the same frame, so the
// header never trails the columns. FullCalendar's drag code reads those scrollers' scrollLeft (its OffsetTracker
// follows every scrolling ancestor), so a drag keeps landing on the right day mid-glide, and its AutoScroller
// slides them at the left/right edge while a block is held there.
//
// A gesture: a trackpad's sideways swipe (its momentum included — the OS sends it as more wheel events) or
// Shift + the wheel moves the days 1:1; when the wheel goes quiet the days settle on a day boundary (eased; at
// once with reduced motion), and CalendarGrid re-centres the buffer around the day that settled at the left —
// FullCalendar redraws synchronously and the scroll is put back in the same task, so nothing jumps. Near the
// buffer's end mid-gesture it re-centres there and then, so a long fling never hits a wall.
import { reducedMotionNow } from '../../lib/motion'
import { markQuietScroll } from '../../lib/quietScroll'

/** A gesture commits to the next day once it has moved this share of a column its way (a mouse notch is ~100px). */
export const SETTLE_BIAS = 0.15
/** No wheel event for this long ends a gesture (a trackpad's momentum events come every ~16ms). */
export const QUIET_MS = 140
/** A settled glide re-centres the buffer this long after, out of the way of the next gesture (a redraw of every
 * drawn day is FullCalendar's one heavy step — never inside a glide's frames). */
export const RECENTER_IDLE_MS = 220

/** Re-centre once less than half a screen of drawn days is left on either side of column `i`. */
export const needsRecenter = (i: number, last: number, visible: number): boolean => Math.min(i, last - i) < Math.ceil(visible / 2)

/** The column a gesture settles on: `pos` in columns, `dir` the way it last moved (0: the nearest). */
export function settleIndex(pos: number, dir: number, last: number): number {
  const i = dir > 0 ? Math.ceil(pos - SETTLE_BIAS) : dir < 0 ? Math.floor(pos + SETTLE_BIAS) : Math.round(pos)
  return Math.max(0, Math.min(Math.max(0, last), i))
}

/** The settle's length: short for a nudge, never long (ms). */
export const settleMs = (px: number): number => Math.round(Math.min(360, Math.max(160, 120 + Math.abs(px) * 0.5)))

/** A wheel event's sideways intent, in CSS px: a trackpad's deltaX, or Shift + a mouse wheel's deltaY. */
export function wheelDx(e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey'>, pageW: number): number {
  const d = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0
  return e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * pageW : d
}

export interface GlideHost {
  /** Day columns that fit on screen (the view's day count, less hidden weekdays). */
  visible: () => number
  /** A drag, resize or slot selection is under way: the buffer is never re-centred under it. */
  busy: () => boolean
  /** The leftmost day on screen changed (once per day crossed, never per pixel). */
  onAnchor: (date: string) => void
  /** Show `date` at the buffer's centre (FullCalendar redraws synchronously; `restore` runs from its datesSet). */
  recenter: (date: string) => void
  /** The days' offset, every frame they move (the day tray under the grid follows it). */
  onScroll?: (x: number) => void
}

export interface Glide {
  /** After FullCalendar drew (datesSet, a resize): re-measure and put the same day back at the left. */
  restore: (date?: string) => void
  /** After any render of the grid: re-measure when the hours' or the gutter's width changed. FullCalendar's root
   * undoes the interface zoom (CalendarGrid.css), and that can land a style pass after the grid first drew — a
   * change no ResizeObserver hears. */
  check: () => void
  /** ‹ › : glide by `n` screens. Returns false when there's nothing to glide (the host jumps instead). */
  page: (n: number) => boolean
  /** Glide until `date` is the leftmost day, when it's drawn; false when it isn't (the host jumps). */
  glideTo: (date: string) => boolean
  /** A drag let go: settle on the nearest day (its edge scroll may have left the days between two). */
  release: () => void
  /** The leftmost day on screen. */
  anchor: () => string
  destroy: () => void
}

export function attachGlide(wrap: HTMLElement, host: GlideHost, start: string): Glide {
  let x = 0
  let colW = 0
  let cols: string[] = []
  let scrollers: HTMLElement[] = []
  let body: HTMLElement | null = null
  let anchor = start
  let frac = 0
  let lock: 'x' | 'y' | null = null
  let lastWheel = 0
  let dir = 0
  let anim = 0
  // What the layout was measured from: the hours' width and the time gutter's.
  let measured = ''
  let quiet = 0
  // Left between days (a drag's edge scroll, a settle a held button kept from re-centring): settle on release.
  let dirty = false
  let idle = 0

  const V = () => Math.max(1, Math.min(host.visible(), cols.length || 1))
  const last = () => Math.max(0, cols.length - V())
  const maxX = () => last() * colW

  function layout(): boolean {
    body = wrap.querySelector<HTMLElement>('.fc-scroller-liquid-absolute')
    const head = wrap.querySelector<HTMLElement>('.fc-col-header')
    if (!body || !head) return false
    scrollers = [...wrap.querySelectorAll<HTMLElement>('.fc-scroller')]
    cols = [...head.querySelectorAll<HTMLElement>('.fc-col-header-cell[data-date]')].map((c) => c.dataset.date ?? '')
    // FullCalendar's own px throughout (clientWidth / offsetWidth / scrollLeft): its root undoes the interface zoom.
    const axis = head.querySelector<HTMLElement>('.fc-timegrid-axis')?.offsetWidth ?? 0
    measured = `${body.clientWidth}|${axis}`
    colW = (body.clientWidth - axis) / V()
    if (!(colW > 0)) return false
    wrap.style.setProperty('--kf-glide-w', `${Math.floor(axis + colW * cols.length)}px`)
    return true
  }

  function set(nx: number) {
    x = Math.max(0, Math.min(maxX(), nx))
    for (const s of scrollers) s.scrollLeft = x
    host.onScroll?.(x)
    const pos = colW ? x / colW : 0
    const i = Math.min(cols.length - 1, Math.max(0, Math.round(pos)))
    const k = Math.min(cols.length - 1, Math.max(0, Math.floor(pos + 1e-6)))
    frac = pos - k
    const keep = cols[k]
    // The header names the day mostly on screen at the left; the position is kept by the one under its edge.
    if (cols[i] && cols[i] !== anchor) {
      anchor = cols[i]
      host.onAnchor(anchor)
    }
    edgeDay = keep
  }
  let edgeDay = start

  /** Mid-gesture, near the buffer's end: re-centre on the day under the left edge, keeping the fraction. */
  function nearEdge() {
    if (host.busy() || !colW) return
    const pos = x / colW
    if (pos >= 0.5 && pos <= last() - 0.5) return
    const day = edgeDay
    const f = frac
    host.recenter(day)
    restoreAt(day, f)
  }

  function restoreAt(day: string, f: number) {
    if (!layout()) return
    markQuietScroll(wrap) // the same day stays put: no menu closes over it
    watch()
    // A day no longer drawn (its weekday just hidden): the next one that is.
    let j = cols.indexOf(day)
    if (j < 0) j = cols.findIndex((c) => c > day)
    if (j < 0) return
    set((j + (cols[j] === day ? f : 0)) * colW)
  }

  function stop() {
    cancelAnimationFrame(anim)
    anim = 0
  }

  function animateTo(target: number, done?: () => void) {
    stop()
    const from = x
    const d = target - from
    if (Math.abs(d) < 0.5 || reducedMotionNow()) {
      set(target)
      done?.()
      return
    }
    const ms = settleMs(d)
    const t0 = performance.now()
    const frame = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      set(from + d * (1 - Math.pow(1 - p, 3))) // ease-out
      if (p < 1) anim = requestAnimationFrame(frame)
      else {
        anim = 0
        done?.()
      }
    }
    anim = requestAnimationFrame(frame)
  }

  /** Settled on a column: the buffer re-centres around it a moment later, when it's running low (never under a drag). */
  function settleOn(i: number) {
    window.clearTimeout(idle)
    animateTo(i * colW, () => {
      if (host.busy()) dirty = true
      else idle = window.setTimeout(recenterIdle, RECENTER_IDLE_MS)
    })
  }

  function recenterIdle() {
    idle = 0
    if (anim || !colW) return
    if (host.busy()) return void (dirty = true)
    const i = Math.round(x / colW)
    if (cols[i] && needsRecenter(i, last(), V())) host.recenter(cols[i])
  }

  function settle() {
    window.clearTimeout(quiet)
    lock = null
    if (!colW) return
    settleOn(settleIndex(x / colW, dir, last()))
    dir = 0
  }

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey || !colW || !(e.target as Element | null)?.closest?.('.fc-view-harness')) return
    // One axis per gesture: a vertical scroll's sideways jitter never moves the days, nor the reverse.
    if (!lock || e.timeStamp - lastWheel > QUIET_MS) check()
    if (!lock || e.timeStamp - lastWheel > QUIET_MS) lock = Math.abs(e.deltaX) > Math.abs(e.deltaY) || (e.shiftKey && e.deltaY !== 0) ? 'x' : 'y'
    lastWheel = e.timeStamp
    if (lock === 'y') return
    // 1:1 under the fingers: FullCalendar's root undoes the interface zoom (CalendarGrid.css), so its px are the screen's.
    const dx = wheelDx(e, body?.clientWidth ?? 800)
    e.preventDefault()
    if (!dx) return
    stop()
    window.clearTimeout(idle)
    dir = Math.sign(dx)
    set(x + dx)
    nearEdge()
    window.clearTimeout(quiet)
    quiet = window.setTimeout(settle, QUIET_MS)
  }

  // FullCalendar's own AutoScroller (a block held at the grid's left / right edge) scrolls the hours only:
  // the day row and the all-day band follow. Any other change under us (the browser clamping the scroll while
  // FullCalendar redraws narrower for a moment) is undone: the same day goes back to the left.
  let fix = 0
  function onScroll() {
    if (!body || anim || Math.abs(body.scrollLeft - x) < 1) return
    if (host.busy()) {
      dirty = true
      return set(body.scrollLeft)
    }
    cancelAnimationFrame(fix)
    fix = requestAnimationFrame(() => restoreAt(edgeDay, frac))
  }
  // The days' width follows the box (a rail folding, the window) and the time gutter (a second clock drawn late).
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    cancelAnimationFrame(fix)
    fix = requestAnimationFrame(() => restoreAt(edgeDay, frac))
  })
  let watched: Element[] = []
  function watch() {
    const els = [body, wrap.querySelector('.fc-col-header .fc-timegrid-axis')].filter((e): e is HTMLElement => !!e)
    if (!ro || (els.length === watched.length && els.every((e, i) => e === watched[i]))) return
    ro.disconnect()
    els.forEach((e) => ro.observe(e))
    watched = els
  }

  wrap.addEventListener('wheel', onWheel, { passive: false })
  wrap.addEventListener('scroll', onScroll, true)

  function check() {
    const b = wrap.querySelector<HTMLElement>('.fc-scroller-liquid-absolute')
    const axis = wrap.querySelector<HTMLElement>('.fc-col-header .fc-timegrid-axis')?.offsetWidth ?? 0
    if (!anim && b && `${b.clientWidth}|${axis}` !== measured) restoreAt(edgeDay, frac)
  }

  return {
    restore: (date) => restoreAt(date ?? edgeDay, date ? 0 : frac),
    check,
    page(n) {
      check()
      if (!colW) return false
      stop()
      window.clearTimeout(idle)
      let i = Math.round(x / colW)
      let t = i + n * V()
      if (t < 0 || t > last()) {
        // Off the buffer: re-centre on the day at the left first (unseen: the same day stays put), then glide.
        if (host.busy()) return false
        host.recenter(cols[i])
        restoreAt(cols[i], 0)
        i = Math.round(x / colW)
        t = i + n * V()
        if (t < 0 || t > last()) return false
      }
      settleOn(t)
      return true
    },
    glideTo(date) {
      check()
      const j = cols.indexOf(date)
      if (j < 0 || j > last() + V() - 1) return false
      stop()
      settleOn(Math.min(j, last()))
      return true
    },
    release: () => {
      if (!dirty || anim) return
      dirty = false
      settle()
    },
    anchor: () => anchor,
    destroy() {
      stop()
      window.clearTimeout(quiet)
      window.clearTimeout(idle)
      cancelAnimationFrame(fix)
      ro?.disconnect()
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('scroll', onScroll, true)
    },
  }
}
