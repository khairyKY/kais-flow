import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Float } from '../../components/Float'
import { Icon } from '../../components/Icon'
import { useIsMobile } from '../../components/BottomSheet'
import { useAuth } from '../auth/AuthProvider'
import { useAppSettings } from '../../lib/settings'
import { useMotionEnabled } from '../../lib/motion'
import { overlayCount, useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { DESKTOP_NOTES, HINTS, PHONE_NOTES, dotCount, loadHelp, markSeen, mergeSeen, pickHint, shouldAutoStart, startTour, tourEvent, tourPending, useHelp, type Hint, type TourNote } from './help'
import './tour.css'

// The garden notes (Tour and Help.dc.html 14a–14f, Desktop 14g) and the one-line hints (14h), over
// the real pages. Mounted once in the shell, lazily. Nothing here blocks the page: the dim is 24%
// and lets every tap through ("tap the lit thing to try it"); a note waits while any sheet, menu
// or dialog is up, and anchors are `data-tour="…"` attributes on the real elements.

type Box = { x: number; y: number; w: number; h: number }

/** The first `data-tour="name"` element that's laid out — on screen if one is (`inView`). */
function findAnchor(name: string, inView: boolean): HTMLElement | null {
  const vh = window.innerHeight
  let offscreen: HTMLElement | null = null
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (el.closest('[data-tour-ui]')) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (r.bottom > 0 && r.top < vh) return el
    offscreen ??= el
  }
  return inView ? null : offscreen
}

/** A sheet, menu or dialog is up (other than the tour itself, when it's registered). */
function busy(own: boolean): boolean {
  return overlayCount() > (own ? 1 : 0) || !!document.querySelector('[aria-modal="true"]')
}

/** Visual px (rects, innerWidth) → the layout px a fixed element is placed in (lib/uiScale). */
function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect()
  const z = uiZoom()
  return { x: r.left / z, y: r.top / z, w: r.width / z, h: r.height / z }
}
const viewport = () => ({ w: window.innerWidth / uiZoom(), h: window.innerHeight / uiZoom() })

/** Follows an element on every frame while `on` (scrolls, a list settling, a sheet resizing). */
function useBox(el: HTMLElement | null, on: boolean): Box | null {
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    if (!on || !el) {
      setBox(null)
      return
    }
    let raf = 0
    let last = ''
    const loop = () => {
      if (el.isConnected) {
        const b = boxOf(el)
        const key = [b.x, b.y, b.w, b.h].map(Math.round).join()
        if (key !== last) {
          last = key
          setBox(b)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [el, on])
  return box
}

export function TourHost() {
  const uid = useAuth().session?.user.id
  const settings = useAppSettings().data
  const local = useHelp((s) => s.local)
  const note = useHelp((s) => s.note)
  const mobile = useIsMobile()
  const onToday = useLocation().pathname === '/today'
  const seen = useMemo(() => mergeSeen(local, settings?.help_seen), [local, settings?.help_seen])

  useEffect(() => loadHelp(uid), [uid])
  // Right after onboarding (it leaves the flag), once, on Today — not while an import it led to is
  // open: never on sign-in or onboarding themselves (this lives in the signed-in shell), and the
  // notes below wait out any sheet or dialog.
  useEffect(() => {
    if (uid && settings && onToday && shouldAutoStart(tourPending(uid), seen, note != null)) startTour()
  }, [uid, settings, onToday, seen, note])

  if (!uid) return null
  const notes = mobile ? PHONE_NOTES : DESKTOP_NOTES
  if (note != null) return <Tour key={`${mobile}-${note}`} notes={notes} at={Math.min(note, notes.length - 1)} mobile={mobile} />
  return <Hints seen={seen} mobile={mobile} />
}

// ── the tour ──

function Tour({ notes, at, mobile }: { notes: TourNote[]; at: number; mobile: boolean }) {
  const n = notes[at]
  const count = notes.length
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const motion = useMotionEnabled()
  const onPage = !n.path || pathname === n.path
  const [state, setState] = useState<{ ready: boolean; anchor: HTMLElement | null }>({ ready: false, anchor: null })
  const [blocked, setBlocked] = useState(true)
  const [ghostOff, setGhostOff] = useState(false)
  const shown = onPage && state.ready && !blocked
  const registered = useRef(false)
  registered.current = shown
  useEscapeStack(shown, () => tourEvent('skip', count))

  // The note's page, once, as it comes up (the calendar note on desktop; Today after a restart).
  useEffect(() => {
    if (n.path && window.location.pathname !== n.path) navigate(n.path)
  }, [n.path, navigate])

  // Wait for the page and its anchor; a note whose anchor never shows is passed over.
  useEffect(() => {
    if (!onPage) return
    let waited = 0
    let scrolled = false
    const tick = () => {
      const b = busy(registered.current)
      setBlocked(b)
      if (b) return
      const el = n.anchors.map((a) => findAnchor(a, false)).find(Boolean) ?? null
      if (!n.anchors.length || el) {
        if (el && !scrolled) {
          scrolled = true
          const r = el.getBoundingClientRect()
          const vh = window.innerHeight
          const card = 240 * uiZoom() // about a note's height
          // Vertical only, on the page's own scroller: scrollIntoView also scrolled clipped rows (a swipe row's
          // track) sideways, leaving the page shifted after the tour.
          if (r.top < 0 || r.bottom > vh) el.closest('.app-main-content')?.scrollBy({ top: (r.top + r.height / 2 - vh / 2) / uiZoom() })
          // A tall anchor (Top 3 with its goal card) leaves no room above or below: lift it to the top.
          else if (r.bottom + card > vh - 80 && r.top - card < 0) el.closest('.app-main-content')?.scrollBy({ top: (r.top - 72) / uiZoom() })
        }
        setState((s) => (s.ready && s.anchor === el ? s : { ready: true, anchor: el }))
      } else if ((waited += 250) >= 2500) tourEvent('missing', count)
    }
    tick()
    const t = window.setInterval(tick, 250)
    return () => window.clearInterval(t)
  }, [onPage, n, count])

  useEffect(() => {
    if (shown && n.teaches) markSeen(n.teaches)
  }, [shown, n.teaches])

  // Touching the lit row stops the ghost: the real row is yours to swipe.
  useEffect(() => {
    if (!n.ghost || !state.anchor) return
    const el = state.anchor
    const off = (e: PointerEvent) => el.contains(e.target as Node) && setGhostOff(true)
    document.addEventListener('pointerdown', off, true)
    return () => document.removeEventListener('pointerdown', off, true)
  }, [n.ghost, state.anchor])

  const box = useBox(state.anchor, shown)
  const card = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(180)
  const drawn = shown && (!n.anchors.length || !!box)
  useLayoutEffect(() => {
    const el = card.current
    if (!drawn || !el) return
    const measure = () => setCardH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [drawn])
  const next = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (shown) next.current?.focus({ preventScroll: true })
  }, [shown])

  if (!drawn) return null
  const vp = viewport()
  const place = placeNote(box, cardH, vp, mobile, n)
  const dots = dotCount(notes)
  const pad = n.round ? 10 : 4

  return (
    <Float>
      <div className="kf-tour" data-tour-ui>
        {box ? (
          <span
            className="kf-tour-spot"
            aria-hidden
            style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, borderRadius: n.round ? '50%' : mobile ? 4 : 8 }}
          />
        ) : (
          <span className="kf-tour-dim" aria-hidden />
        )}
        {box && place.stem && (
          <span className="kf-tour-stem" aria-hidden data-dot={place.stem.dot} style={{ left: place.stem.x, top: place.stem.top, height: place.stem.height }} />
        )}
        {n.ghost && box && state.anchor && !ghostOff && <Ghost row={state.anchor} box={box} motion={motion} />}
        {n.closing && <img className="kf-tour-bloom" src={n.img} alt="" style={{ left: place.left + place.width / 2 - 60, top: place.top - 104 }} />}
        <div
          ref={card}
          className="kf-tour-note"
          role="dialog"
          aria-label={n.closing ? 'Garden note, done' : `Garden note ${at + 1} of ${dots}`}
          data-note={n.id}
          style={{ left: place.left, top: place.top, width: place.width, transform: `rotate(${n.last && !mobile ? 0.5 : n.closing ? -0.4 : -0.6}deg)` }}
        >
          <span className="kf-tour-tape" aria-hidden />
          {n.img && !n.closing && <img className="kf-tour-img" src={n.img} alt="" />}
          <div className="kf-tour-cap">{n.closing ? 'Garden note · done' : `Garden note · ${at + 1} of ${dots}`}</div>
          <div className="kf-tour-line">
            {n.id === 'keys' && <span className="kf-tour-key">?</span>}
            <span>{n.line}</span>
          </div>
          <div className="kf-tour-sub">{n.sub}</div>
          <div className="kf-tour-foot">
            <span className="kf-tour-dots" role="img" aria-label={`Note ${Math.min(at + 1, dots)} of ${dots}`}>
              {Array.from({ length: dots }, (_, i) => (
                <span key={i} data-state={n.closing || i < at ? 'done' : i === at ? 'now' : 'later'} />
              ))}
            </span>
            <span style={{ flex: 1 }} />
            {!n.last && (
              <button type="button" className="kf-tour-skip" onClick={() => tourEvent('skip', count)}>
                Skip
              </button>
            )}
            <button ref={next} type="button" className="kf-tour-next" onClick={() => tourEvent(n.last ? 'done' : 'next', count)}>
              <span>{n.last ? 'Done' : 'Next'}</span>
            </button>
          </div>
        </div>
      </div>
    </Float>
  )
}

/** Where the note sits: beside its anchor on a desktop when there's room (the design's 14g), else
 * below it, else above; a dashed stem with a terra dot points at the lit thing. */
function placeNote(box: Box | null, cardH: number, vp: { w: number; h: number }, mobile: boolean, n: TourNote) {
  const width = mobile ? Math.min(vp.w - 40, 420) : n.last ? 340 : 330
  const clampX = (x: number) => Math.max(16, Math.min(x, vp.w - width - 16))
  const clampY = (y: number) => Math.max(16, Math.min(y, vp.h - cardH - 16))
  if (!box) {
    // The closing card: phone, middle of the screen under its bloom; desktop, bottom-right.
    return mobile ? { left: (vp.w - width) / 2, top: Math.round(vp.h * 0.38), width, stem: null } : { left: vp.w - width - 28, top: vp.h - cardH - 28, width, stem: null }
  }
  const gap = 56
  if (!mobile && box.x + box.w + 24 + width <= vp.w - 16) {
    return { left: box.x + box.w + 24, top: clampY(box.y + Math.min(32, box.h / 2) - 24), width, stem: null }
  }
  const left = mobile ? (vp.w - width) / 2 : clampX(box.x + box.w / 2 - width / 2)
  const cx = Math.max(left + 28, Math.min(box.x + box.w / 2, left + width - 28))
  const below = box.y + box.h + gap + cardH <= vp.h - (mobile ? 80 : 16)
  if (below) {
    const top = box.y + box.h + gap
    return { left, top, width, stem: { x: cx, top: box.y + box.h + 6, height: gap - 6, dot: 'top' } }
  }
  const top = Math.max(16, box.y - gap - cardH)
  return { left, top, width, stem: { x: cx, top: top + cardH, height: Math.max(0, box.y - 6 - (top + cardH)), dot: 'bottom' } }
}

/** 14c: the lit row, copied into the overlay, swiping right then left every 5 s over its Tomorrow /
 * Delete underlay, with a ghost fingertip. The real row underneath is untouched. Reduced motion:
 * a still arrow instead. */
function Ghost({ row, box, motion }: { row: HTMLElement; box: Box; motion: boolean }) {
  const slot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!motion || !slot.current) return
    const src = row.querySelector('.kf-swipe-fg') ?? row
    const copy = src.cloneNode(true) as HTMLElement
    for (const el of [copy, ...copy.querySelectorAll<HTMLElement>('[id],[data-tour]')]) {
      el.removeAttribute('id')
      el.removeAttribute('data-tour')
    }
    copy.style.transform = 'none'
    // Today's row styles live under .tp; the copy keeps them.
    const wrap = document.createElement('div')
    if (row.closest('.tp')) wrap.className = 'tp kf-tour-ghost-tp'
    wrap.append(copy)
    slot.current.replaceChildren(wrap)
    slot.current.style.background = paperOf(row)
  }, [row, motion])
  if (!motion) {
    return (
      <span className="kf-tour-arrow" aria-hidden style={{ left: box.x + box.w / 2 - 36, top: box.y + box.h / 2 - 16 }}>
        <svg width="56" height="20" viewBox="0 0 56 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h48M10 4 4 10l6 6M46 4l6 6-6 6" />
        </svg>
      </span>
    )
  }
  return (
    <div className="kf-tour-ghost" aria-hidden inert style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <div className="kf-tour-under">
        <span className="is-right">
          <Icon name="tomorrow" size={20} />
          Tomorrow
        </span>
        <span className="is-left">
          Delete
          <Icon name="delete" size={20} />
        </span>
      </div>
      <div className="kf-tour-ghost-row">
        <div ref={slot} className="kf-tour-ghost-copy" />
        <span className="kf-tour-finger" />
      </div>
    </div>
  )
}

/** The first solid background behind a row, so its copy is as opaque as the real thing. */
function paperOf(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg
  }
  return 'var(--paper-parchment)'
}

// ── the hints ──

/** One at a time, once each: after the page has settled (1.5 s) on the first thing of its kind in
 * view. Gone on ×, on touching any of them (a swipe, a held block, filing), on leaving the page or
 * when a sheet opens over it. Seen the moment it shows, so it never comes back. */
function Hints({ seen, mobile }: { seen: ReadonlySet<string>; mobile: boolean }) {
  const { pathname } = useLocation()
  const [shown, setShown] = useState<{ hint: Hint; el: HTMLElement } | null>(null)
  const touch = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches, [])

  useEffect(() => setShown(null), [pathname])

  useEffect(() => {
    if (shown) return
    let cand: Hint | null = null
    let since = 0
    const t = window.setInterval(() => {
      const h = busy(false) ? null : pickHint(HINTS, { seen, touch, tourRunning: false, path: pathname, has: (name) => !!findAnchor(name, true) })
      if (h !== cand) {
        cand = h
        since = Date.now()
        return
      }
      const el = h && Date.now() - since >= 1500 ? findAnchor(h.anchor, true) : null
      if (h && el) {
        markSeen(h.key)
        setShown({ hint: h, el })
      }
    }, 500)
    return () => window.clearInterval(t)
  }, [shown, seen, touch, pathname])

  useEffect(() => {
    if (!shown) return
    const sel = `[data-tour="${shown.hint.anchor}"]`
    const off = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(sel)) setShown(null)
    }
    const t = window.setInterval(() => {
      if (!shown.el.isConnected || busy(false)) setShown(null)
    }, 250)
    document.addEventListener('pointerdown', off, true)
    return () => {
      document.removeEventListener('pointerdown', off, true)
      window.clearInterval(t)
    }
  }, [shown])

  const box = useBox(shown?.el ?? null, !!shown)
  if (!shown || !box) return null
  const vp = viewport()
  const width = mobile ? vp.w - 32 : Math.min(420, Math.max(300, box.w))
  const left = mobile ? 16 : Math.max(16, Math.min(box.x, vp.w - width - 16))
  const below = box.y + box.h + 84 <= vp.h - (mobile ? 80 : 16)
  const caret = Math.max(18, Math.min(box.x + box.w / 2 - left - 6, width - 30))
  // On a phone the calendar hint docks above the tab bar: anchored under a block, it sat on the blocks
  // around it (and the "+N" chip) for as long as it stayed open.
  const docked = mobile && shown.hint.key === 'hint:calendar'
  const style: CSSProperties = docked
    ? { left, width, bottom: 'calc(var(--tabbar-h) + var(--tabbar-inset) + 12px)' }
    : below ? { left, width, top: box.y + box.h + 12 } : { left, width, bottom: vp.h - box.y + 12 }
  return (
    <Float>
      <div className="kf-hint" data-tour-ui data-hint={shown.hint.key} data-below={below || undefined} role="note" style={style}>
        {!docked && <span className="kf-hint-caret" aria-hidden style={{ left: caret }} />}
        <img src="/ds/assets/clover/seedling.png" alt="" />
        <span className="kf-hint-line">{mobile ? shown.hint.line.phone : shown.hint.line.desktop}</span>
        <button type="button" className="kf-hint-x" aria-label="Got it" onClick={() => setShown(null)}>
          <Icon name="close" size={20} />
        </button>
      </div>
    </Float>
  )
}
