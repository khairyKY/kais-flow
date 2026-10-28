import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { uiZoom } from './uiScale'
import { onPrefApplied, prefWritten } from './prefs'

// ── Shared motion gate + helpers. Keyframes live in tokens/motion.css. ──
//
// RM2 — THE ONE RULE (2026-10-28). Two tiers, one gate each:
// - FUNCTIONAL motion — enter, exit, collapse, settle, reorder, 200ms or less — always plays. Under
//   the OS reduced-motion setting it is a cross-fade or a cut: CSS gets that free from the global rule
//   in tokens/motion.css; Web Animations check reducedMotionNow().
// - DECORATIVE motion — scale, float, bloom, petals, ambient loops, entry stagger, lean — plays only
//   with Effects on AND no reduced motion: useMotionEnabled() / motionOnNow() in JS, and in CSS the
//   `.motion-on` class, which lives on <html> (AppLayout), so portals on <body> agree with the shell.
//   (`html.kf-motion-on` is the same flag under its older name; `.cal-motion-on` is the calendar's.)

const EFFECTS_KEY = 'kf_effects'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function readEffectsOn(): boolean {
  try {
    return localStorage.getItem(EFFECTS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setEffectsEnabled(on: boolean) {
  try {
    localStorage.setItem(EFFECTS_KEY, on ? '1' : '0')
    prefWritten(EFFECTS_KEY)
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event('kf-effects-change'))
}
// Another device turned the animations on or off.
onPrefApplied(EFFECTS_KEY, () => window.dispatchEvent(new Event('kf-effects-change')))

/** The OS reduced-motion setting, read at call time: the gate for FUNCTIONAL Web Animations (RM2). */
export function reducedMotionNow(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** useMotionEnabled() outside React (the router subscription, drag drops): read at call time. */
export function motionOnNow(): boolean {
  return readEffectsOn() && !reducedMotionNow()
}

/** T15 — a loader (skeleton, the route fallback) shows only once a load has taken 300ms, then fades
 * in over 160ms, so a quick load never flashes it. Functional: the delay holds under reduced motion. */
export const LOADER_DELAY: React.CSSProperties = { animation: 'scrimIn 160ms var(--ease-out) 300ms backwards' }

/** T15 — true once `loading` has been true in this mount: content that replaces a skeleton gets the
 * 160ms `kf-fade` instead of swapping in; content that was already there (cached) doesn't. */
export function useWasLoading(loading: boolean): boolean {
  const was = useRef(loading)
  if (loading) was.current = true
  return was.current
}

/** RM1 — a JS smooth scroll beats the CSS `scroll-behavior: auto` reduced motion sets, so ask first. */
export function scrollBehavior(): ScrollBehavior {
  return motionOnNow() ? 'smooth' : 'auto'
}

// True when decorative motion should play: effects on AND not reduced-motion.
export function useMotionEnabled(): boolean {
  const reduced = usePrefersReducedMotion()
  const [effectsOn, setOn] = useState(readEffectsOn)
  useEffect(() => {
    const on = () => setOn(readEffectsOn())
    window.addEventListener('kf-effects-change', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('kf-effects-change', on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return effectsOn && !reduced
}

// Entry stagger — content settles up in source order, 60ms apart (Motion 4b).
// Spread onto each item: style={staggerDelay(i)}. Pairs with the .kf-stagger-item CSS.
// T1 (Kai 2026-10-28): only the first screen cascades — the index caps at STAGGER_CAP, so the last
// row waits 480ms at most, never seconds — and only on route entry: a row that mounts after the
// entry window (Show more, an Undo, a capture, a realtime insert) arrives with no delay at all.
export const STAGGER_CAP = 8
export const STAGGER_WINDOW_MS = 800
let routeEnteredAt = -Infinity
/** AppLayout calls this as a new page renders; staggerDelay counts its window from here. */
export function markRouteEntry(now = performance.now()): void {
  routeEnteredAt = now
}
/** T11 — 'kf-row-in' for a row that mounts after its page's entry window (a capture, an Undo, a
 * realtime insert, a reopened row), so it breathes in; rows there from the start ride the page's own
 * entry instead. Decided once, at mount. */
export function useArrivalClass(): string | undefined {
  const [cls] = useState(() => (performance.now() - routeEnteredAt > STAGGER_WINDOW_MS ? 'kf-row-in' : undefined))
  return cls
}
export function staggerDelay(index: number, step = 60, now = performance.now()): React.CSSProperties {
  if (now - routeEnteredAt > STAGGER_WINDOW_MS) return { animationDelay: '0ms' }
  return { animationDelay: `${Math.min(index, STAGGER_CAP) * step}ms` }
}

// J-22 — a stable 0–1 phase per id (FNV-1a hash), so a per-item ambient loop can start at its
// own point in the cycle instead of every card animating in lockstep. Same id → same phase on
// every render and reload, so nothing jumps when a list re-renders.
export function idPhase(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

// F4 Motion 3c — overlay exit (140ms). Render while `mounted`; add the matching
// `--out` class (kf-overlay-card--out / kf-scrim--out / kf-sheet--out / kf-drawer--out)
// while `closing`. Esc obeys immediately under reduced-motion (duration collapses to 0).
export function useOverlayExit(open: boolean, duration = 140): { mounted: boolean; closing: boolean } {
  const reduced = usePrefersReducedMotion()
  const [closing, setClosing] = useState(false)
  const prevOpen = useRef(open)
  useEffect(() => {
    const was = prevOpen.current
    prevOpen.current = open
    if (open || !was) return // opening, or never was open — nothing to animate out
    setClosing(true)
    const t = setTimeout(() => setClosing(false), reduced ? 0 : duration)
    return () => clearTimeout(t)
  }, [open, duration, reduced])
  return { mounted: open || closing, closing }
}

// F4 Motion 3e — list breathing, the exit half. Call BEFORE removing the row from
// data: slides the element out 200ms, collapses its height 180ms, then runs onDone
// (which performs the actual mutation). Reduced-motion → immediate onDone.
export function animateRowRemoval(el: HTMLElement | null, onDone: () => void) {
  if (!el || reducedMotionNow() || typeof el.animate !== 'function') {
    onDone()
    return
  }
  const height = el.offsetHeight
  el.style.pointerEvents = 'none'
  const fold = () => {
    el.style.overflow = 'hidden'
    const collapse = el.animate([{ height: `${height}px` }, { height: '0px' }], {
      duration: 180,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    })
    collapse.onfinish = () => onDone()
  }
  // T7: a row a swipe has already flown off sideways (SwipeRow marks it data-flown) only folds its
  // height, as iOS Mail's swipe-to-archive does — no second slide.
  if (el.dataset.flown !== undefined) return fold()
  const slide = el.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateX(24px)' },
    ],
    { duration: 200, easing: 'cubic-bezier(0.55, 0, 0.68, 0.53)', fill: 'forwards' },
  )
  slide.onfinish = fold
}

/** T6 — "leaves this list" exits without holding the write back. Watches `els`; when the next render
 * takes one off the page (its own node, or the group around it), a still copy of what was removed is
 * put back where it stood and plays the shared exit (slide, then collapse) before it goes. A row the
 * change keeps (Tomorrow on All) is never touched, so nothing has to guess which list shows what.
 * The write happens at once, as before. Functional: cut under reduced motion. Gives up after 1s. */
export function exitOnRemoval(els: readonly (Element | null | undefined)[]): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || reducedMotionNow()) return
  const live = els.filter((e): e is Element => !!e?.isConnected)
  if (!live.length) return
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.removedNodes) {
        const i = live.findIndex((e) => n === e || n.contains(e))
        if (i < 0 || !(n instanceof HTMLElement)) continue
        live.splice(i, 1)
        const ghost = n.cloneNode(true) as HTMLElement
        for (const x of [ghost, ...ghost.querySelectorAll('[id]')]) x.removeAttribute('id')
        ghost.setAttribute('aria-hidden', 'true')
        ghost.inert = true
        const after = r.previousSibling?.parentNode === r.target ? r.previousSibling : null
        const before = r.nextSibling?.parentNode === r.target ? r.nextSibling : after ? after.nextSibling : r.target.firstChild
        r.target.insertBefore(ghost, before)
        animateRowRemoval(ghost, () => ghost.remove())
      }
    if (!live.length) stop()
  })
  const stop = () => {
    observer.disconnect()
    window.clearTimeout(giveUp)
  }
  observer.observe(document.body, { childList: true, subtree: true })
  const giveUp = window.setTimeout(stop, 1000)
}

/** T6 — the exit for every element `selector` matches that `write` takes off the page; `write` runs at once. */
export function exitAll(selector: string, write: () => void): void {
  exitOnRemoval([...document.querySelectorAll(selector)])
  write()
}

/** Puts back a row `animateRowRemoval` was taking away — an Undo that lands mid-exit (Polish D,
 * punch 6). Its slide/collapse run with `fill: forwards`, so once finished they'd hold the row at
 * opacity 0 / height 0 even after it's back in the list. They're cancelled (onDone never fires) and
 * the inline styles cleared; CSS animations and transitions on the row are left alone.
 * T5 (2026-10-28): the row no longer snaps back to full size — it eases back from wherever the exit
 * had got to (200ms, ease-standard): the exit, run in reverse. */
export function cancelRowRemoval(el: HTMLElement | null) {
  if (!el) return
  const exits = (el.getAnimations?.() ?? []).filter((a) => !('animationName' in a) && !('transitionProperty' in a))
  const cs = exits.length ? getComputedStyle(el) : null
  const from = cs ? { height: `${el.offsetHeight}px`, opacity: cs.opacity, transform: cs.transform } : null
  for (const a of exits) a.cancel()
  el.style.pointerEvents = ''
  el.style.overflow = ''
  if (!from || reducedMotionNow() || typeof el.animate !== 'function') return
  el.style.overflow = 'hidden'
  const back = el.animate([from, { height: `${el.offsetHeight}px`, opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
  back.onfinish = back.oncancel = () => {
    el.style.overflow = ''
  }
}

/** T2 — how long a ticked row keeps its place while the four-beat check plays (Motion 3b). */
export const COMPLETE_GRACE_MS = 650

/** T2/T3 — rows that were just ticked, shared by every list that drops done tasks (Tasks, Project
 * detail, Perennials, Today). `hold(id, value)` on the tick: the list keeps drawing the row as open
 * (`rows.get(id)` carries whatever it needs to draw it as it was — Tasks keeps its Top-3 flag). After
 * the grace the row leaves through `leave(id, drop)` — by default animateRowRemoval on `#task-<id>`;
 * Today FLIPs it down to its done rows instead — and `drop` ends the hold. `keep(id)` is the Undo:
 * the exit stops and the row eases back (cancelRowRemoval). Callers skip `hold` when motion is off,
 * so the row goes the moment it's done, as before. */
export function useCompletingRows<V = true>(
  leave?: ((id: string, drop: () => void) => void) | null,
  /** The element that leaves (and comes back on Undo); a task row by default. */
  rowEl: (id: string) => HTMLElement | null = (id) => document.getElementById(`task-${id}`),
) {
  const [rows, setRows] = useState<ReadonlyMap<string, V>>(() => new Map())
  const timers = useRef(new Map<string, number>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])
  const drop = (id: string) =>
    setRows((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  const hold = (id: string, value: V) => {
    window.clearTimeout(timers.current.get(id))
    setRows((prev) => new Map(prev).set(id, value))
    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id)
        if (leave) leave(id, () => drop(id))
        else animateRowRemoval(rowEl(id), () => drop(id))
      }, COMPLETE_GRACE_MS),
    )
  }
  const keep = (id: string) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    cancelRowRemoval(rowEl(id))
    drop(id)
  }
  return { rows, hold, keep }
}

/** T13 — flip() over the task rows of the page on screen (a nested subtask rides its parent). */
export function flipRows(change: () => void): void {
  flip(document.querySelector('.app-main-content > .kf-route'), change, '[id^="task-"]:not([id^="task-"] [id^="task-"])')
}

/** T13 — FLIP a reorder: measures `selector`'s matches under `container`, runs `change` (a state or
 * cache update), and when the list next changes in the DOM — a MutationObserver, so it works whether
 * React renders at once or a beat later (TanStack Query notifies on a timer) — plays each element
 * that moved from its old place to its new one, 200ms on ease-standard, before that frame paints.
 * React keeps a keyed row's node through a reorder, so the node is the key. Functional motion: it
 * plays with Effects off and is a cut under reduced motion. */
export function flip(container: Element | null | undefined, change: () => void, selector = ':scope > *'): void {
  if (!container || reducedMotionNow() || typeof MutationObserver === 'undefined') {
    change()
    return
  }
  // Keyed by the element's id where it has one: a list keyed by slot (the Top 3) keeps the node and
  // moves the id, a list keyed by task moves the node — the id follows the row either way.
  const key = (el: Element) => el.id || el
  const first = new Map<Element | string, DOMRect>()
  for (const el of container.querySelectorAll(selector)) first.set(key(el), el.getBoundingClientRect())
  const play = () => {
    observer.disconnect()
    window.clearTimeout(giveUp)
    for (const el of container.querySelectorAll<HTMLElement>(selector)) {
      const a = first.get(key(el))
      if (!a || typeof el.animate !== 'function') continue
      const b = el.getBoundingClientRect()
      const dx = a.left - b.left
      const dy = a.top - b.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    }
  }
  const observer = new MutationObserver(play)
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] })
  const giveUp = window.setTimeout(() => observer.disconnect(), 500) // nothing moved
  change()
}

// Motion 5b "Drag lift" — R4-23 (Kai's 2026-07-20 audit). The export calls this "the one
// grammar for every draggable", so it lives here rather than being re-typed per surface:
// lift in 140ms, settle back over 320ms with an overshoot. Draggables previously just faded
// to 40% opacity, which reads as "disabled", not "picked up".
export function dragLift(isDragging: boolean, motionOn = true): React.CSSProperties {
  if (!motionOn) return { opacity: isDragging ? 0.6 : 1 }
  return {
    transform: isDragging ? 'scale(1.04) rotate(1.2deg)' : 'none',
    boxShadow: isDragging ? '0 14px 30px rgba(var(--kf-shadow-rgb, 60,52,38),0.26)' : undefined,
    // Asymmetric on purpose: the pick-up is quick, the release settles with the overshoot.
    transition: isDragging
      ? 'transform 140ms var(--ease-out), box-shadow 140ms var(--ease-out)'
      : 'transform 320ms var(--ease-spring), box-shadow 320ms var(--ease-out)',
    // A lifted leaf stays legible; the old 0.4 made it look switched off.
    opacity: isDragging ? 0.92 : 1,
  }
}

/** Plays a one-shot animation on `el`: sets `data-play="<name>"` (restarting it if it's mid-play) and
 * clears it after `ms`. An attribute, not a class, so a re-render that rewrites className (a drop
 * spot's highlight going off as the drop lands) can't wipe it. The CSS for each name is scoped to
 * `.motion-on`, so with motion off only its state shows. */
export function playOnce(el: Element | null | undefined, name: string, ms: number): void {
  if (!(el instanceof HTMLElement)) return
  delete el.dataset.play
  void el.offsetWidth // a reflow, so a repeat restarts the animation
  el.dataset.play = name
  window.setTimeout(() => {
    if (el.dataset.play === name) delete el.dataset.play
  }, ms)
}

/** Effects 2j beyond the calendar — the soft no on something that refused a tap (a fourth star for a
 * full Top 3): one decaying shake, the toast says why. */
export const softNo = (el: Element | null | undefined) => playOnce(el, 'softno', 360)

// ── Motion 2b (desktop, vertical) · 3a (phone, horizontal) · 4e — the stack. A detail page (any
// two-segment path: /projects/:id, /people/:id, /tasks/:id, /settings/import, /guide/:slug) sits ON
// the page it was opened from. Drilling in, it rides up over the receding page (a phone: in from the
// right); Back, Esc or its own back link drops it away and the page beneath eases forward. The move
// is read from the paths and the history step, so the browser's Back and Forward go the right way.
// A push lands at the top of the new page; a pop puts the page beneath back where it was scrolled. ──

export type StackMove = 'push' | 'pop' | null

const segments = (path: string) => path.split('/').filter(Boolean)

/** How a navigation moves on the stack. `action` is React Router's POP / PUSH / REPLACE; `back` = a
 * history step to an earlier entry. Pure. */
export function stackMove(from: string, to: string, action: string, back: boolean): StackMove {
  if (from === to || action === 'REPLACE') return null
  const f = segments(from)
  const t = segments(to)
  // Back off a detail drops it, wherever it was opened from; back INTO one is not a drill-in.
  if (back) return f.length > 1 ? 'pop' : null
  if (t.length > 1) return 'push'
  // Forward from a detail: only its own list is the page beneath (a sidebar jump elsewhere is a cut).
  return f.length > 1 && t[0] === f[0] ? 'pop' : null
}

let shot: { move: StackMove; page: HTMLElement | null; scrollTop: number } | null = null
const scrolled = new Map<string, number>() // history key → where its page was scrolled

/** Called by the router BEFORE the next page renders (App.tsx): notes the move, keeps the outgoing
 * page's scroll for a later pop and, motion on, a still copy of it to animate. */
export function captureStack(move: StackMove, fromKey: string): void {
  const scroller = document.querySelector<HTMLElement>('.app-main-content')
  const page = scroller?.querySelector<HTMLElement>(':scope > .kf-route')
  shot = null
  if (!scroller) return
  scrolled.set(fromKey, scroller.scrollTop)
  let copy: HTMLElement | null = null
  if (move && page && motionOnNow()) {
    copy = page.cloneNode(true) as HTMLElement
    for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute('id') // ids stay unique
  }
  shot = { move, page: copy, scrollTop: scroller.scrollTop }
}

/** Plays the captured move on the page scroller once the new page is in the DOM (before paint). */
export function useStackTransition(scrollerRef: RefObject<HTMLElement | null>, key: string): void {
  const running = useRef<{ path: string; stop: () => void } | null>(null)
  useLayoutEffect(() => () => running.current?.stop(), [])
  useLayoutEffect(() => {
    const s = shot
    shot = null
    const el = scrollerRef.current
    // A page that settles its own address (a replace, a search param) leaves a move in flight alone;
    // any other new page, or the next stack move, stops it where it is.
    if (running.current && (s?.move || running.current.path !== window.location.pathname)) running.current.stop()
    if (!s?.move || !el) return
    el.scrollTop = s.move === 'pop' ? (scrolled.get(key) ?? 0) : 0
    const host = el.offsetParent
    if (!s.page || !(host instanceof HTMLElement)) return
    const push = s.move === 'push'
    // The outgoing page, still: clipped to the scroller's box, scrolled as it was.
    const layer = document.createElement('div')
    layer.className = 'kf-stack-layer'
    layer.setAttribute('aria-hidden', 'true')
    layer.inert = true
    Object.assign(layer.style, { left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`, zIndex: push ? '0' : '2' })
    const sheet = document.createElement('div')
    Object.assign(sheet.style, { padding: getComputedStyle(el).padding, width: `${el.clientWidth}px`, minHeight: '100%', transform: `translateY(${-s.scrollTop}px)` })
    sheet.append(s.page)
    const old = document.createElement('div')
    old.className = push ? 'kf-stack-page kf-stack-under-out' : 'kf-stack-page kf-stack-top kf-stack-over-out'
    old.append(sheet)
    const dim = document.createElement('div')
    dim.className = push ? 'kf-stack-dim kf-stack-dim-in' : 'kf-stack-dim kf-stack-dim-out'
    layer.append(...(push ? [old, dim] : [dim, old]))
    host.append(layer)
    const live = push ? ['kf-stack-top', 'kf-stack-over-in'] : ['kf-stack-under-in']
    el.dataset.stack = s.move // also stills the route cut and the entry stagger: the stack replaces them
    el.classList.add(...live)
    const ended = (e: AnimationEvent) => {
      if (e.target === el) stop()
    }
    const stop = () => {
      window.clearTimeout(backstop)
      el.removeEventListener('animationend', ended)
      layer.remove()
      delete el.dataset.stack
      el.classList.remove(...live)
      if (running.current?.stop === stop) running.current = null
    }
    el.addEventListener('animationend', ended)
    const backstop = window.setTimeout(stop, 2000) // a hidden tab holds animation events back
    running.current = { path: window.location.pathname, stop }
  }, [key, scrollerRef])
}

// ── Effects 2k — boundary resistance. A finger dragging the page past its top or its end pulls it
// along at a third of the distance, 40px at most; let go and it eases back with one 4px overshoot.
// Touch only, on the page's own scroller (a nested scroller keeps its own edge), motion on only.
// The scroller's native bounce is off while this runs, so the two never stack. ──

export const RESIST_K = 0.33
export const RESIST_MAX = 40

/** How far the page follows a finger `d` px past its edge. Pure. */
export function resist(d: number): number {
  const r = Math.min(RESIST_MAX, Math.abs(d) * RESIST_K)
  return d < 0 ? -r : r
}

export function useBoundaryResistance(scrollerRef: RefObject<HTMLElement | null>): void {
  const on = useMotionEnabled()
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !on) return
    let last = 0
    let startX = 0
    let startY = 0
    let axis: 'x' | 'y' | null = null
    let anchor: number | null = null
    let pull = 0
    let mine = false
    const page = () => el.querySelector<HTMLElement>(':scope > .kf-route')
    const set = (px: number) => {
      const p = page()
      if (p) p.style.transform = px ? `translateY(${px}px)` : ''
    }
    const atTop = () => el.scrollTop <= 0
    const atEnd = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    // The finger is the page's: nothing between it and the scroller scrolls vertically by itself.
    const owns = (target: EventTarget | null) => {
      for (let n = target instanceof HTMLElement ? target : null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return false
      }
      return true
    }
    const start = (e: TouchEvent) => {
      mine = e.touches.length === 1 && owns(e.target)
      axis = null
      anchor = null
      pull = 0
      startX = (e.touches[0]?.clientX ?? 0) / uiZoom()
      startY = last = (e.touches[0]?.clientY ?? 0) / uiZoom()
    }
    const move = (e: TouchEvent) => {
      // A gesture something under the finger has claimed (drag-fix: a tray chip carried onto the phone grid) is no pull.
      if (!mine || e.defaultPrevented) return
      const x = e.touches[0].clientX / uiZoom()
      const y = e.touches[0].clientY / uiZoom()
      // A sideways gesture (a row's swipe) is not a pull on the page.
      if (!axis && Math.max(Math.abs(x - startX), Math.abs(y - startY)) >= 8) axis = Math.abs(x - startX) > Math.abs(y - startY) ? 'x' : 'y'
      if (axis !== 'y') {
        if (axis === 'x') mine = false
        last = y
        return
      }
      if (anchor === null) {
        if ((y > last && atTop()) || (y < last && atEnd())) anchor = last
        last = y
        if (anchor === null) return
      }
      const d = y - anchor
      if ((pull > 0 && d < 0) || (pull < 0 && d > 0)) {
        // back past the edge: the page scrolls again
        anchor = null
        pull = 0
        set(0)
        return
      }
      pull = resist(d)
      set(pull)
    }
    const end = () => {
      mine = false
      if (!pull) return
      const from = pull
      pull = 0
      anchor = null
      set(0)
      page()?.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${from > 0 ? -4 : 4}px)`, offset: 0.7 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.25, 0.9, 0.35, 1)' })
    }
    el.style.overscrollBehaviorY = 'none'
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.style.overscrollBehaviorY = ''
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      set(0)
    }
  }, [scrollerRef, on])
}
